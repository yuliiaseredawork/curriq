import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';

interface Props extends cdk.StackProps {
  vpc: ec2.Vpc;
  rawBucket: s3.Bucket;
  processedBucket: s3.Bucket;
  db: rds.DatabaseInstance;
  dbSecret: sm.ISecret;
}

export class IngestStack extends cdk.Stack {
  public readonly embedTranscriptFn: lambdaNode.NodejsFunction;
  public readonly processTranscriptFn: lambdaNode.NodejsFunction;
  public readonly searchChunksFn: lambdaNode.NodejsFunction;
  public readonly courseMetadataFn: lambdaNode.NodejsFunction;
  public readonly generateCourseFn: lambdaNode.NodejsFunction;
  public readonly generateChapterQuizFn: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.embedTranscriptFn = new lambdaNode.NodejsFunction(
      this,
      'EmbedTranscriptFn',
      {
        entry: path.join(__dirname, '../../backend/src/ingest/embed-transcript.ts'),
        projectRoot: path.join(__dirname, '../..'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(120),
        environment: {
          RAW_BUCKET: props.rawBucket.bucketName,
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
        },
      },
    );

    props.rawBucket.grantRead(this.embedTranscriptFn);
    props.processedBucket.grantWrite(this.embedTranscriptFn);

    this.processTranscriptFn = new lambdaNode.NodejsFunction(
      this,
      'ProcessTranscriptFn',
      {
        entry: path.join(__dirname, '../../backend/src/ingest/process-transcript.ts'),
        projectRoot: path.join(__dirname, '../..'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(60),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        environment: {
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          DB_SECRET_ARN: props.dbSecret.secretArn,
        },
      },
    );

    this.searchChunksFn = new lambdaNode.NodejsFunction(this, 'SearchChunksFn', {
      entry: path.join(__dirname, '../../backend/src/retrieval/search-chunks.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      environment: {
        DB_SECRET_ARN: props.dbSecret.secretArn,
      },
    });

    this.courseMetadataFn = new lambdaNode.NodejsFunction(this, 'CourseMetadataFn', {
      entry: path.join(__dirname, '../../backend/src/courses/course-metadata.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      environment: {
        DB_SECRET_ARN: props.dbSecret.secretArn,
      },
    });

    this.generateChapterQuizFn = new lambdaNode.NodejsFunction(
      this,
      'GenerateChapterQuizFn',
      {
        entry: path.join(__dirname, '../../backend/src/courses/generate-chapter-quiz.ts'),
        projectRoot: path.join(__dirname, '../..'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        environment: {
          PROCESSED_BUCKET: props.processedBucket.bucketName,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
          SEARCH_CHUNKS_FUNCTION_NAME: this.searchChunksFn.functionName,
        },
      },
    );

    props.processedBucket.grantReadWrite(this.generateChapterQuizFn);
    this.searchChunksFn.grantInvoke(this.generateChapterQuizFn);

    this.generateCourseFn = new lambdaNode.NodejsFunction(this, 'GenerateCourseFn', {
      entry: path.join(__dirname, '../../backend/src/courses/generate-course.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.minutes(10),
      environment: {
        RAW_BUCKET: props.rawBucket.bucketName,
        PROCESSED_BUCKET: props.processedBucket.bucketName,
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',
        SEARCHAPI_API_KEY: process.env.SEARCHAPI_API_KEY ?? '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
        SEARCH_CHUNKS_FUNCTION_NAME: this.searchChunksFn.functionName,
        EMBED_TRANSCRIPT_FUNCTION_NAME: this.embedTranscriptFn.functionName,
        PROCESS_TRANSCRIPT_FUNCTION_NAME: this.processTranscriptFn.functionName,
        COURSE_METADATA_FUNCTION_NAME: this.courseMetadataFn.functionName,
        GENERATE_CHAPTER_QUIZ_FUNCTION_NAME: this.generateChapterQuizFn.functionName,
      },
    });

    props.rawBucket.grantReadWrite(this.generateCourseFn);
    props.processedBucket.grantReadWrite(this.generateCourseFn);

    this.searchChunksFn.grantInvoke(this.generateCourseFn);
    this.embedTranscriptFn.grantInvoke(this.generateCourseFn);
    this.processTranscriptFn.grantInvoke(this.generateCourseFn);
    this.courseMetadataFn.grantInvoke(this.generateCourseFn);
    this.generateChapterQuizFn.grantInvoke(this.generateCourseFn);

    props.dbSecret.grantRead(this.courseMetadataFn);

    props.dbSecret.grantRead(this.searchChunksFn);

    props.processedBucket.grantRead(this.processTranscriptFn);
    props.dbSecret.grantRead(this.processTranscriptFn);
  }
}