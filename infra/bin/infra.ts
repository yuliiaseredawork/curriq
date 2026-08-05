#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { IngestStack } from "../lib/ingest-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") ?? "dev";
if (!["dev", "staging", "prod"].includes(stage)) {
  throw new Error(`Unsupported stage: ${stage}`);
}
const productionOrigin = process.env.PROD_APP_URL ?? "https://curriq.app";
const stagingOrigin =
  process.env.STAGING_APP_URL ?? "https://staging.curriq.app";
const allowedOrigins =
  stage === "prod"
    ? [productionOrigin]
    : stage === "staging"
      ? [stagingOrigin]
      : ["http://localhost:3000", stagingOrigin];
const malwareProtectionEnabled =
  stage === "prod" || process.env.ENABLE_MALWARE_PROTECTION === "true";

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
  enableMalwareProtection: malwareProtectionEnabled,
  vpc: network.vpc,
});
const ingest = new IngestStack(app, `Curriq-Ingest-${stage}`, {
  env,
  vpc: network.vpc,
  rawBucket: data.rawBucket,
  processedBucket: data.processedBucket,
  dbProxy: data.dbProxy,
  dbSecret: data.dbSecret,
  focusAreasTable: data.focusAreasTable,
  mistakesTable: data.mistakesTable,
  jobStateTable: data.jobStateTable,
  providerSecret: data.providerSecret,
  embeddingCacheTable: data.embeddingCacheTable,
  analyticsTable: data.analyticsTable,
  usersTable: data.usersTable,
});
new ApiStack(app, `Curriq-Api-${stage}`, {
  env,
  stage,
  allowedOrigins,
  malwareProtectionEnabled,
  rawBucket: data.rawBucket,
  dbSecret: data.dbSecret,
  dbProxyEndpoint: data.dbProxy.endpoint,
  searchChunksFn: ingest.searchChunksFn,
  processedBucket: data.processedBucket,
  progressTable: data.progressTable,
  mistakesTable: data.mistakesTable,
  focusAreasTable: data.focusAreasTable,
  usageTable: data.usageTable,
  usersTable: data.usersTable,
  analyticsTable: data.analyticsTable,
  embeddingCacheTable: data.embeddingCacheTable,
  providerSecret: data.providerSecret,
  courseJobsQueue: ingest.courseJobsQueue,
  embedTranscriptFn: ingest.embedTranscriptFn,
  processTranscriptFn: ingest.processTranscriptFn,
  courseMetadataFn: ingest.courseMetadataFn,
  generateChapterQuizFn: ingest.generateChapterQuizFn,
  generateRemediationFn: ingest.generateRemediationFn,
});
