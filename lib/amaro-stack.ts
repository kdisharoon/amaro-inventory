import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
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
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production protection
    });

    const imageBucket = new s3.Bucket(this, 'BottleImageBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
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
    const tavilyApiKey = this.node.tryGetContext('tavilyApiKey') ?? process.env.TAVILY_API_KEY ?? '';
    const googleVisionApiKey = this.node.tryGetContext('googleVisionApiKey') ?? process.env.GOOGLE_VISION_API_KEY ?? '';
    const visionWebDetectionEnabled = this.node.tryGetContext('visionWebDetectionEnabled') ?? process.env.VISION_WEB_DETECTION_ENABLED ?? 'false';

    const amaroLambda = new lambdaNodejs.NodejsFunction(this, 'AmaroHandlerConstruct', {
      functionName: 'AmaroHandler',
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(process.cwd(), 'src', 'lambda', 'amaroHandler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(29),
      memorySize: 1024,
      environment: {
        TABLE_NAME: amaroTable.tableName,
        GOOGLE_CLIENT_ID: googleClientId,
        ADMIN_GOOGLE_EMAIL: adminGoogleEmail,
        TAVILY_API_KEY: tavilyApiKey,
        GOOGLE_VISION_API_KEY: googleVisionApiKey,
        VISION_WEB_DETECTION_ENABLED: visionWebDetectionEnabled,
        IMAGE_BUCKET_NAME: imageBucket.bucketName,
        IMAGE_BASE_URL: this.imageBaseUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant Lambda read/write permissions to AmaroTable
    amaroTable.grantReadWriteData(amaroLambda);
    imageBucket.grantPut(amaroLambda);
    imageBucket.grantRead(amaroLambda);
    amaroLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['rekognition:DetectText'],
        resources: ['*'],
      })
    );
    amaroLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['translate:TranslateText'],
        resources: ['*'],
      })
    );

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
    const imageUploadUrlResource = amarosResource.addResource('image-upload-url');
    imageUploadUrlResource.addMethod('POST', lambdaIntegration); // POST /amaros/image-upload-url
    const analyzeImageResource = amarosResource.addResource('analyze-image');
    analyzeImageResource.addMethod('POST', lambdaIntegration); // POST /amaros/analyze-image

    const singleAmaroResource = amarosResource.addResource('{id}');
    singleAmaroResource.addMethod('GET', lambdaIntegration); // GET /amaros/{id}

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
