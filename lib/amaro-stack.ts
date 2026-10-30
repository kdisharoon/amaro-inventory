import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AmaroStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly imageBaseUrl: string;

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
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const ratingsTable = new dynamodb.Table(this, 'AmaroRatingsTableConstruct', {
      tableName: 'AmaroRatingsTable',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'bottleId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const usersTable = new dynamodb.Table(this, 'AmaroUsersTableConstruct', {
      tableName: 'AmaroUsersTable',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const imageBucket = new s3.Bucket(this, 'BottleImageBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    const imageDistribution = new cloudfront.Distribution(this, 'BottleImageDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(imageBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });

    this.imageBaseUrl = `https://${imageDistribution.distributionDomainName}`;

    // 2. Node.js Lambda Handler
    const googleClientId = this.node.tryGetContext('googleClientId') ?? process.env.GOOGLE_CLIENT_ID ?? '';
    const adminGoogleEmail = this.node.tryGetContext('adminEmail') ?? process.env.ADMIN_GOOGLE_EMAIL ?? 'kdisharoon@gmail.com';
    const geminiApiKey = this.node.tryGetContext('geminiApiKey') ?? process.env.GEMINI_API_KEY ?? '';

    const userAlertsTopic = new sns.Topic(this, 'AmaroUserAlertsTopic', {
      topicName: 'amaro-user-alerts',
      displayName: 'Amaro Inventory Alerts',
    });
    userAlertsTopic.addSubscription(new subscriptions.EmailSubscription(adminGoogleEmail));

    const amaroLambda = new lambdaNodejs.NodejsFunction(this, 'AmaroHandlerConstruct', {
      functionName: 'AmaroHandler',
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(process.cwd(), 'src', 'lambda', 'amaroHandler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(29),
      memorySize: 1024,
      environment: {
        TABLE_NAME: amaroTable.tableName,
        RATINGS_TABLE_NAME: ratingsTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        USER_ALERTS_TOPIC_ARN: userAlertsTopic.topicArn,
        GOOGLE_CLIENT_ID: googleClientId,
        ADMIN_GOOGLE_EMAIL: adminGoogleEmail,
        GEMINI_API_KEY: geminiApiKey,
        IMAGE_BUCKET_NAME: imageBucket.bucketName,
        IMAGE_BASE_URL: this.imageBaseUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant Lambda read/write permissions to AmaroTable, RatingsTable, UsersTable, and S3 image bucket
    amaroTable.grantReadWriteData(amaroLambda);
    ratingsTable.grantReadWriteData(amaroLambda);
    usersTable.grantReadWriteData(amaroLambda);
    userAlertsTopic.grantPublish(amaroLambda);
    imageBucket.grantPut(amaroLambda);
    imageBucket.grantRead(amaroLambda);

    // 3. REST API Gateway
    const api = new apigateway.RestApi(this, 'AmaroApiGateway', {
      restApiName: 'Amaro Inventory API',
      description: 'API serving cataloged amari data.',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amaro-Id-Token'],
      },
    });

    // Integrate Lambda with API Gateway
    const lambdaIntegration = new apigateway.LambdaIntegration(amaroLambda);

    // Auth routes: /auth/session
    const authResource = api.root.addResource('auth');
    const sessionResource = authResource.addResource('session');
    sessionResource.addMethod('POST', lambdaIntegration); // POST /auth/session

    // Admin routes: /admin/users, /admin/users/{email}, /admin/users/{email}/status, /admin/capacity
    const adminResource = api.root.addResource('admin');
    const adminUsersResource = adminResource.addResource('users');
    adminUsersResource.addMethod('GET', lambdaIntegration); // GET /admin/users

    const singleAdminUserResource = adminUsersResource.addResource('{email}');
    singleAdminUserResource.addMethod('DELETE', lambdaIntegration); // DELETE /admin/users/{email}
    const adminUserStatusResource = singleAdminUserResource.addResource('status');
    adminUserStatusResource.addMethod('PUT', lambdaIntegration); // PUT /admin/users/{email}/status

    const adminCapacityResource = adminResource.addResource('capacity');
    adminCapacityResource.addMethod('GET', lambdaIntegration);  // GET /admin/capacity
    adminCapacityResource.addMethod('POST', lambdaIntegration); // POST /admin/capacity

    // Routes: /amaros and /amaros/{id}
    const amarosResource = api.root.addResource('amaros');
    amarosResource.addMethod('GET', lambdaIntegration);  // GET /amaros
    amarosResource.addMethod('POST', lambdaIntegration); // POST /amaros
    const imageUploadUrlResource = amarosResource.addResource('image-upload-url');
    imageUploadUrlResource.addMethod('POST', lambdaIntegration); // POST /amaros/image-upload-url
    const analyzeImageResource = amarosResource.addResource('analyze-image');
    analyzeImageResource.addMethod('POST', lambdaIntegration); // POST /amaros/analyze-image

    // User ratings routes: /amaros/ratings
    const ratingsResource = amarosResource.addResource('ratings');
    ratingsResource.addMethod('GET', lambdaIntegration); // GET /amaros/ratings

    const singleAmaroResource = amarosResource.addResource('{id}');
    singleAmaroResource.addMethod('GET', lambdaIntegration);    // GET /amaros/{id}
    singleAmaroResource.addMethod('PUT', lambdaIntegration);    // PUT /amaros/{id}
    singleAmaroResource.addMethod('DELETE', lambdaIntegration); // DELETE /amaros/{id}

    // Single amaro user rating routes: /amaros/{id}/rating
    const singleRatingResource = singleAmaroResource.addResource('rating');
    singleRatingResource.addMethod('GET', lambdaIntegration);    // GET /amaros/{id}/rating
    singleRatingResource.addMethod('PUT', lambdaIntegration);    // PUT /amaros/{id}/rating
    singleRatingResource.addMethod('DELETE', lambdaIntegration); // DELETE /amaros/{id}/rating

    this.apiUrl = api.url;

    // Output API Gateway URL after deployment
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'The base endpoint URL for the Amaro API',
    });

    new cdk.CfnOutput(this, 'BottleImageBaseUrl', {
      value: this.imageBaseUrl,
      description: 'CloudFront base URL for bottle images',
    });
  }
}
