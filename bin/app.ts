#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { AmaroStack } from '../lib/amaro-stack.js';
import { SiteStack } from '../infra/site-stack.js';

const app = new cdk.App();
const googleClientId = app.node.tryGetContext('googleClientId') ?? process.env.GOOGLE_CLIENT_ID ?? '';
const adminEmail = app.node.tryGetContext('adminEmail') ?? process.env.ADMIN_GOOGLE_EMAIL ?? 'kdisharoon@gmail.com';
const domainName = app.node.tryGetContext('domainName') ?? process.env.CUSTOM_DOMAIN_NAME ?? 'amaro.dish.place';
const certificateArn = app.node.tryGetContext('certificateArn') ?? process.env.ACM_CERTIFICATE_ARN ?? 'arn:aws:acm:us-east-1:137097288135:certificate/c0a08887-7b7d-42b0-ae14-6b4793014da7';

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
  imageBaseUrl: amaroStack.imageBaseUrl,
  googleClientId,
  adminEmail,
  domainName,
  certificateArn,
  stage: app.node.tryGetContext('stage') ?? 'dev',
  tags: {
    Project: 'AmaroCatalog',
    ManagedBy: 'CDK',
  },
});

app.synth();
