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

interface Props extends cdk.StackProps {
  rawBucket: s3.Bucket;
  dbSecret: sm.ISecret;
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
      timeout: cdk.Duration.seconds(90),
      bundling: {
        externalModules: [],
      },
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        RAW_BUCKET: props.rawBucket.bucketName,
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',
        SEARCHAPI_API_KEY: process.env.SEARCHAPI_API_KEY ?? '',
        DB_SECRET_ARN: props.dbSecret.secretArn,
      },
    });

    props.rawBucket.grantReadWrite(apiFn);
    props.dbSecret.grantRead(apiFn);

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

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url!,
    });
  }
}