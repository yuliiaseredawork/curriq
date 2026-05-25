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

    props.dbSecret.grantRead(this.searchChunksFn);

    props.processedBucket.grantRead(this.processTranscriptFn);
    props.dbSecret.grantRead(this.processTranscriptFn);
  }
}