#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { AmaroStack } from '../lib/amaro-stack';
const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};
new AmaroStack(app, 'AmaroStack', {
    env,
    description: 'Serverless backend (DynamoDB, Lambda, API Gateway) for Amaro Inventory',
    tags: {
        Project: 'AmaroCatalog',
        ManagedBy: 'CDK',
    },
});
app.synth();
