import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export interface SiteStackProps extends cdk.StackProps {
  stage?: string;
  apiEndpoint: string;
  googleClientId: string;
  adminEmail: string;
  imageBaseUrl: string;
}

export class SiteStack extends cdk.Stack {
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props?: SiteStackProps) {
    super(scope, id, props);

    const runtimeConfig = `window.__APP_CONFIG__ = ${JSON.stringify({
      VITE_API_ENDPOINT: props?.apiEndpoint ?? '',
      GOOGLE_CLIENT_ID: props?.googleClientId ?? '',
      ADMIN_EMAIL: props?.adminEmail ?? '',
      IMAGE_BASE_URL: props?.imageBaseUrl ?? '',
    })};`;

    // 1. S3 Bucket for Static Web Assets
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `amaro-inventory-web-${props?.stage || 'dev'}-${cdk.Aws.ACCOUNT_ID}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2. CloudFront Distribution with Origin Access Control (OAC)
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // 3. Automated S3 Deployment from Vue dist directory
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [
        s3deploy.Source.asset('./dist'),
        s3deploy.Source.data('runtime-config.js', runtimeConfig),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    this.distributionDomainName = distribution.distributionDomainName;

    new cdk.CfnOutput(this, 'SiteUrlOutput', {
      value: `https://${this.distributionDomainName}`,
      description: 'CloudFront Distribution Web URL',
      exportName: 'AmaroSiteUrl',
    });
  }
}