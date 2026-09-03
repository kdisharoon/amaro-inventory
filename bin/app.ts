#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { AmaroStack } from '../lib/amaro-stack.js';
import { SiteStack } from '../infra/site-stack.js';

const app = new cdk.App();
const googleClientId = app.node.tryGetContext('googleClientId') ?? process.env.GOOGLE_CLIENT_ID ?? '';
const adminEmail = app.node.tryGetContext('adminEmail') ?? process.env.ADMIN_GOOGLE_EMAIL ?? 'kdisharoon@gmail.com';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const amaroStack = new AmaroStack(app, 'AmaroStack', {
  env,
  description: 'Serverless backend (DynamoDB, Lambda, API Gateway) for Amaro Inventory',
  tags: {
    Project: 'AmaroCatalog',
    ManagedBy: 'CDK',
  },
});

new SiteStack(app, 'AmaroSiteStack', {
  env,
  description: 'Frontend static site (S3 + CloudFront) for Amaro Inventory',
  apiEndpoint: amaroStack.apiUrl,
  googleClientId,
  adminEmail,
  stage: app.node.tryGetContext('stage') ?? 'dev',
  tags: {
    Project: 'AmaroCatalog',
    ManagedBy: 'CDK',
  },
});

app.synth();
