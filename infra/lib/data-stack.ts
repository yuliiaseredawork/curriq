import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as guardduty from "aws-cdk-lib/aws-guardduty";

interface Props extends cdk.StackProps {
  vpc: ec2.Vpc;
  stage: string;
  allowedOrigins: string[];
}

export class DataStack extends cdk.Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly dbProxy: rds.DatabaseProxy;
  public readonly dbSecret: sm.ISecret;
  public readonly rawBucket: s3.Bucket;
  public readonly processedBucket: s3.Bucket;

  public readonly usersTable: ddb.Table;
  public readonly coursesTable: ddb.Table;
  public readonly chaptersTable: ddb.Table;
  public readonly quizzesTable: ddb.Table;
  public readonly progressTable: ddb.Table;
  public readonly mistakesTable: ddb.Table;
  public readonly focusAreasTable: ddb.Table;
  public readonly usageTable: ddb.Table;
  public readonly jobStateTable: ddb.Table;
  public readonly analyticsTable: ddb.Table;
  public readonly embeddingCacheTable: ddb.Table;
  public readonly providerSecret: sm.ISecret;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.db = new rds.DatabaseInstance(this, "Postgres", {
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
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(props.stage === "prod" ? 35 : 7),
      deleteAutomatedBackups: false,
      copyTagsToSnapshot: true,
      preferredBackupWindow: "05:00-06:00",
      deletionProtection: props.stage !== "dev",
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
      databaseName: "courseforge",
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    this.dbSecret = this.db.secret!;
    this.dbProxy = this.db.addProxy("Proxy", {
      secrets: [this.dbSecret],
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      requireTLS: true,
      borrowTimeout: cdk.Duration.seconds(30),
      idleClientTimeout: cdk.Duration.minutes(5),
      maxConnectionsPercent: 80,
      maxIdleConnectionsPercent: 20,
    });
    this.providerSecret = sm.Secret.fromSecretNameV2(
      this,
      "ProviderSecrets",
      process.env.PROVIDER_SECRET_NAME ?? `curriq/${props.stage}/providers`,
    );

    this.db.connections.allowFrom(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      "Allow Postgres access from VPC",
    );
    this.dbProxy.connections.allowFrom(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      "Allow private workloads to use the RDS Proxy",
    );

    this.rawBucket = new s3.Bucket(this, "Raw", {
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          id: "DeleteAbandonedPdfUploads",
          prefix: "pdf-uploads/",
          expiration: cdk.Duration.days(1),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      // Allow browser PUT to presigned URLs (PDF upload from the frontend).
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins: props.allowedOrigins,
          allowedHeaders: ["content-type", "x-amz-*"],
          maxAge: 3000,
        },
      ],
    });

    this.processedBucket = new s3.Bucket(this, "Processed", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          id: "ExpireOldProcessedVersions",
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    this.usersTable = new ddb.Table(this, "Users", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: "expiresAt",
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: "byStripeCustomer",
      partitionKey: {
        name: "stripeCustomerId",
        type: ddb.AttributeType.STRING,
      },
      projectionType: ddb.ProjectionType.ALL,
    });

    this.coursesTable = new ddb.Table(this, "Courses", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.coursesTable.addGlobalSecondaryIndex({
      indexName: "byCourseId",
      partitionKey: { name: "courseId", type: ddb.AttributeType.STRING },
    });

    this.chaptersTable = new ddb.Table(this, "Chapters", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.quizzesTable = new ddb.Table(this, "Quizzes", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.progressTable = new ddb.Table(this, "Progress", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.mistakesTable = new ddb.Table(this, "Mistakes", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.mistakesTable.addGlobalSecondaryIndex({
      indexName: "byConcept",
      partitionKey: { name: "userId", type: ddb.AttributeType.STRING },
      sortKey: { name: "concept", type: ddb.AttributeType.STRING },
    });

    // Focus Areas V2: per-user concept mastery records + resumable practice
    // sessions (pk=USER#<id>, sk=COURSE#<id>#MASTERY|SESSION#<slug>).
    this.focusAreasTable = new ddb.Table(this, "FocusAreas", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.focusAreasTable.addGlobalSecondaryIndex({
      indexName: "byDueDate",
      partitionKey: { name: "dueBucket", type: ddb.AttributeType.STRING },
      sortKey: { name: "nextReviewAt", type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });

    this.usageTable = new ddb.Table(this, "UsageLimits", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.jobStateTable = new ddb.Table(this, "CourseJobStages", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    this.analyticsTable = new ddb.Table(this, "AnalyticsEvents", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.analyticsTable.addGlobalSecondaryIndex({
      indexName: "byEventTime",
      partitionKey: { name: "eventName", type: ddb.AttributeType.STRING },
      sortKey: { name: "occurredAt", type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });

    this.embeddingCacheTable = new ddb.Table(this, "EmbeddingCache", {
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    const malwareRole = new iam.Role(this, "MalwareProtectionRole", {
      assumedBy: new iam.ServicePrincipal(
        "malware-protection-plan.guardduty.amazonaws.com",
      ),
    });
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetObjectTagging",
          "s3:PutObjectTagging",
        ],
        resources: [this.rawBucket.arnForObjects("pdf-uploads/*")],
      }),
    );
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:ListBucket",
          "s3:GetBucketNotification",
          "s3:PutBucketNotification",
        ],
        resources: [this.rawBucket.bucketArn],
      }),
    );
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "events:PutRule",
          "events:DeleteRule",
          "events:PutTargets",
          "events:RemoveTargets",
        ],
        resources: [
          this.formatArn({
            service: "events",
            resource: "rule",
            resourceName: "DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*",
          }),
        ],
      }),
    );

    const malwarePlan = new guardduty.CfnMalwareProtectionPlan(
      this,
      "PdfMalwareProtection",
      {
        role: malwareRole.roleArn,
        actions: { tagging: { status: "ENABLED" } },
        protectedResource: {
          s3Bucket: {
            bucketName: this.rawBucket.bucketName,
            objectPrefixes: ["pdf-uploads/"],
          },
        },
      },
    );
    malwarePlan.node.addDependency(malwareRole);
    malwarePlan.node.addDependency(this.rawBucket);

    new cdk.CfnOutput(this, "RawBucketName", {
      value: this.rawBucket.bucketName,
    });
    new cdk.CfnOutput(this, "ProcessedBucketName", {
      value: this.processedBucket.bucketName,
    });
    new cdk.CfnOutput(this, "UsersTableName", {
      value: this.usersTable.tableName,
    });
    new cdk.CfnOutput(this, "RdsInstanceIdentifier", {
      value: this.db.instanceIdentifier,
    });
  }
}
