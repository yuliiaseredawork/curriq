#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DataStack } from "../lib/data-stack";
import { ApiStack } from "../lib/api-stack";
import { IngestStack } from "../lib/ingest-stack";
import { DeliveryStack } from "../lib/delivery-stack";

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
const rdsProxyEnabled =
  stage === "prod" || process.env.ENABLE_RDS_PROXY === "true";
const reservedConcurrencyEnabled =
  stage === "prod" || process.env.ENABLE_RESERVED_CONCURRENCY === "true";

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "us-west-2",
};

new DeliveryStack(app, "Curriq-Delivery", {
  env,
  githubOwner: "yuliiaseredawork",
  githubRepository: "curriq",
  githubOwnerId: "191797503",
  githubRepositoryId: "1245110775",
});

const network = new NetworkStack(app, `Curriq-Network-${stage}`, {
  env,
});

const data = new DataStack(app, `Curriq-Data-${stage}`, {
  env,
  stage,
  allowedOrigins,
  enableMalwareProtection: malwareProtectionEnabled,
  enableRdsProxy: rdsProxyEnabled,
  vpc: network.vpc,
});
const ingest = new IngestStack(app, `Curriq-Ingest-${stage}`, {
  env,
  vpc: network.vpc,
  rawBucket: data.rawBucket,
  processedBucket: data.processedBucket,
  dbEndpoint: data.dbEndpoint,
  dbSecret: data.dbSecret,
  focusAreasTable: data.focusAreasTable,
  mistakesTable: data.mistakesTable,
  jobStateTable: data.jobStateTable,
  providerSecret: data.providerSecret,
  embeddingCacheTable: data.embeddingCacheTable,
  analyticsTable: data.analyticsTable,
  usersTable: data.usersTable,
  enableReservedConcurrency: reservedConcurrencyEnabled,
});
new ApiStack(app, `Curriq-Api-${stage}`, {
  env,
  stage,
  allowedOrigins,
  malwareProtectionEnabled,
  rawBucket: data.rawBucket,
  dbSecret: data.dbSecret,
  dbEndpoint: data.dbEndpoint,
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
  enableReservedConcurrency: reservedConcurrencyEnabled,
});
