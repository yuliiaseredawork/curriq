#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { IngestStack } from "../lib/ingest-stack";
import { AuthStack } from "../lib/auth-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") ?? "dev";
const productionOrigin = process.env.PROD_APP_URL ?? "https://curriq.app";
const allowedOrigins =
  stage === "prod"
    ? [productionOrigin]
    : ["http://localhost:3000", productionOrigin];

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "us-west-2",
};

const network = new NetworkStack(app, `Curriq-Network-${stage}`, {
  env,
});

const data = new DataStack(app, `Curriq-Data-${stage}`, {
  env,
  stage,
  allowedOrigins,
  vpc: network.vpc,
});
const auth = new AuthStack(app, `Curriq-Auth-${stage}`, {
  env,
  stage,
  providerSecret: data.providerSecret,
});
const ingest = new IngestStack(app, `Curriq-Ingest-${stage}`, {
  env,
  vpc: network.vpc,
  rawBucket: data.rawBucket,
  processedBucket: data.processedBucket,
  db: data.db,
  dbSecret: data.dbSecret,
  focusAreasTable: data.focusAreasTable,
  mistakesTable: data.mistakesTable,
  jobStateTable: data.jobStateTable,
  providerSecret: data.providerSecret,
});
new ApiStack(app, `Curriq-Api-${stage}`, {
  env,
  stage,
  allowedOrigins,
  rawBucket: data.rawBucket,
  dbSecret: data.dbSecret,
  searchChunksFn: ingest.searchChunksFn,
  processedBucket: data.processedBucket,
  progressTable: data.progressTable,
  mistakesTable: data.mistakesTable,
  focusAreasTable: data.focusAreasTable,
  usageTable: data.usageTable,
  providerSecret: data.providerSecret,
  courseJobsQueue: ingest.courseJobsQueue,
  embedTranscriptFn: ingest.embedTranscriptFn,
  processTranscriptFn: ingest.processTranscriptFn,
  courseMetadataFn: ingest.courseMetadataFn,
  generateChapterQuizFn: ingest.generateChapterQuizFn,
  generateRemediationFn: ingest.generateRemediationFn,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
});
