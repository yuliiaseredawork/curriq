import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    this.vpc.addGatewayEndpoint("DynamoDbEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    this.vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    this.vpc.addInterfaceEndpoint("BedrockRuntimeEndpoint", {
      service: new ec2.InterfaceVpcEndpointAwsService("bedrock-runtime"),
    });
  }
}
