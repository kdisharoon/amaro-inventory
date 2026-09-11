import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || 'AmaroTable';
const IMAGE_BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || '';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_GOOGLE_EMAIL = (process.env.ADMIN_GOOGLE_EMAIL || 'kdisharoon@gmail.com').toLowerCase();

export const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
] as const;

export interface AmaroItem {
  id: string;
  name: string;
  producer: string;
  region?: string;
  abv?: number;
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
  email_verified: string | boolean;
  exp: string | number;
}

export interface BottleAnalysisResult {
  name?: string;
  producer?: string;
  region?: string;
  abv?: number;
  description?: string;
  flavorNotes?: string[];
  sweetnessLevel?: 'not-specified' | 'dry' | 'semi-sweet' | 'sweet';
  descriptionConfidence: 'low' | 'medium' | 'high';
  flavorNotesConfidence: 'low' | 'medium' | 'high';
  descriptionNeedsReview: boolean;
  flavorNotesNeedsReview: boolean;
}

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

const buildS3KeyFromImageUrl = (imageUrl: string): string | undefined => {
  if (!IMAGE_BASE_URL) return undefined;
  const base = IMAGE_BASE_URL.endsWith('/') ? IMAGE_BASE_URL : `${IMAGE_BASE_URL}/`;
  if (!imageUrl.startsWith(base)) return undefined;
  return imageUrl.slice(base.length);
};

const parseGeminiJson = (rawText: string): any => {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    cleaned = match[0];
  }

  return JSON.parse(cleaned);
};

const callGemini = async (base64Image: string, mimeType: string): Promise<any> => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the backend Lambda.');
  }

  const prompt = `You are an expert sommelier and spirits specialist cataloging an Italian Amaro collection.
Analyze this bottle image and identify the exact amaro bottle. Search the web to verify producer details, regional origin, alcohol percentage (ABV), tasting notes, botanicals, and sweetness level.

Extract and return a JSON object with EXACTLY the following fields:
- "name": (string) The specific name of the amaro (e.g., "Amaro Averna", "Amaro Lucano", "Amaro Nonino Quintessentia", "Cynar", "Braulio").
- "producer": (string) The company or distillery that produces it (e.g., "Fratelli Averna", "Lucano 1894", "Nonino Distillatori", "Campari Group", "Peloni").
- "region": (string) MUST be one of the official 20 Italian regions spelled in Italian: ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"]. If not Italian or unknown, leave empty or omit.
- "abv": (number) The numerical ABV percentage (e.g., 29, 30, 16.5). If unknown, omit.
- "description": (string) A concise, well-written English description (2-4 sentences) summarizing the amaro's heritage, key botanical profile, production style, and taste characteristics.
- "flavorNotes": (array of strings) 3 to 7 distinctive flavor/botanical keywords in English (e.g., ["citrus", "gentian", "rhubarb", "caramel", "mint"]).
- "sweetnessLevel": (string) One of "dry", "semi-sweet", "sweet", or "not-specified".
- "descriptionConfidence": (string) "high", "medium", or "low".
- "flavorNotesConfidence": (string) "high", "medium", or "low".
- "descriptionNeedsReview": (boolean) true if confidence is medium or low, otherwise false.
- "flavorNotesNeedsReview": (boolean) true if confidence is medium or low, otherwise false.

Respond ONLY with valid JSON.`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    tools: [
      {
        googleSearch: {},
      },
    ],
    generationConfig: {
      temperature: 0.1,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API Error:', response.status, errorText);
    throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as any;
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error('Gemini returned empty text or candidate:', JSON.stringify(data));
    throw new Error('Gemini API did not return text candidate.');
  }

  return parseGeminiJson(rawText);
};

const analyzeBottleImage = async (imageUrl: string): Promise<BottleAnalysisResult> => {
  let imageBuffer: Buffer;
  let mimeType = 'image/jpeg';

  const s3Key = buildS3KeyFromImageUrl(imageUrl);
  if (s3Key && IMAGE_BUCKET_NAME) {
    try {
      const getRes = await s3Client.send(
        new GetObjectCommand({
          Bucket: IMAGE_BUCKET_NAME,
          Key: s3Key,
        })
      );
      const bytes = await getRes.Body?.transformToByteArray();
      if (!bytes) throw new Error('S3 image body empty');
      imageBuffer = Buffer.from(bytes);
      if (getRes.ContentType) mimeType = getRes.ContentType;
    } catch (err) {
      console.warn('Failed to fetch image directly from S3, falling back to HTTP fetch:', err);
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuf);
      const ct = res.headers.get('content-type');
      if (ct) mimeType = ct;
    }
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuf);
    const ct = res.headers.get('content-type');
    if (ct) mimeType = ct;
  }

  const base64Data = imageBuffer.toString('base64');
  const parsed = await callGemini(base64Data, mimeType);

  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined;
  const producer = typeof parsed.producer === 'string' && parsed.producer.trim() ? parsed.producer.trim() : undefined;

  let region: string | undefined = typeof parsed.region === 'string' && parsed.region.trim() ? parsed.region.trim() : undefined;
  if (region) {
    const matched = ITALIAN_REGIONS.find((r) => r.toLowerCase() === region?.toLowerCase());
    region = matched || region;
  }

  const abv = typeof parsed.abv === 'number' && !isNaN(parsed.abv) ? parsed.abv : undefined;
  const description = typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description.trim() : undefined;

  const flavorNotes = Array.isArray(parsed.flavorNotes)
    ? parsed.flavorNotes
        .filter((n: any) => typeof n === 'string' && n.trim().length > 0)
        .map((n: string) => n.trim())
    : [];

  let sweetnessLevel: BottleAnalysisResult['sweetnessLevel'] = 'not-specified';
  if (['dry', 'semi-sweet', 'sweet'].includes(parsed.sweetnessLevel)) {
    sweetnessLevel = parsed.sweetnessLevel;
  }

  const descConf: BottleAnalysisResult['descriptionConfidence'] =
    ['low', 'medium', 'high'].includes(parsed.descriptionConfidence) ? parsed.descriptionConfidence : 'high';
  const flavConf: BottleAnalysisResult['flavorNotesConfidence'] =
    ['low', 'medium', 'high'].includes(parsed.flavorNotesConfidence) ? parsed.flavorNotesConfidence : 'high';

  return {
    name,
    producer,
    region,
    abv,
    description,
    flavorNotes,
    sweetnessLevel,
    descriptionConfidence: descConf,
    flavorNotesConfidence: flavConf,
    descriptionNeedsReview: parsed.descriptionNeedsReview ?? (descConf !== 'high'),
    flavorNotesNeedsReview: parsed.flavorNotesNeedsReview ?? (flavConf !== 'high'),
  };
};

const extractBearerToken = (headers: APIGatewayProxyEvent['headers']): string | null => {
  const customTokenHeader = headers['X-Amaro-Id-Token'] || headers['x-amaro-id-token'];
  const authHeader = customTokenHeader || headers.Authorization || headers.authorization;
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || authHeader;
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
    (tokenInfo.email_verified === true || tokenInfo.email_verified === 'true') &&
    tokenExp > nowEpochSeconds &&
    tokenInfo.email?.toLowerCase() === ADMIN_GOOGLE_EMAIL
  );
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amaro-Id-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received Event:', JSON.stringify(event, null, 2));

  const httpMethod = event.httpMethod;
  const pathParameters = event.pathParameters;
  const resourcePath = event.resource || '';
  const requestPath = event.path || '';
  const isImageUploadUrlRequest = resourcePath === '/amaros/image-upload-url' || requestPath.endsWith('/amaros/image-upload-url');
  const isAnalyzeImageRequest = resourcePath === '/amaros/analyze-image' || requestPath.endsWith('/amaros/analyze-image');

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

    if (httpMethod === 'POST' && isAnalyzeImageRequest) {
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
          body: JSON.stringify({ message: 'Forbidden. This account is not authorized to analyze bottle images.' }),
        };
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
      if (!imageUrl) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'imageUrl is required.' }),
        };
      }

      const analysis = await analyzeBottleImage(imageUrl);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(analysis),
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

    // PUT /amaros/{id} - Update an amaro bottle
    if (httpMethod === 'PUT' && pathParameters?.id) {
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
          body: JSON.stringify({ message: 'Forbidden. This account is not authorized to update bottles.' }),
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
      if (!body.name) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing required field: name is required.' }),
        };
      }

      const existingBottle = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: pathParameters.id },
      }));

      if (!existingBottle.Item) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: `Amaro with ID '${pathParameters.id}' not found.` }),
        };
      }

      const updatedItem: AmaroItem = {
        ...existingBottle.Item,
        id: pathParameters.id,
        name: body.name,
        producer: body.producer || existingBottle.Item.producer || 'Unknown',
        region: typeof body.region === 'string' ? body.region : (existingBottle.Item.region || ''),
        abv: typeof body.abv === 'number' && !isNaN(body.abv) ? body.abv : (body.abv === null ? undefined : existingBottle.Item.abv),
        description: typeof body.description === 'string' ? body.description : existingBottle.Item.description || '',
        flavorNotes: Array.isArray(body.flavorNotes) ? body.flavorNotes : existingBottle.Item.flavorNotes || [],
        sweetnessLevel: body.sweetnessLevel || existingBottle.Item.sweetnessLevel || 'not-specified',
        status: body.status || existingBottle.Item.status || 'unopened',
        imageUrl: typeof body.imageUrl === 'string' && body.imageUrl.trim() !== ''
          ? body.imageUrl.trim()
          : (body.imageUrl === '' ? undefined : existingBottle.Item.imageUrl),
        rating: body.rating ?? existingBottle.Item.rating ?? 0,
        dateAdded: body.dateAdded || existingBottle.Item.dateAdded || new Date().toISOString(),
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedItem,
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(updatedItem),
      };
    }

    // DELETE /amaros/{id} - Delete an amaro bottle
    if (httpMethod === 'DELETE' && pathParameters?.id) {
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
          body: JSON.stringify({ message: 'Forbidden. This account is not authorized to delete bottles.' }),
        };
      }

      const existingBottle = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: pathParameters.id },
      }));

      if (!existingBottle.Item) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: `Amaro with ID '${pathParameters.id}' not found.` }),
        };
      }

      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: pathParameters.id },
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ id: pathParameters.id, deleted: true }),
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

      if (!body.name) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing required field: name is required.' }),
        };
      }

      const id = body.id || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

      const newItem: AmaroItem = {
        id,
        name: body.name,
        producer: body.producer || 'Unknown',
        region: typeof body.region === 'string' ? body.region : '',
        abv: typeof body.abv === 'number' && !isNaN(body.abv) ? body.abv : undefined,
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
