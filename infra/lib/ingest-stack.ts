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
  db: rds.DatabaseInstance;
  dbSecret: sm.ISecret;
}

export class IngestStack extends cdk.Stack {
  public readonly processTranscriptFn: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

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
          RAW_BUCKET: props.rawBucket.bucketName,
          DB_SECRET_ARN: props.dbSecret.secretArn,
        },
      },
    );

    props.rawBucket.grantRead(this.processTranscriptFn);
    props.dbSecret.grantRead(this.processTranscriptFn);
  }
}