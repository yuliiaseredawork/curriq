import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";

interface Props extends cdk.StackProps {
  rawBucket: s3.Bucket;
  processedBucket: s3.Bucket;
  dbSecret: sm.ISecret;
  searchChunksFn: lambda.IFunction;
  progressTable: ddb.Table;
  mistakesTable: ddb.Table;
  focusAreasTable: ddb.Table;
  usageTable: ddb.Table;
  providerSecret: sm.ISecret;
  courseJobsQueue: sqs.Queue;
  allowedOrigins: string[];
  stage: string;
  embedTranscriptFn: lambda.IFunction;
  processTranscriptFn: lambda.IFunction;
  courseMetadataFn: lambda.IFunction;
  generateChapterQuizFn: lambda.IFunction;
  generateRemediationFn: lambda.IFunction;
  userPoolId: string;
  userPoolClientId: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const apiFn = new lambdaNode.NodejsFunction(this, "ApiFn", {
      entry: path.join(__dirname, "../../backend/src/api/index.ts"),
      projectRoot: path.join(__dirname, "../.."),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      reservedConcurrentExecutions: 20,
      logGroup: new logs.LogGroup(this, "ApiFunctionLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }),
      bundling: {
        externalModules: [],
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        SERVICE_NAME: "curriq-api",
        RAW_BUCKET: props.rawBucket.bucketName,
        DB_SECRET_ARN: props.dbSecret.secretArn,
        PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
        SEARCH_CHUNKS_FUNCTION_NAME: props.searchChunksFn.functionName,
        PROCESSED_BUCKET: props.processedBucket.bucketName,
        PROGRESS_TABLE: props.progressTable.tableName,
        MISTAKES_TABLE: props.mistakesTable.tableName,
        FOCUS_AREAS_TABLE: props.focusAreasTable.tableName,
        USAGE_TABLE: props.usageTable.tableName,
        COURSE_JOBS_QUEUE_URL: props.courseJobsQueue.queueUrl,
        ALLOWED_ORIGINS: props.allowedOrigins.join(","),
        REQUESTS_PER_5_MINUTES: "300",
        DAILY_AI_REQUESTS_PER_USER: "50",
        MAX_PDF_BYTES: String(20 * 1024 * 1024),
        REQUIRE_MALWARE_SCAN: "true",
        GENERATE_REMEDIATION_FUNCTION_NAME:
          props.generateRemediationFn.functionName,
        EMBED_TRANSCRIPT_FUNCTION_NAME: props.embedTranscriptFn.functionName,
        PROCESS_TRANSCRIPT_FUNCTION_NAME:
          props.processTranscriptFn.functionName,
        COURSE_METADATA_FUNCTION_NAME: props.courseMetadataFn.functionName,
        GENERATE_CHAPTER_QUIZ_FUNCTION_NAME:
          props.generateChapterQuizFn.functionName,
        CLERK_JWT_KEY: process.env.CLERK_JWT_KEY ?? "",
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: props.userPoolClientId,
        // Provider credentials are loaded from PROVIDER_SECRET_ARN at runtime.
        // Only non-secret notification configuration is injected here.
        EMAIL_FROM: process.env.EMAIL_FROM ?? "",
        APP_URL:
          process.env.APP_URL ??
          props.allowedOrigins[0] ??
          "https://curriq.app",
      },
    });

    props.rawBucket.grantReadWrite(apiFn);
    props.dbSecret.grantRead(apiFn);
    props.searchChunksFn.grantInvoke(apiFn);
    props.processedBucket.grantReadWrite(apiFn);
    props.progressTable.grantReadWriteData(apiFn);
    props.mistakesTable.grantReadWriteData(apiFn);
    props.focusAreasTable.grantReadWriteData(apiFn);
    props.usageTable.grantReadWriteData(apiFn);
    props.providerSecret.grantRead(apiFn);
    props.courseJobsQueue.grantSendMessages(apiFn);
    props.embedTranscriptFn.grantInvoke(apiFn);
    props.processTranscriptFn.grantInvoke(apiFn);
    props.courseMetadataFn.grantInvoke(apiFn);
    props.generateChapterQuizFn.grantInvoke(apiFn);
    props.generateRemediationFn.grantInvoke(apiFn);

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: props.allowedOrigins,
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["content-type", "authorization", "x-correlation-id"],
        exposeHeaders: ["x-correlation-id"],
      },
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigw.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration(
        "ApiIntegration",
        apiFn,
      ),
    });

    const accessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const stage = httpApi.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = {
      detailedMetricsEnabled: true,
      throttlingBurstLimit: 50,
      throttlingRateLimit: 25,
    };
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        routeKey: "$context.routeKey",
        status: "$context.status",
        responseLatency: "$context.responseLatency",
        integrationError: "$context.integrationErrorMessage",
      }),
    };

    const alerts = new sns.Topic(this, "OperationalAlerts");
    if (process.env.ALERT_EMAIL) {
      alerts.addSubscription(
        new subscriptions.EmailSubscription(process.env.ALERT_EMAIL),
      );
    }
    const apiErrors = new cloudwatch.Alarm(this, "ApiErrorsAlarm", {
      metric: apiFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const apiLatency = new cloudwatch.Alarm(this, "ApiLatencyAlarm", {
      metric: apiFn.metricDuration({
        statistic: "p95",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const aiCost = new cloudwatch.Alarm(this, "MonthlyAiCostAlarm", {
      metric: new cloudwatch.Metric({
        namespace: "Curriq",
        metricName: "AiEstimatedCostUsd",
        statistic: "Sum",
        period: cdk.Duration.days(30),
      }),
      threshold: Number(process.env.MONTHLY_AI_COST_ALERT_USD ?? 100),
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    for (const alarm of [apiErrors, apiLatency, aiCost]) {
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(alerts));
    }

    new cloudwatch.Dashboard(this, "OperationsDashboard", {
      dashboardName: `curriq-${props.stage}-operations`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: "API latency and errors",
            left: [apiFn.metricDuration({ statistic: "p95" })],
            right: [apiFn.metricErrors(), apiFn.metricThrottles()],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "AI usage and estimated cost",
            left: [
              new cloudwatch.Metric({
                namespace: "Curriq",
                metricName: "AiInputTokens",
                statistic: "Sum",
              }),
            ],
            right: [
              new cloudwatch.Metric({
                namespace: "Curriq",
                metricName: "AiEstimatedCostUsd",
                statistic: "Sum",
              }),
            ],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Durable course-job backlog",
            left: [
              props.courseJobsQueue.metricApproximateNumberOfMessagesVisible(),
            ],
            right: [
              props.courseJobsQueue.metricApproximateAgeOfOldestMessage(),
            ],
          }),
        ],
      ],
    });

    httpApi.addRoutes({
      path: "/",
      methods: [apigw.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration(
        "RootApiIntegration",
        apiFn,
      ),
    });

    // NOTE: no explicit '/courses' route — it (and all sub-paths like
    // /courses/:id/status, /quiz-status, /pdf/*) are served by the '/{proxy+}'
    // ANY integration above, and OPTIONS preflight is answered by API Gateway's
    // managed CORS. Keeping a separate explicit OPTIONS route here would be the
    // only path that forwards preflight to Lambda, so it is intentionally omitted.

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.url!,
    });
  }
}
