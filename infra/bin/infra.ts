#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') ?? 'dev';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-west-2',
};

const network = new NetworkStack(app, `Curriq-Network-${stage}`, {
  env,
});

new DataStack(app, `Curriq-Data-${stage}`, {
  env,
  vpc: network.vpc,
  bastion: network.bastion,
});
new ApiStack(app, `Curriq-Api-${stage}`, {
  env,
  vpc: network.vpc,
});