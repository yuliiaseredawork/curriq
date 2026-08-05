import * as fs from "fs";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as eventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as customResources from "aws-cdk-lib/custom-resources";

function latestMigrationVersion(): string {
  const migrationDirectory = path.join(__dirname, "../../backend/migrations");
  const versions = fs
    .readdirSync(migrationDirectory)
    .map((fileName) => /^(\d{3})_.*\.sql$/.exec(fileName)?.[1])
    .filter((version): version is string => Boolean(version))
    .sort();

  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(`No versioned migrations found in ${migrationDirectory}`);
  }
  return latest;
}

interface Props extends cdk.StackProps {
  vpc: ec2.Vpc;
  rawBucket: s3.Bucket;
  processedBucket: s3.Bucket;
  dbProxy: rds.DatabaseProxy;
  dbSecret: sm.ISecret;
  focusAreasTable: ddb.Table;
  mistakesTable: ddb.Table;
  jobStateTable: ddb.Table;
  providerSecret: sm.ISecret;
  embeddingCacheTable: ddb.Table;
  analyticsTable: ddb.Table;
  usersTable: ddb.Table;
}

function lambdaLogGroup(scope: Construct, id: string) {
  return new logs.LogGroup(scope, id, {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
  });
}

export class IngestStack extends cdk.Stack {
  public readonly embedTranscriptFn: lambdaNode.NodejsFunction;
  public readonly processTranscriptFn: lambdaNode.NodejsFunction;
  public readonly searchChunksFn: lambdaNode.NodejsFunction;
  public readonly courseMetadataFn: lambdaNode.NodejsFunction;
  public readonly generateCourseFn: lambdaNode.NodejsFunction;
  public readonly generateChapterQuizFn: lambdaNode.NodejsFunction;
  public readonly generateCourseFromPdfFn: lambdaNode.NodejsFunction;
  public readonly generateRemediationFn: lambdaNode.NodejsFunction;
  public readonly courseJobsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const courseJobsDlq = new sqs.Queue(this, "CourseJobsDlq", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
    });
    this.courseJobsQueue = new sqs.Queue(this, "CourseJobs", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: { queue: courseJobsDlq, maxReceiveCount: 4 },
    });
    const quizJobsDlq = new sqs.Queue(this, "QuizJobsDlq", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.embedTranscriptFn = new lambdaNode.NodejsFunction(
      this,
      "EmbedTranscriptFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/ingest/embed-transcript.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(120),
        reservedConcurrentExecutions: 10,
        logGroup: lambdaLogGroup(this, "EmbedTranscriptLogs"),
        environment: {
          RAW_BUCKET: props.rawBucket.bucketName,
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
          EMBEDDING_CACHE_TABLE: props.embeddingCacheTable.tableName,
        },
      },
    );

    props.rawBucket.grantRead(this.embedTranscriptFn);
    props.processedBucket.grantWrite(this.embedTranscriptFn);

    this.processTranscriptFn = new lambdaNode.NodejsFunction(
      this,
      "ProcessTranscriptFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/ingest/process-transcript.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(60),
        reservedConcurrentExecutions: 10,
        logGroup: lambdaLogGroup(this, "ProcessTranscriptLogs"),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        environment: {
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          DB_SECRET_ARN: props.dbSecret.secretArn,
          DB_PROXY_ENDPOINT: props.dbProxy.endpoint,
        },
      },
    );

    this.searchChunksFn = new lambdaNode.NodejsFunction(
      this,
      "SearchChunksFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/retrieval/search-chunks.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(30),
        reservedConcurrentExecutions: 20,
        logGroup: lambdaLogGroup(this, "SearchChunksLogs"),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        environment: {
          DB_SECRET_ARN: props.dbSecret.secretArn,
          DB_PROXY_ENDPOINT: props.dbProxy.endpoint,
        },
      },
    );

    this.courseMetadataFn = new lambdaNode.NodejsFunction(
      this,
      "CourseMetadataFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/courses/course-metadata.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(30),
        reservedConcurrentExecutions: 10,
        logGroup: lambdaLogGroup(this, "CourseMetadataLogs"),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        environment: {
          DB_SECRET_ARN: props.dbSecret.secretArn,
          DB_PROXY_ENDPOINT: props.dbProxy.endpoint,
        },
      },
    );

    const migrationFn = new lambdaNode.NodejsFunction(this, "MigrationFn", {
      entry: path.join(
        __dirname,
        "../../backend/src/migrations/migration-runner.ts",
      ),
      projectRoot: path.join(__dirname, "../.."),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      reservedConcurrentExecutions: 1,
      logGroup: lambdaLogGroup(this, "MigrationLogs"),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        SERVICE_NAME: "curriq-migrations",
        DB_SECRET_ARN: props.dbSecret.secretArn,
        DB_PROXY_ENDPOINT: props.dbProxy.endpoint,
      },
    });
    props.dbSecret.grantRead(migrationFn);
    const migrationProvider = new customResources.Provider(
      this,
      "MigrationProvider",
      { onEventHandler: migrationFn },
    );
    const migrationsResource = new cdk.CustomResource(
      this,
      "DatabaseMigrations",
      {
        serviceToken: migrationProvider.serviceToken,
        properties: { MigrationVersion: latestMigrationVersion() },
      },
    );
    migrationsResource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    this.generateChapterQuizFn = new lambdaNode.NodejsFunction(
      this,
      "GenerateChapterQuizFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/courses/generate-chapter-quiz.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        reservedConcurrentExecutions: 10,
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(2),
        onFailure: new destinations.SqsDestination(quizJobsDlq),
        logGroup: lambdaLogGroup(this, "GenerateChapterQuizLogs"),
        environment: {
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
          EMBEDDING_CACHE_TABLE: props.embeddingCacheTable.tableName,
          USERS_TABLE: props.usersTable.tableName,
          SEARCH_CHUNKS_FUNCTION_NAME: this.searchChunksFn.functionName,
        },
      },
    );

    props.processedBucket.grantReadWrite(this.generateChapterQuizFn);
    this.searchChunksFn.grantInvoke(this.generateChapterQuizFn);

    this.generateCourseFn = new lambdaNode.NodejsFunction(
      this,
      "GenerateCourseFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/courses/generate-course.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(10),
        reservedConcurrentExecutions: 3,
        logGroup: lambdaLogGroup(this, "GenerateCourseLogs"),
        environment: {
          RAW_BUCKET: props.rawBucket.bucketName,
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
          EMBEDDING_CACHE_TABLE: props.embeddingCacheTable.tableName,
          SEARCH_CHUNKS_FUNCTION_NAME: this.searchChunksFn.functionName,
          EMBED_TRANSCRIPT_FUNCTION_NAME: this.embedTranscriptFn.functionName,
          PROCESS_TRANSCRIPT_FUNCTION_NAME:
            this.processTranscriptFn.functionName,
          COURSE_METADATA_FUNCTION_NAME: this.courseMetadataFn.functionName,
          GENERATE_CHAPTER_QUIZ_FUNCTION_NAME:
            this.generateChapterQuizFn.functionName,
          JOB_STATE_TABLE: props.jobStateTable.tableName,
          ANALYTICS_TABLE: props.analyticsTable.tableName,
          USERS_TABLE: props.usersTable.tableName,
        },
      },
    );

    props.rawBucket.grantReadWrite(this.generateCourseFn);
    props.processedBucket.grantReadWrite(this.generateCourseFn);

    this.searchChunksFn.grantInvoke(this.generateCourseFn);
    this.embedTranscriptFn.grantInvoke(this.generateCourseFn);
    this.processTranscriptFn.grantInvoke(this.generateCourseFn);
    this.courseMetadataFn.grantInvoke(this.generateCourseFn);
    this.generateChapterQuizFn.grantInvoke(this.generateCourseFn);

    // PDF course generation (non-VPC: needs internet for OpenAI/Anthropic;
    // delegates the in-VPC pgvector insert to ProcessTranscriptFn).
    this.generateCourseFromPdfFn = new lambdaNode.NodejsFunction(
      this,
      "GenerateCourseFromPdfFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/courses/generate-course-from-pdf.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(10),
        reservedConcurrentExecutions: 3,
        logGroup: lambdaLogGroup(this, "GenerateCourseFromPdfLogs"),
        environment: {
          RAW_BUCKET: props.rawBucket.bucketName,
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
          EMBEDDING_CACHE_TABLE: props.embeddingCacheTable.tableName,
          MAX_PDF_BYTES: String(20 * 1024 * 1024),
          MAX_PDF_PAGES: "300",
          MAX_PDF_TEXT_CHARS: "2000000",
          SEARCH_CHUNKS_FUNCTION_NAME: this.searchChunksFn.functionName,
          PROCESS_TRANSCRIPT_FUNCTION_NAME:
            this.processTranscriptFn.functionName,
          COURSE_METADATA_FUNCTION_NAME: this.courseMetadataFn.functionName,
          GENERATE_CHAPTER_QUIZ_FUNCTION_NAME:
            this.generateChapterQuizFn.functionName,
          JOB_STATE_TABLE: props.jobStateTable.tableName,
          ANALYTICS_TABLE: props.analyticsTable.tableName,
          USERS_TABLE: props.usersTable.tableName,
        },
      },
    );

    props.rawBucket.grantRead(this.generateCourseFromPdfFn);
    props.processedBucket.grantReadWrite(this.generateCourseFromPdfFn);
    this.searchChunksFn.grantInvoke(this.generateCourseFromPdfFn);
    this.processTranscriptFn.grantInvoke(this.generateCourseFromPdfFn);
    this.courseMetadataFn.grantInvoke(this.generateCourseFromPdfFn);
    this.generateChapterQuizFn.grantInvoke(this.generateCourseFromPdfFn);
    props.jobStateTable.grantReadWriteData(this.generateCourseFn);
    props.jobStateTable.grantReadWriteData(this.generateCourseFromPdfFn);
    props.analyticsTable.grantWriteData(this.generateCourseFn);
    props.analyticsTable.grantWriteData(this.generateCourseFromPdfFn);

    // Focus Areas V2: pre-generate remediation question sets (non-VPC).
    this.generateRemediationFn = new lambdaNode.NodejsFunction(
      this,
      "GenerateRemediationFn",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/courses/generate-remediation.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        reservedConcurrentExecutions: 5,
        logGroup: lambdaLogGroup(this, "GenerateRemediationLogs"),
        environment: {
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
          EMBEDDING_CACHE_TABLE: props.embeddingCacheTable.tableName,
          SEARCH_CHUNKS_FUNCTION_NAME: this.searchChunksFn.functionName,
          FOCUS_AREAS_TABLE: props.focusAreasTable.tableName,
          MISTAKES_TABLE: props.mistakesTable.tableName,
          USERS_TABLE: props.usersTable.tableName,
        },
      },
    );

    props.processedBucket.grantReadWrite(this.generateRemediationFn);
    this.searchChunksFn.grantInvoke(this.generateRemediationFn);
    props.focusAreasTable.grantReadWriteData(this.generateRemediationFn);
    props.mistakesTable.grantReadData(this.generateRemediationFn);

    for (const fn of [
      this.generateChapterQuizFn,
      this.generateCourseFn,
      this.generateCourseFromPdfFn,
      this.generateRemediationFn,
    ]) {
      props.usersTable.grantReadData(fn);
    }

    for (const fn of [
      this.embedTranscriptFn,
      this.generateChapterQuizFn,
      this.generateCourseFn,
      this.generateCourseFromPdfFn,
      this.generateRemediationFn,
    ]) {
      props.providerSecret.grantRead(fn);
      props.embeddingCacheTable.grantReadWriteData(fn);
    }

    props.dbSecret.grantRead(this.courseMetadataFn);

    props.dbSecret.grantRead(this.searchChunksFn);

    props.processedBucket.grantRead(this.processTranscriptFn);
    props.dbSecret.grantRead(this.processTranscriptFn);

    const courseJobWorker = new lambdaNode.NodejsFunction(
      this,
      "CourseJobWorker",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/jobs/course-job-worker.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 256,
        timeout: cdk.Duration.minutes(15),
        reservedConcurrentExecutions: 3,
        logGroup: lambdaLogGroup(this, "CourseJobWorkerLogs"),
        environment: {
          GENERATE_COURSE_FUNCTION_NAME: this.generateCourseFn.functionName,
          GENERATE_COURSE_FROM_PDF_FUNCTION_NAME:
            this.generateCourseFromPdfFn.functionName,
          COURSE_METADATA_FUNCTION_NAME: this.courseMetadataFn.functionName,
          COURSE_JOBS_QUEUE_URL: this.courseJobsQueue.queueUrl,
        },
      },
    );
    this.generateCourseFn.grantInvoke(courseJobWorker);
    this.generateCourseFromPdfFn.grantInvoke(courseJobWorker);
    this.courseMetadataFn.grantInvoke(courseJobWorker);
    this.courseJobsQueue.grantConsumeMessages(courseJobWorker);
    courseJobWorker.addEventSource(
      new eventSources.SqsEventSource(this.courseJobsQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    );

    const recoveryFn = new lambdaNode.NodejsFunction(
      this,
      "StuckCourseRecovery",
      {
        entry: path.join(
          __dirname,
          "../../backend/src/jobs/stuck-course-recovery.ts",
        ),
        projectRoot: path.join(__dirname, "../.."),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        memorySize: 256,
        timeout: cdk.Duration.minutes(2),
        reservedConcurrentExecutions: 1,
        logGroup: lambdaLogGroup(this, "StuckCourseRecoveryLogs"),
        environment: {
          COURSE_METADATA_FUNCTION_NAME: this.courseMetadataFn.functionName,
          COURSE_JOBS_QUEUE_URL: this.courseJobsQueue.queueUrl,
        },
      },
    );
    this.courseMetadataFn.grantInvoke(recoveryFn);
    this.courseJobsQueue.grantSendMessages(recoveryFn);
    new events.Rule(this, "StuckCourseRecoverySchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
      targets: [
        new targets.LambdaFunction(recoveryFn, {
          deadLetterQueue: courseJobsDlq,
        }),
      ],
    });

    const ingestAlerts = new sns.Topic(this, "IngestOperationalAlerts");
    if (process.env.ALERT_EMAIL) {
      ingestAlerts.addSubscription(
        new subscriptions.EmailSubscription(process.env.ALERT_EMAIL),
      );
    }
    const courseJobsDlqAlarm = new cloudwatch.Alarm(
      this,
      "CourseJobsDlqAlarm",
      {
        metric: courseJobsDlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );
    const quizJobsDlqAlarm = new cloudwatch.Alarm(this, "QuizJobsDlqAlarm", {
      metric: quizJobsDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    for (const alarm of [courseJobsDlqAlarm, quizJobsDlqAlarm]) {
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(ingestAlerts));
    }
  }
}
