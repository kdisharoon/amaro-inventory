import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || 'AmaroTable';
const IMAGE_BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || '';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || '';
const MAX_IMPORTED_IMAGE_BYTES = 5 * 1024 * 1024;

export interface AmaroItem {
  id: string;
  name: string;
  producer: string;
  region: string;
  abv: number;
  description: string;
  flavorNotes: string[];
  sweetnessLevel: 'not-specified' | 'dry' | 'semi-sweet' | 'sweet';
  status: 'unopened' | 'opened' | 'finished';
  imageUrl?: string;
  rating?: number;
  dateAdded: string;
}

interface GoogleTokenInfo {
  aud: string;
  email: string;
  email_verified: string;
  exp: string;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_GOOGLE_EMAIL = (process.env.ADMIN_GOOGLE_EMAIL || 'kdisharoon@gmail.com').toLowerCase();

const sanitizeExtension = (contentType: string, fileName?: string): string => {
  const lowerFileName = (fileName || '').toLowerCase();
  if (lowerFileName.endsWith('.png')) return 'png';
  if (lowerFileName.endsWith('.webp')) return 'webp';
  if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) return 'jpg';

  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
};

const buildImageObjectKey = (extension: string): string =>
  `bottles/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;

const extractBearerToken = (headers: APIGatewayProxyEvent['headers']): string | null => {
  const authHeader = headers.Authorization || headers.authorization;
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

const isAuthorizedAdmin = async (idToken: string): Promise<boolean> => {
  if (!GOOGLE_CLIENT_ID || !ADMIN_GOOGLE_EMAIL) {
    console.error('GOOGLE_CLIENT_ID and ADMIN_GOOGLE_EMAIL must be configured');
    return false;
  }

  const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(tokenInfoUrl);
  if (!response.ok) {
    console.error('Failed tokeninfo lookup', response.status);
    return false;
  }

  const tokenInfo = (await response.json()) as GoogleTokenInfo;
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const tokenExp = Number(tokenInfo.exp || '0');

  return (
    tokenInfo.aud === GOOGLE_CLIENT_ID &&
    tokenInfo.email_verified === 'true' &&
    tokenExp > nowEpochSeconds &&
    tokenInfo.email?.toLowerCase() === ADMIN_GOOGLE_EMAIL
  );
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received Event:', JSON.stringify(event, null, 2));

  const httpMethod = event.httpMethod;
  const pathParameters = event.pathParameters;
  const resourcePath = event.resource || '';
  const requestPath = event.path || '';
  const isImageUploadUrlRequest = resourcePath === '/amaros/image-upload-url' || requestPath.endsWith('/amaros/image-upload-url');
  const isImportImageUrlRequest = resourcePath === '/amaros/import-image-url' || requestPath.endsWith('/amaros/import-image-url');

  try {
    if (httpMethod === 'POST' && isImageUploadUrlRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing bearer token.' }),
        };
      }

      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Forbidden. This account is not authorized to upload bottle images.' }),
        };
      }

      if (!IMAGE_BUCKET_NAME || !IMAGE_BASE_URL) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Image upload is not configured.' }),
        };
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const contentType = typeof body.contentType === 'string' && body.contentType.startsWith('image/')
        ? body.contentType
        : 'image/jpeg';
      const extension = sanitizeExtension(contentType, body.fileName);
      const objectKey = buildImageObjectKey(extension);

      const putCommand = new PutObjectCommand({
        Bucket: IMAGE_BUCKET_NAME,
        Key: objectKey,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      });

      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 });
      const imageUrl = `${IMAGE_BASE_URL}/${objectKey}`;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ uploadUrl, imageUrl }),
      };
    }

    if (httpMethod === 'POST' && isImportImageUrlRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing bearer token.' }),
        };
      }

      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Forbidden. This account is not authorized to upload bottle images.' }),
        };
      }

      if (!IMAGE_BUCKET_NAME || !IMAGE_BASE_URL) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Image upload is not configured.' }),
        };
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
      if (!sourceUrl) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'sourceUrl is required.' }),
        };
      }

      const sourceResponse = await fetch(sourceUrl);
      if (!sourceResponse.ok) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: `Failed to fetch source image (Status ${sourceResponse.status}).` }),
        };
      }

      const sourceContentType = sourceResponse.headers.get('content-type') || 'image/jpeg';
      if (!sourceContentType.startsWith('image/')) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'sourceUrl must resolve to an image.' }),
        };
      }

      const contentLengthHeader = sourceResponse.headers.get('content-length');
      if (contentLengthHeader && Number(contentLengthHeader) > MAX_IMPORTED_IMAGE_BYTES) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Source image is too large. Choose one under 5 MB.' }),
        };
      }

      const arrayBuffer = await sourceResponse.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMPORTED_IMAGE_BYTES) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Source image is too large. Choose one under 5 MB.' }),
        };
      }

      const extension = sanitizeExtension(sourceContentType);
      const objectKey = buildImageObjectKey(extension);
      const putCommand = new PutObjectCommand({
        Bucket: IMAGE_BUCKET_NAME,
        Key: objectKey,
        Body: Buffer.from(arrayBuffer),
        ContentType: sourceContentType,
        CacheControl: 'public, max-age=31536000, immutable',
      });

      await s3Client.send(putCommand);
      const imageUrl = `${IMAGE_BASE_URL}/${objectKey}`;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ imageUrl }),
      };
    }

    // GET /amaros - Fetch all amari
    if (httpMethod === 'GET' && !pathParameters?.id) {
      const command = new ScanCommand({ TableName: TABLE_NAME });
      const response = await docClient.send(command);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(response.Items as AmaroItem[] || []),
      };
    }

    // GET /amaros/{id} - Fetch a single amaro by ID
    if (httpMethod === 'GET' && pathParameters?.id) {
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: pathParameters.id },
      });

      const response = await docClient.send(command);

      if (!response.Item) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: `Amaro with ID '${pathParameters.id}' not found.` }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(response.Item as AmaroItem),
      };
    }

    // POST /amaros - Create or update an amaro bottle
    if (httpMethod === 'POST') {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing bearer token.' }),
        };
      }

      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Forbidden. This account is not authorized to add bottles.' }),
        };
      }

      if (!event.body) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Request body is required.' }),
        };
      }

      const body = JSON.parse(event.body);

      if (!body.name || !body.region || typeof body.abv !== 'number') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing required fields: name, region, and numerical abv are required.' }),
        };
      }

      const id = body.id || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

      const newItem: AmaroItem = {
        id,
        name: body.name,
        producer: body.producer || 'Unknown',
        region: body.region,
        abv: body.abv,
        description: body.description || '',
        flavorNotes: Array.isArray(body.flavorNotes) ? body.flavorNotes : [],
        sweetnessLevel: body.sweetnessLevel || 'not-specified',
        status: body.status || 'unopened',
        imageUrl: typeof body.imageUrl === 'string' && body.imageUrl.trim() !== '' ? body.imageUrl.trim() : undefined,
        rating: body.rating ?? 0,
        dateAdded: body.dateAdded || new Date().toISOString(),
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: newItem,
      });

      await docClient.send(command);

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify(newItem),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: `Method ${httpMethod} not supported.` }),
    };

  } catch (error) {
    console.error('DynamoDB Execution Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: (error as Error).message }),
    };
  }
};
