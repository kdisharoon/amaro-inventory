import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const snsClient = new SNSClient({});

const TABLE_NAME = process.env.TABLE_NAME || 'AmaroTable';
const RATINGS_TABLE_NAME = process.env.RATINGS_TABLE_NAME || 'AmaroRatingsTable';
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'AmaroUsersTable';
const USER_ALERTS_TOPIC_ARN = process.env.USER_ALERTS_TOPIC_ARN || '';
const IMAGE_BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || '';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
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

export const INTERNATIONAL_REGIONS = [
  'France',
  'Germany',
  'Greece',
] as const;

export const ALL_REGIONS = [
  ...ITALIAN_REGIONS,
  ...INTERNATIONAL_REGIONS,
] as const;

export interface AmaroItem {
  id: string;
  name: string;
  producer: string;
  region?: string;
  abv?: number;
  description: string;
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
  descriptionConfidence: 'low' | 'medium' | 'high';
  descriptionNeedsReview: boolean;
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

  const prompt = `You are an expert sommelier and spirits specialist cataloging an Amaro and herbal liqueur collection.
Analyze this bottle image and identify the exact amaro bottle, including producer details, regional origin, and alcohol percentage (ABV).

Extract and return a JSON object with EXACTLY the following fields:
- "name": (string) The specific name of the amaro (e.g., "Amaro Averna", "Amaro Lucano", "Amaro Nonino Quintessentia", "Cynar", "Braulio", "Jägermeister", "Chartreuse").
- "producer": (string) The company or distillery that produces it (e.g., "Fratelli Averna", "Lucano 1894", "Nonino Distillatori", "Campari Group", "Peloni").
- "region": (string) If Italian, MUST be one of the official 20 Italian regions spelled in Italian: ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"]. If non-Italian, use the country name such as "Germany", "France", or "Greece". If unknown, leave empty or omit.
- "abv": (number) The numerical ABV percentage (e.g., 29, 30, 16.5). If unknown, omit.
- "description": (string) A concise, well-written English description (2-4 sentences) summarizing the amaro's heritage, production style, and taste characteristics.
- "descriptionConfidence": (string) "high", "medium", or "low".
- "descriptionNeedsReview": (boolean) true if confidence is medium or low, otherwise false.`;

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
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
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
    const matched = ALL_REGIONS.find((r) => r.toLowerCase() === region?.toLowerCase());
    region = matched || region;
  }

  const abv = typeof parsed.abv === 'number' && !isNaN(parsed.abv) ? parsed.abv : undefined;
  const description = typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description.trim() : undefined;

  const descConf: BottleAnalysisResult['descriptionConfidence'] =
    ['low', 'medium', 'high'].includes(parsed.descriptionConfidence) ? parsed.descriptionConfidence : 'high';

  return {
    name,
    producer,
    region,
    abv,
    description,
    descriptionConfidence: descConf,
    descriptionNeedsReview: parsed.descriptionNeedsReview ?? (descConf !== 'high'),
  };
};

const extractBearerToken = (headers: APIGatewayProxyEvent['headers']): string | null => {
  const customTokenHeader = headers['X-Amaro-Id-Token'] || headers['x-amaro-id-token'];
  const authHeader = customTokenHeader || headers.Authorization || headers.authorization;
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || authHeader;
};

interface AuthenticatedUser {
  email: string;
  sub: string;
  name?: string;
  picture?: string;
}

export interface UserRecord {
  id: string; // USER#email
  email: string;
  name: string;
  picture?: string;
  status: 'active' | 'blocked';
  role: 'admin' | 'member';
  createdAt: string;
  lastLoginAt: string;
}

export interface UserWithStats extends UserRecord {
  ratingsCount: number;
}

export interface SystemConfig {
  id: string; // __SYSTEM_CONFIG__
  maxUsers: number;
  lastCapacityNotificationAt?: string;
}

const decodeJwtPayload = (token: string): Record<string, any> | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const buff = Buffer.from(normalized, 'base64');
    return JSON.parse(buff.toString('utf-8'));
  } catch {
    return null;
  }
};

const getAuthenticatedUser = async (idToken: string): Promise<AuthenticatedUser | null> => {
  if (!idToken) return null;

  if (GOOGLE_CLIENT_ID) {
    try {
      const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      const response = await fetch(tokenInfoUrl);
      if (!response.ok) {
        console.error('Failed tokeninfo lookup', response.status);
        return null;
      }

      const tokenInfo = (await response.json()) as GoogleTokenInfo & {
        sub?: string;
        name?: string;
        picture?: string;
      };
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      const tokenExp = Number(tokenInfo.exp || '0');
      const isVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';

      if (tokenInfo.aud === GOOGLE_CLIENT_ID && isVerified && tokenExp > nowEpochSeconds && tokenInfo.email) {
        return {
          email: tokenInfo.email.toLowerCase(),
          sub: tokenInfo.sub || tokenInfo.email.toLowerCase(),
          name: tokenInfo.name,
          picture: tokenInfo.picture,
        };
      }
      return null;
    } catch (e) {
      console.error('Error verifying token with Google:', e);
      return null;
    }
  }

  // Fallback for development/testing when GOOGLE_CLIENT_ID is not configured
  try {
    const payload = decodeJwtPayload(idToken);
    if (payload?.email) {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      const exp = Number(payload.exp || '0');
      if (!exp || exp > nowEpochSeconds) {
        return {
          email: String(payload.email).toLowerCase(),
          sub: String(payload.sub || payload.email).toLowerCase(),
          name: typeof payload.name === 'string' ? payload.name : undefined,
          picture: typeof payload.picture === 'string' ? payload.picture : undefined,
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
};

const publishAlertEmail = async (subject: string, message: string): Promise<void> => {
  if (!USER_ALERTS_TOPIC_ARN) {
    console.warn('USER_ALERTS_TOPIC_ARN not configured; skipping email publish:', subject);
    return;
  }
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: USER_ALERTS_TOPIC_ARN,
      Subject: subject.slice(0, 100),
      Message: message,
    }));
    console.log('Successfully published SNS alert:', subject);
  } catch (err) {
    console.error('Failed to send SNS alert email:', err);
  }
};

const getSystemConfig = async (): Promise<SystemConfig> => {
  try {
    const res = await docClient.send(new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: '__SYSTEM_CONFIG__' },
    }));
    if (res.Item) {
      return {
        id: '__SYSTEM_CONFIG__',
        maxUsers: typeof res.Item.maxUsers === 'number' ? res.Item.maxUsers : 10,
        lastCapacityNotificationAt: res.Item.lastCapacityNotificationAt,
      };
    }
  } catch (err) {
    console.error('Failed to fetch system config from DynamoDB:', err);
  }
  return { id: '__SYSTEM_CONFIG__', maxUsers: 10 };
};

const saveSystemConfig = async (config: SystemConfig): Promise<void> => {
  await docClient.send(new PutCommand({
    TableName: USERS_TABLE_NAME,
    Item: config,
  }));
};

const getUserRecord = async (email: string): Promise<UserRecord | null> => {
  try {
    const res = await docClient.send(new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: { id: `USER#${email.toLowerCase()}` },
    }));
    return (res.Item as UserRecord) || null;
  } catch (err) {
    console.error('Failed to get user record:', err);
    return null;
  }
};

const getAllUsers = async (): Promise<UserRecord[]> => {
  try {
    const res = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE_NAME,
    }));
    return (res.Items || []).filter(
      (item) => typeof item.id === 'string' && item.id.startsWith('USER#')
    ) as UserRecord[];
  } catch (err) {
    console.error('Failed to scan users table:', err);
    return [];
  }
};

const isAuthorizedAdmin = async (idToken: string): Promise<boolean> => {
  if (!ADMIN_GOOGLE_EMAIL) {
    console.error('ADMIN_GOOGLE_EMAIL must be configured');
    return false;
  }
  const user = await getAuthenticatedUser(idToken);
  if (!user) return false;
  return user.email === ADMIN_GOOGLE_EMAIL;
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
  const isAllRatingsRequest = resourcePath === '/amaros/ratings' || requestPath.endsWith('/amaros/ratings');
  const isSingleRatingRequest = resourcePath === '/amaros/{id}/rating' || Boolean(requestPath.match(/\/amaros\/[^/]+\/rating$/));

  const isAuthSessionRequest = resourcePath === '/auth/session' || requestPath.endsWith('/auth/session');
  const isAdminUsersRequest = resourcePath === '/admin/users' || requestPath === '/admin/users' || requestPath.endsWith('/admin/users');
  const isAdminUserStatusRequest = resourcePath === '/admin/users/{email}/status' || Boolean(requestPath.match(/\/admin\/users\/[^/]+\/status$/));
  const isAdminSingleUserRequest = resourcePath === '/admin/users/{email}' || (requestPath.startsWith('/admin/users/') && !requestPath.endsWith('/status'));
  const isAdminCapacityRequest = resourcePath === '/admin/capacity' || requestPath.endsWith('/admin/capacity');

  try {
    // Auth: POST /auth/session - Verify Google token, register/update user, enforce capacity, send SNS alerts
    if (httpMethod === 'POST' && isAuthSessionRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing bearer token.' }),
        };
      }

      const authenticatedUser = await getAuthenticatedUser(idToken);
      if (!authenticatedUser) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Invalid or expired Google token.' }),
        };
      }

      const email = authenticatedUser.email;
      const isAdmin = email === ADMIN_GOOGLE_EMAIL;
      let userRec = await getUserRecord(email);
      const config = await getSystemConfig();

      if (userRec) {
        if (userRec.status === 'blocked') {
          return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({
              message: 'Your account has been deactivated or blocked by the administrator.',
              code: 'USER_BLOCKED',
            }),
          };
        }

        userRec.lastLoginAt = new Date().toISOString();
        if (authenticatedUser.name) userRec.name = authenticatedUser.name;
        if (authenticatedUser.picture) userRec.picture = authenticatedUser.picture;
        if (isAdmin) userRec.role = 'admin';

        await docClient.send(new PutCommand({
          TableName: USERS_TABLE_NAME,
          Item: userRec,
        }));

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            user: userRec,
            isAdmin,
            config: { maxUsers: config.maxUsers },
          }),
        };
      }

      // New user sign up - check limit
      const allUsers = await getAllUsers();
      const currentTotal = allUsers.length;

      if (!isAdmin && currentTotal >= config.maxUsers) {
        // Soft rejection: capacity limit reached
        const now = Date.now();
        const lastAlert = config.lastCapacityNotificationAt ? new Date(config.lastCapacityNotificationAt).getTime() : 0;
        if (now - lastAlert > 30 * 60 * 1000) {
          config.lastCapacityNotificationAt = new Date().toISOString();
          await saveSystemConfig(config);
          await publishAlertEmail(
            `[Amaro Inventory] Limit reached: ${currentTotal}/${config.maxUsers} users`,
            `A new user attempted to sign in, but user capacity is full (${currentTotal}/${config.maxUsers}):\n\n` +
            `User: ${authenticatedUser.name || 'Unknown'} (${email})\n` +
            `Timestamp: ${new Date().toLocaleString()}\n\n` +
            `To approve more spaces, log in as administrator and open the User Management dashboard to approve +10 spaces.`
          );
        }

        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            message: 'User registration is currently full. An alert has been sent to the administrator to approve more spaces.',
            code: 'CAPACITY_REACHED',
          }),
        };
      }

      // Register new user
      const newUser: UserRecord = {
        id: `USER#${email}`,
        email,
        name: authenticatedUser.name || email.split('@')[0],
        picture: authenticatedUser.picture || '',
        status: 'active',
        role: isAdmin ? 'admin' : 'member',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      await docClient.send(new PutCommand({
        TableName: USERS_TABLE_NAME,
        Item: newUser,
      }));

      // Send first-time sign-in alert email
      const newTotal = currentTotal + 1;
      await publishAlertEmail(
        `[Amaro Inventory] New user signed in: ${newUser.name}`,
        `A new user signed in to Amaro Inventory for the first time!\n\n` +
        `Name: ${newUser.name}\n` +
        `Email: ${newUser.email}\n` +
        `Role: ${newUser.role}\n` +
        `Joined: ${new Date().toLocaleString()}\n` +
        `Total Registered Users: ${newTotal} / ${config.maxUsers}\n\n` +
        `You can manage, block, or delete this user anytime in the User Management modal.`
      );

      if (newTotal >= config.maxUsers) {
        config.lastCapacityNotificationAt = new Date().toISOString();
        await saveSystemConfig(config);
        await publishAlertEmail(
          `[Amaro Inventory] Action Required: User limit reached (${newTotal}/${config.maxUsers})`,
          `Your Amaro Inventory collection has reached its cap of ${config.maxUsers} users.\n\n` +
          `New sign-ins will be paused until you approve additional space in the admin dashboard.`
        );
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          user: newUser,
          isAdmin,
          config: { maxUsers: config.maxUsers },
        }),
      };
    }

    // Admin: GET /admin/users - List all users with stats
    if (httpMethod === 'GET' && isAdminUsersRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Missing bearer token.' }) };
      }
      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Forbidden. Administrator access required.' }) };
      }

      const users = await getAllUsers();
      const config = await getSystemConfig();

      const usersWithStats: UserWithStats[] = await Promise.all(
        users.map(async (user) => {
          try {
            const countRes = await docClient.send(new QueryCommand({
              TableName: RATINGS_TABLE_NAME,
              KeyConditionExpression: 'userId = :uid',
              ExpressionAttributeValues: { ':uid': user.email },
              Select: 'COUNT',
            }));
            return {
              ...user,
              ratingsCount: countRes.Count || 0,
            };
          } catch (e) {
            console.error('Error fetching rating count for user:', user.email, e);
            return {
              ...user,
              ratingsCount: 0,
            };
          }
        })
      );

      usersWithStats.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (b.role === 'admin' && a.role !== 'admin') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          users: usersWithStats,
          totalUsers: usersWithStats.length,
          maxUsers: config.maxUsers,
        }),
      };
    }

    // Admin: PUT /admin/users/{email}/status - Block or unblock user
    if (httpMethod === 'PUT' && isAdminUserStatusRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Missing bearer token.' }) };
      }
      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Forbidden. Administrator access required.' }) };
      }

      const rawEmail = pathParameters?.email || requestPath.match(/\/admin\/users\/([^/]+)\/status/)?.[1] || '';
      const email = decodeURIComponent(rawEmail).toLowerCase();

      if (!email) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'User email is required.' }) };
      }

      if (email === ADMIN_GOOGLE_EMAIL) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Cannot block the administrator account.' }) };
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const status = body.status === 'blocked' ? 'blocked' : 'active';

      const userRec = await getUserRecord(email);
      if (!userRec) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: `User '${email}' not found.` }) };
      }

      userRec.status = status;
      await docClient.send(new PutCommand({
        TableName: USERS_TABLE_NAME,
        Item: userRec,
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(userRec),
      };
    }

    // Admin: DELETE /admin/users/{email} - Delete user and purge ratings
    if (httpMethod === 'DELETE' && isAdminSingleUserRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Missing bearer token.' }) };
      }
      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Forbidden. Administrator access required.' }) };
      }

      const rawEmail = pathParameters?.email || requestPath.match(/\/admin\/users\/([^/]+)/)?.[1] || '';
      const email = decodeURIComponent(rawEmail).toLowerCase();

      if (!email) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'User email is required.' }) };
      }

      if (email === ADMIN_GOOGLE_EMAIL) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Cannot delete the administrator account.' }) };
      }

      await docClient.send(new DeleteCommand({
        TableName: USERS_TABLE_NAME,
        Key: { id: `USER#${email}` },
      }));

      try {
        const ratingRes = await docClient.send(new QueryCommand({
          TableName: RATINGS_TABLE_NAME,
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': email },
        }));

        if (ratingRes.Items && ratingRes.Items.length > 0) {
          for (const item of ratingRes.Items) {
            await docClient.send(new DeleteCommand({
              TableName: RATINGS_TABLE_NAME,
              Key: {
                userId: email,
                bottleId: item.bottleId,
              },
            }));
          }
        }
      } catch (err) {
        console.error('Error deleting user ratings during purge:', err);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ email, deleted: true }),
      };
    }

    // Admin: GET & POST /admin/capacity - View or expand capacity
    if (isAdminCapacityRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Missing bearer token.' }) };
      }
      const authorized = await isAuthorizedAdmin(idToken);
      if (!authorized) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Forbidden. Administrator access required.' }) };
      }

      const config = await getSystemConfig();

      if (httpMethod === 'GET') {
        const users = await getAllUsers();
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            maxUsers: config.maxUsers,
            totalUsers: users.length,
          }),
        };
      }

      if (httpMethod === 'POST') {
        const body = event.body ? JSON.parse(event.body) : {};
        const increment = typeof body.increment === 'number' ? body.increment : 10;
        const newMax = typeof body.maxUsers === 'number' ? body.maxUsers : config.maxUsers + increment;

        config.maxUsers = Math.max(1, newMax);
        await saveSystemConfig(config);

        const users = await getAllUsers();
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            maxUsers: config.maxUsers,
            totalUsers: users.length,
            updated: true,
          }),
        };
      }
    }

    // Ratings: GET /amaros/ratings - Fetch all ratings for the authenticated user
    if (httpMethod === 'GET' && isAllRatingsRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing bearer token.' }),
        };
      }

      const user = await getAuthenticatedUser(idToken);
      if (!user) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Invalid or expired credentials.' }),
        };
      }

      const userRec = await getUserRecord(user.email);
      if (userRec && userRec.status === 'blocked') {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Your account has been deactivated or blocked by the administrator.', code: 'USER_BLOCKED' }),
        };
      }

      try {
        const command = new QueryCommand({
          TableName: RATINGS_TABLE_NAME,
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: {
            ':uid': user.email,
          },
        });
        const response = await docClient.send(command);
        const ratings = (response.Items || []).map((item) => ({
          bottleId: item.bottleId,
          userId: item.userId,
          score: item.score,
          notes: item.notes || '',
          updatedAt: item.updatedAt,
        }));

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(ratings),
        };
      } catch (err: any) {
        console.error('Failed to fetch ratings from DynamoDB:', err);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Failed to fetch user ratings.' }),
        };
      }
    }

    // Ratings: Single rating endpoints: GET, PUT, DELETE /amaros/{id}/rating
    if (isSingleRatingRequest) {
      const idToken = extractBearerToken(event.headers);
      if (!idToken) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing bearer token.' }),
        };
      }

      const user = await getAuthenticatedUser(idToken);
      if (!user) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Invalid or expired credentials.' }),
        };
      }

      const userRec = await getUserRecord(user.email);
      if (userRec && userRec.status === 'blocked') {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Your account has been deactivated or blocked by the administrator.', code: 'USER_BLOCKED' }),
        };
      }

      const bottleId = pathParameters?.id || requestPath.match(/\/amaros\/([^/]+)\/rating/)?.[1];
      if (!bottleId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Bottle ID is required.' }),
        };
      }

      if (httpMethod === 'GET') {
        try {
          const command = new GetCommand({
            TableName: RATINGS_TABLE_NAME,
            Key: {
              userId: user.email,
              bottleId,
            },
          });
          const response = await docClient.send(command);
          if (!response.Item) {
            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify(null),
            };
          }
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              bottleId: response.Item.bottleId,
              userId: response.Item.userId,
              score: response.Item.score,
              notes: response.Item.notes || '',
              updatedAt: response.Item.updatedAt,
            }),
          };
        } catch (err: any) {
          console.error('Failed to get rating:', err);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Failed to retrieve rating.' }),
          };
        }
      }

      if (httpMethod === 'PUT') {
        if (!event.body) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Request body is required.' }),
          };
        }

        const body = JSON.parse(event.body);
        const score = Number(body.score);
        if (!Number.isInteger(score) || score < 1 || score > 10) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Rating score must be an integer between 1 and 10.' }),
          };
        }

        const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
        if (notes.length > 250) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Rating notes must be at most 250 characters.' }),
          };
        }

        const ratingItem = {
          userId: user.email,
          bottleId,
          score,
          notes,
          updatedAt: new Date().toISOString(),
        };

        try {
          await docClient.send(new PutCommand({
            TableName: RATINGS_TABLE_NAME,
            Item: ratingItem,
          }));

          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(ratingItem),
          };
        } catch (err: any) {
          console.error('Failed to save rating:', err);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Failed to save rating.' }),
          };
        }
      }

      if (httpMethod === 'DELETE') {
        try {
          await docClient.send(new DeleteCommand({
            TableName: RATINGS_TABLE_NAME,
            Key: {
              userId: user.email,
              bottleId,
            },
          }));

          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ bottleId, deleted: true }),
          };
        } catch (err: any) {
          console.error('Failed to delete rating:', err);
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Failed to delete rating.' }),
          };
        }
      }
    }

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

      const { flavorNotes: _removedFlavorNotes, ...existingFields } = existingBottle.Item;
      const updatedItem: AmaroItem = {
        ...existingFields,
        id: pathParameters.id,
        name: body.name,
        producer: body.producer || existingBottle.Item.producer || 'Unknown',
        region: typeof body.region === 'string' ? body.region : (existingBottle.Item.region || ''),
        abv: typeof body.abv === 'number' && !isNaN(body.abv) ? body.abv : (body.abv === null ? undefined : existingBottle.Item.abv),
        description: typeof body.description === 'string' ? body.description : existingBottle.Item.description || '',
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
