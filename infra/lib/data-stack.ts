import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';

interface Props extends cdk.StackProps {
  vpc: ec2.Vpc;
  bastion: ec2.Instance;
}

export class DataStack extends cdk.Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly dbSecret: sm.ISecret;
  public readonly rawBucket: s3.Bucket;
  public readonly processedBucket: s3.Bucket;

  public readonly usersTable: ddb.Table;
  public readonly coursesTable: ddb.Table;
  public readonly chaptersTable: ddb.Table;
  public readonly quizzesTable: ddb.Table;
  public readonly progressTable: ddb.Table;
  public readonly mistakesTable: ddb.Table;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.db = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      allocatedStorage: 20,
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      databaseName: 'courseforge',
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    this.db.connections.allowFrom(
      props.bastion,
      ec2.Port.tcp(5432),
      'Bastion to Postgres',
    );

    this.dbSecret = this.db.secret!;

    this.db.connections.allowFrom(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow Postgres access from VPC',
    );

    this.rawBucket = new s3.Bucket(this, 'Raw', {
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Allow browser PUT to presigned URLs (PDF upload from the frontend).
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    this.processedBucket = new s3.Bucket(this, 'Processed', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    this.usersTable = new ddb.Table(this, 'Users', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    this.coursesTable = new ddb.Table(this, 'Courses', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    this.coursesTable.addGlobalSecondaryIndex({
      indexName: 'byCourseId',
      partitionKey: { name: 'courseId', type: ddb.AttributeType.STRING },
    });

    this.chaptersTable = new ddb.Table(this, 'Chapters', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    this.quizzesTable = new ddb.Table(this, 'Quizzes', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    this.progressTable = new ddb.Table(this, 'Progress', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    this.mistakesTable = new ddb.Table(this, 'Mistakes', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    this.mistakesTable.addGlobalSecondaryIndex({
      indexName: 'byConcept',
      partitionKey: { name: 'userId', type: ddb.AttributeType.STRING },
      sortKey: { name: 'concept', type: ddb.AttributeType.STRING },
    });
  }
}