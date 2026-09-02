import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

export class AmaroStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. DynamoDB Table named "AmaroTable"
    const amaroTable = new dynamodb.Table(this, 'AmaroTableConstruct', {
      tableName: 'AmaroTable',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production protection
    });

    // 2. Node.js Lambda Handler
    const amaroLambda = new lambdaNodejs.NodejsFunction(this, 'AmaroHandlerConstruct', {
      functionName: 'AmaroHandler',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/amaroHandler.ts'),
      handler: 'handler',
      environment: {
        TABLE_NAME: amaroTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant Lambda read/write permissions to AmaroTable
    amaroTable.grantReadWriteData(amaroLambda);

    // 3. REST API Gateway
    const api = new apigateway.RestApi(this, 'AmaroApiGateway', {
      restApiName: 'Amaro Inventory API',
      description: 'API serving cataloged amari data.',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    // Integrate Lambda with API Gateway
    const lambdaIntegration = new apigateway.LambdaIntegration(amaroLambda);

    // Routes: /amaros and /amaros/{id}
    const amarosResource = api.root.addResource('amaros');
    amarosResource.addMethod('GET', lambdaIntegration);  // GET /amaros
    amarosResource.addMethod('POST', lambdaIntegration); // POST /amaros

    const singleAmaroResource = amarosResource.addResource('{id}');
    singleAmaroResource.addMethod('GET', lambdaIntegration); // GET /amaros/{id}

    // Output API Gateway URL after deployment
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'The base endpoint URL for the Amaro API',
    });
  }
}
