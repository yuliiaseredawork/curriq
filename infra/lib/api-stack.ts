import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';

interface Props extends cdk.StackProps {
  rawBucket: s3.Bucket;
  processedBucket: s3.Bucket;
  dbSecret: sm.ISecret;
  searchChunksFn: lambda.IFunction;
  progressTable: ddb.Table;
  mistakesTable: ddb.Table;
  focusAreasTable: ddb.Table;
  embedTranscriptFn: lambda.IFunction;
  processTranscriptFn: lambda.IFunction;
  courseMetadataFn: lambda.IFunction;
  generateCourseFn: lambda.IFunction;
  generateChapterQuizFn: lambda.IFunction;
  generateCourseFromPdfFn: lambda.IFunction;
  generateRemediationFn: lambda.IFunction;
  userPoolId: string;
  userPoolClientId: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const apiFn = new lambdaNode.NodejsFunction(this, 'ApiFn', {
      entry: path.join(__dirname, '../../backend/src/api/index.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(120),
      bundling: {
        externalModules: [],
      },
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        RAW_BUCKET: props.rawBucket.bucketName,
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',
        SEARCHAPI_API_KEY: process.env.SEARCHAPI_API_KEY ?? '',
        DB_SECRET_ARN: props.dbSecret.secretArn,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
        SEARCH_CHUNKS_FUNCTION_NAME: props.searchChunksFn.functionName,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
        PROCESSED_BUCKET: props.processedBucket.bucketName,
        PROGRESS_TABLE: props.progressTable.tableName,
        MISTAKES_TABLE: props.mistakesTable.tableName,
        FOCUS_AREAS_TABLE: props.focusAreasTable.tableName,
        GENERATE_REMEDIATION_FUNCTION_NAME: props.generateRemediationFn.functionName,
        EMBED_TRANSCRIPT_FUNCTION_NAME: props.embedTranscriptFn.functionName,
        PROCESS_TRANSCRIPT_FUNCTION_NAME: props.processTranscriptFn.functionName,
        COURSE_METADATA_FUNCTION_NAME: props.courseMetadataFn.functionName,
        GENERATE_COURSE_FUNCTION_NAME: props.generateCourseFn.functionName,
        GENERATE_CHAPTER_QUIZ_FUNCTION_NAME: props.generateChapterQuizFn.functionName,
        GENERATE_COURSE_FROM_PDF_FUNCTION_NAME: props.generateCourseFromPdfFn.functionName,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? '',
        CLERK_JWT_KEY: process.env.CLERK_JWT_KEY ?? '',
        COGNITO_USER_POOL_ID: props.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: props.userPoolClientId,
      },
    });

    props.rawBucket.grantReadWrite(apiFn);
    props.dbSecret.grantRead(apiFn);
    props.searchChunksFn.grantInvoke(apiFn);
    props.processedBucket.grantReadWrite(apiFn);
    props.progressTable.grantReadWriteData(apiFn);
    props.mistakesTable.grantReadWriteData(apiFn);
    props.focusAreasTable.grantReadWriteData(apiFn);
    props.embedTranscriptFn.grantInvoke(apiFn);
    props.processTranscriptFn.grantInvoke(apiFn);
    props.courseMetadataFn.grantInvoke(apiFn);
    props.generateCourseFn.grantInvoke(apiFn);
    props.generateChapterQuizFn.grantInvoke(apiFn);
    props.generateCourseFromPdfFn.grantInvoke(apiFn);
    props.generateRemediationFn.grantInvoke(apiFn);

    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type', 'authorization'],
      },
    });

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration('ApiIntegration', apiFn),
    });

    httpApi.addRoutes({
      path: '/',
      methods: [apigw.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration('RootApiIntegration', apiFn),
    });

    // NOTE: no explicit '/courses' route — it (and all sub-paths like
    // /courses/:id/status, /quiz-status, /pdf/*) are served by the '/{proxy+}'
    // ANY integration above, and OPTIONS preflight is answered by API Gateway's
    // managed CORS. Keeping a separate explicit OPTIONS route here would be the
    // only path that forwards preflight to Lambda, so it is intentionally omitted.

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url!,
    });
  }
}