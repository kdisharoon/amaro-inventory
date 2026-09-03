import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface ApiStackProps extends cdk.StackProps {
  stage?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly httpApiUrl: string;

  constructor(scope: Construct, id: string, props?: ApiStackProps) {
    super(scope, id, props);

    // 1. DynamoDB Table (Single-Table Design)
    const table = new dynamodb.Table(this, 'AmaroTable', {
      tableName: `amaro-inventory-${props?.stage || 'dev'}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    // 2. Shared Lambda Environment Variables
    const lambdaEnv = {
      TABLE_NAME: table.tableName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // 3. Lambda Functions
    const getBottlesFunction = new lambdaNodejs.NodejsFunction(this, 'GetBottlesHandler', {
      entry: 'lambda/getBottles.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: lambdaEnv,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    const createBottleFunction = new lambdaNodejs.NodejsFunction(this, 'CreateBottleHandler', {
      entry: 'lambda/createBottle.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: lambdaEnv,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant DynamoDB Permissions
    table.grantReadData(getBottlesFunction);
    table.grantWriteData(createBottleFunction);

    // 4. API Gateway HTTP API
    const httpApi = new apigw2.HttpApi(this, 'AmaroHttpApi', {
      apiName: `amaro-inventory-api-${props?.stage || 'dev'}`,
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date'],
        allowMethods: [
          apigw2.CorsHttpMethod.GET,
          apigw2.CorsHttpMethod.POST,
          apigw2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
      },
    });

    // 5. API Routes
    httpApi.addRoutes({
      path: '/bottles',
      methods: [apigw2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetBottlesIntegration', getBottlesFunction),
    });

    httpApi.addRoutes({
      path: '/bottles',
      methods: [apigw2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateBottleIntegration', createBottleFunction),
    });

    this.httpApiUrl = httpApi.apiEndpoint;

    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      value: this.httpApiUrl,
      description: 'HTTP API Gateway Endpoint URL',
      exportName: 'AmaroApiEndpoint',
    });
  }
}