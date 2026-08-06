import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as iam from "aws-cdk-lib/aws-iam";

interface Props extends cdk.StackProps {
  githubOwner: string;
  githubRepository: string;
  githubOwnerId: string;
  githubRepositoryId: string;
}

export class DeliveryStack extends cdk.Stack {
  public readonly deploymentRole: iam.Role;
  public readonly recoveryRole: iam.Role;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const githubProvider = new iam.OpenIdConnectProvider(
      this,
      "GitHubActionsProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      },
    );

    const principalForEnvironments = (...environments: string[]) =>
      new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:repository_id":
            props.githubRepositoryId,
          "token.actions.githubusercontent.com:repository_owner_id":
            props.githubOwnerId,
          "token.actions.githubusercontent.com:sub": environments.map(
            (environment) =>
              `repo:${props.githubOwner}/${props.githubRepository}:environment:${environment}`,
          ),
        },
      });

    this.deploymentRole = new iam.Role(this, "GitHubDeploymentRole", {
      roleName: "Curriq-GitHub-Deploy",
      assumedBy: principalForEnvironments("staging", "production"),
      description:
        "Allows Curriq staging and production GitHub environments to deploy through CDK bootstrap roles.",
      maxSessionDuration: cdk.Duration.hours(1),
    });
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "iam",
            region: "",
            resource: "role",
            resourceName: `cdk-hnb659fds-*-${this.account}-${this.region}`,
          }),
        ],
      }),
    );
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:ListStackResources",
        ],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "cloudformation",
            resource: "stack",
            resourceName: "Curriq-*/*",
          }),
        ],
      }),
    );
    this.deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:PutParameter"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: "curriq/*",
          }),
        ],
      }),
    );

    this.recoveryRole = new iam.Role(this, "GitHubRecoveryRole", {
      roleName: "Curriq-GitHub-Recovery",
      assumedBy: principalForEnvironments("staging-recovery"),
      description:
        "Allows the Curriq staging recovery workflow to create and clean isolated restore drills.",
      maxSessionDuration: cdk.Duration.hours(2),
    });
    this.recoveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "cloudformation",
            resource: "stack",
            resourceName: "Curriq-Data-staging/*",
          }),
        ],
      }),
    );
    this.recoveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:DeleteTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTable",
          "dynamodb:RestoreTableToPointInTime",
          "dynamodb:Scan",
        ],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "dynamodb",
            resource: "table",
            resourceName: "Curriq-Data-staging-*",
          }),
          cdk.Stack.of(this).formatArn({
            service: "dynamodb",
            resource: "table",
            resourceName: "curriq-restore-drill-*",
          }),
        ],
      }),
    );
    this.recoveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket", "s3:ListBucketVersions"],
        resources: ["arn:aws:s3:::curriq-data-staging-raw*"],
      }),
    );
    this.recoveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:DeleteObject",
          "s3:DeleteObjectVersion",
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:PutObject",
        ],
        resources: ["arn:aws:s3:::curriq-data-staging-raw*/recovery-drill/*"],
      }),
    );
    this.recoveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "rds:CreateDBSnapshot",
          "rds:DeleteDBInstance",
          "rds:DeleteDBSnapshot",
          "rds:ModifyDBInstance",
          "rds:RestoreDBInstanceFromDBSnapshot",
        ],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "rds",
            resource: "db",
            resourceName: "curriq-data-staging-*",
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
          }),
          cdk.Stack.of(this).formatArn({
            service: "rds",
            resource: "db",
            resourceName: "curriq-restore-drill-*",
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
          }),
          cdk.Stack.of(this).formatArn({
            service: "rds",
            resource: "snapshot",
            resourceName: "curriq-restore-drill-*",
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
          }),
        ],
      }),
    );
    this.recoveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["rds:DescribeDBInstances", "rds:DescribeDBSnapshots"],
        resources: ["*"],
      }),
    );

    new cdk.CfnOutput(this, "DeploymentRoleArn", {
      value: this.deploymentRole.roleArn,
    });
    new cdk.CfnOutput(this, "RecoveryRoleArn", {
      value: this.recoveryRole.roleArn,
    });
  }
}
