#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';
import { IngestStack } from '../lib/ingest-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') ?? 'dev';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-west-2',
};

const network = new NetworkStack(app, `Curriq-Network-${stage}`, {
  env,
});

const data = new DataStack(app, `Curriq-Data-${stage}`, {
  env,
  vpc: network.vpc,
  bastion: network.bastion,
});
const ingest = new IngestStack(app, `Curriq-Ingest-${stage}`, {
  env,
  vpc: network.vpc,
  rawBucket: data.rawBucket,
  processedBucket: data.processedBucket,
  db: data.db,
  dbSecret: data.dbSecret,
});
new ApiStack(app, `Curriq-Api-${stage}`, {
  env,
  rawBucket: data.rawBucket,
  dbSecret: data.dbSecret,
  searchChunksFn: ingest.searchChunksFn,
});