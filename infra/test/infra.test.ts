import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { DataStack } from "../lib/data-stack";
import { DeliveryStack } from "../lib/delivery-stack";
import { NetworkStack } from "../lib/network-stack";

test("network has no bastion or public SSH ingress", () => {
  const app = new cdk.App();
  const network = new NetworkStack(app, "Network", {});
  const template = Template.fromStack(network);

  template.resourceCountIs("AWS::EC2::Instance", 0);
  const ingress = template.findResources("AWS::EC2::SecurityGroupIngress");
  expect(
    Object.values(ingress).every(
      (resource: any) =>
        resource.Properties?.FromPort !== 22 &&
        resource.Properties?.ToPort !== 22,
    ),
  ).toBe(true);
});

test("uploads use restricted CORS, cleanup, malware scanning, and quota TTL", () => {
  const app = new cdk.App();
  const network = new NetworkStack(app, "Network", {});
  const data = new DataStack(app, "Data", {
    vpc: network.vpc,
    stage: "test",
    allowedOrigins: ["https://curriq.app"],
    enableMalwareProtection: true,
    enableRdsProxy: true,
  });
  const template = Template.fromStack(data);

  template.hasResourceProperties(
    "AWS::S3::Bucket",
    Match.objectLike({
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({ AllowedOrigins: ["https://curriq.app"] }),
        ],
      },
    }),
  );
  template.resourceCountIs("AWS::GuardDuty::MalwareProtectionPlan", 1);
  template.hasResourceProperties(
    "AWS::DynamoDB::Table",
    Match.objectLike({
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    }),
  );

  const tables = template.findResources("AWS::DynamoDB::Table");
  expect(Object.values(tables)).not.toHaveLength(0);
  expect(
    Object.values(tables).every(
      (resource: any) =>
        resource.Properties?.PointInTimeRecoverySpecification
          ?.PointInTimeRecoveryEnabled === true,
    ),
  ).toBe(true);

  const buckets = template.findResources("AWS::S3::Bucket");
  expect(
    Object.values(buckets).every(
      (resource: any) =>
        resource.Properties?.VersioningConfiguration?.Status === "Enabled",
    ),
  ).toBe(true);

  template.hasResourceProperties("AWS::RDS::DBInstance", {
    BackupRetentionPeriod: 1,
    DeletionProtection: true,
    DeleteAutomatedBackups: false,
    StorageEncrypted: true,
  });
  template.resourceCountIs("AWS::RDS::DBProxy", 1);
  template.hasResourceProperties(
    "AWS::DynamoDB::Table",
    Match.objectLike({
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "byDueDate" }),
      ]),
    }),
  );
});

test("GitHub delivery roles trust only the Curriq environments and use scoped policies", () => {
  const app = new cdk.App();
  const delivery = new DeliveryStack(app, "Delivery", {
    githubOwner: "yuliiaseredawork",
    githubRepository: "curriq",
    githubOwnerId: "191797503",
    githubRepositoryId: "1245110775",
  });
  const template = Template.fromStack(delivery);

  template.hasResourceProperties("Custom::AWSCDKOpenIdConnectProvider", {
    ClientIDList: ["sts.amazonaws.com"],
    Url: "https://token.actions.githubusercontent.com",
  });
  template.hasResourceProperties(
    "AWS::IAM::Role",
    Match.objectLike({
      RoleName: "Curriq-GitHub-Deploy",
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:repository_id":
                  "1245110775",
                "token.actions.githubusercontent.com:repository_owner_id":
                  "191797503",
                "token.actions.githubusercontent.com:sub": [
                  "repo:yuliiaseredawork/curriq:environment:staging",
                  "repo:yuliiaseredawork/curriq:environment:production",
                ],
              }),
            }),
          }),
        ]),
      }),
    }),
  );
  template.hasResourceProperties(
    "AWS::IAM::Role",
    Match.objectLike({ RoleName: "Curriq-GitHub-Recovery" }),
  );
});
