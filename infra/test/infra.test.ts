import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { DataStack } from "../lib/data-stack";
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
});
