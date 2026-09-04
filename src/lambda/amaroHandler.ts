import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DetectTextCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const rekognitionClient = new RekognitionClient({});

const TABLE_NAME = process.env.TABLE_NAME || 'AmaroTable';
const IMAGE_BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || '';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

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

interface BottleAnalysisResult {
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

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: TavilySearchResult[];
}

interface TavilyExtractResult {
  url?: string;
  raw_content?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_GOOGLE_EMAIL = (process.env.ADMIN_GOOGLE_EMAIL || 'kdisharoon@gmail.com').toLowerCase();

const REGION_HINTS = [
  'Sicilia', 'Piemonte', 'Lombardia', 'Veneto', 'Toscana', 'Campania', 'Calabria', 'Sardegna',
  'Trentino', 'Emilia-Romagna', 'Puglia', 'Basilicata', 'Liguria', 'Lazio', 'Umbria', 'Abruzzo',
  'Marche', 'Friuli-Venezia Giulia', 'Molise', 'Valle d\'Aosta'
];

const SEARCH_QUERY_TEMPLATES = [
  '{name} {producer} amaro scheda tecnica gradazione botaniche note degustazione',
  '{name} {region} amaro produttore origine gradazione alcolica',
  '{name} {producer} amaro ABV flavor notes producer origin',
  '{name} {region} amaro tasting notes alcohol percentage',
];

const SOURCE_PRIORITY_KEYWORDS = {
  producer: ['distilleria', 'distillery', 'liquorificio', 'azienda', 'official', 'produttore', 'spirits'],
  retail: ['shop', 'store', 'retail', 'wine', 'enoteca', 'spirits', 'liquor', 'buy', 'acquista'],
  blog: ['blog', 'magazine', 'journal', 'review', 'recensione', 'medium', 'substack'],
};


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

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const splitSentences = (value: string): string[] =>
  value
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

const extractAbv = (text: string): number | undefined => {
  const match = text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:abv|alc\.?\/vol)?/i);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  if (Number.isNaN(numeric)) return undefined;
  if (numeric < 5 || numeric > 80) return undefined;
  return numeric;
};

const detectSweetness = (text: string): 'not-specified' | 'dry' | 'semi-sweet' | 'sweet' => {
  const normalized = text.toLowerCase();
  if (normalized.includes('semi-sweet')) return 'semi-sweet';
  if (normalized.includes('sweet')) return 'sweet';
  if (normalized.includes('dry')) return 'dry';
  return 'not-specified';
};

const extractRegion = (text: string): string | undefined => {
  const normalized = text.toLowerCase();
  const match = REGION_HINTS.find((region) => normalized.includes(region.toLowerCase()));
  return match;
};

const extractFlavorNotesFromDescription = (text: string): string[] => {
  const normalized = text.toLowerCase();
  const noteMatches: string[] = [];

  const patterns = [
    /(?:notes?|aromas?|hints?|flavors?)\s+of\s+([^.;]+)/gi,
    /(?:with|featuring)\s+([^.;]+?)\s+(?:notes?|aromas?|hints?|flavors?)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      noteMatches.push(match[1]);
    }
  }

  const splitNotes = noteMatches
    .flatMap((segment) => segment.split(/,| and |\//i))
    .map((entry) => normalizeWhitespace(entry.replace(/\b(a|an|the|soft|gentle|balanced|light|subtle)\b/gi, '')))
    .filter((entry) => entry.length >= 3 && entry.length <= 40);

  return Array.from(new Set(splitNotes)).slice(0, 6);
};

const buildSearchQueries = (name?: string, producer?: string, region?: string): string[] => {
  const values = {
    name: name || '',
    producer: producer || '',
    region: region || '',
  };

  const rendered = SEARCH_QUERY_TEMPLATES
    .map((template) =>
      template
        .replace('{name}', values.name)
        .replace('{producer}', values.producer)
        .replace('{region}', values.region)
    )
    .map((query) => normalizeWhitespace(query))
    .filter((query) => query.length >= 8);

  return Array.from(new Set(rendered));
};

const hostnameForUrl = (value?: string): string => {
  try {
    if (!value) return '';
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
};

const sourcePriorityRank = (url?: string): number => {
  const host = hostnameForUrl(url);
  if (!host) return 3;

  const includesAny = (terms: string[]): boolean => terms.some((term) => host.includes(term));

  if (includesAny(SOURCE_PRIORITY_KEYWORDS.producer)) return 0;
  if (includesAny(SOURCE_PRIORITY_KEYWORDS.retail)) return 1;
  if (includesAny(SOURCE_PRIORITY_KEYWORDS.blog)) return 2;
  return 3;
};

const extractLikelyProducerFromWebText = (text: string): string | undefined => {
  const match = text.match(/(?:produced by|distilled by|crafted by|from)\s+([^.;,]+)/i);
  if (!match?.[1]) return undefined;
  return normalizeWhitespace(match[1]).slice(0, 80);
};

const chooseDescriptionFromWebText = (text: string, name?: string): string | undefined => {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return undefined;

  const preferred = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    const hasName = name ? lower.includes(name.toLowerCase()) : false;
    const isProfileLike = /amaro|digestif|herbal|bitter|orange|citrus|botanical|abv|alc/i.test(sentence);
    return hasName || isProfileLike;
  });

  const selected = (preferred.length > 0 ? preferred : sentences).slice(0, 2).join(' ');
  return selected ? selected.slice(0, 320) : undefined;
};

const scoreConfidence = (
  sourceCount: number,
  description?: string,
  flavorNotes?: string[],
  hasCoreIdentity?: boolean
): { description: BottleAnalysisResult['descriptionConfidence']; flavorNotes: BottleAnalysisResult['flavorNotesConfidence'] } => {
  let descriptionConfidence: BottleAnalysisResult['descriptionConfidence'] = 'low';
  let flavorNotesConfidence: BottleAnalysisResult['flavorNotesConfidence'] = 'low';

  if (description && sourceCount >= 1) {
    descriptionConfidence = 'medium';
  }
  if (Array.isArray(flavorNotes) && flavorNotes.length >= 1 && sourceCount >= 1) {
    flavorNotesConfidence = 'medium';
  }

  if (description && flavorNotes && flavorNotes.length >= 2 && sourceCount >= 2 && hasCoreIdentity) {
    descriptionConfidence = 'high';
    flavorNotesConfidence = 'high';
  }

  return {
    description: descriptionConfidence,
    flavorNotes: flavorNotesConfidence,
  };
};

const tavilySearch = async (query: string, language: 'italian' | 'english'): Promise<TavilySearchResult[]> => {
  if (!TAVILY_API_KEY) return [];

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_usage: false,
      topic: 'general',
      country: 'italy',
      language,
    }),
  });

  if (!response.ok) {
    console.error('Tavily search failed', response.status);
    return [];
  }

  const payload = (await response.json()) as TavilySearchResponse;
  return Array.isArray(payload.results) ? payload.results : [];
};

const tavilyExtract = async (urls: string[], query: string): Promise<string> => {
  if (!TAVILY_API_KEY || urls.length === 0) return '';

  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      urls,
      query,
      extract_depth: 'basic',
      format: 'text',
      chunks_per_source: 3,
      include_usage: false,
    }),
  });

  if (!response.ok) {
    console.error('Tavily extract failed', response.status);
    return '';
  }

  const payload = (await response.json()) as TavilyExtractResponse;
  const contents = (payload.results || [])
    .map((item) => normalizeWhitespace(item.raw_content || ''))
    .filter(Boolean);
  return contents.join(' ');
};

const pickLikelyName = (lines: string[]): string | undefined => {
  const preferred = lines.find((line) => /amaro\b/i.test(line));
  if (preferred) return normalizeWhitespace(preferred);
  const firstLongLine = lines.find((line) => line.length >= 6 && line.length <= 48);
  return firstLongLine ? normalizeWhitespace(firstLongLine) : undefined;
};

const pickLikelyProducer = (lines: string[], name?: string): string | undefined => {
  const candidate = lines.find((line) => {
    if (name && normalizeWhitespace(line) === name) return false;
    return /distiller|liquor|spirits|azienda|house|fratelli|fratello|brothers/i.test(line);
  });
  return candidate ? normalizeWhitespace(candidate) : undefined;
};

const analyzeBottleImage = async (imageUrl: string): Promise<BottleAnalysisResult> => {
  const s3Key = buildS3KeyFromImageUrl(imageUrl);
  let detectText;

  if (s3Key && IMAGE_BUCKET_NAME) {
    detectText = await rekognitionClient.send(
      new DetectTextCommand({
        Image: {
          S3Object: {
            Bucket: IMAGE_BUCKET_NAME,
            Name: s3Key,
          },
        },
      })
    );
  } else {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Unable to fetch image for analysis (Status ${imageResponse.status})`);
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error('Provided URL is not an image.');
    }

    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    detectText = await rekognitionClient.send(
      new DetectTextCommand({
        Image: {
          Bytes: imageBytes,
        },
      })
    );
  }

  const lines = (detectText.TextDetections || [])
    .filter((item) => item.Type === 'LINE' && item.DetectedText)
    .map((item) => normalizeWhitespace(item.DetectedText || ''))
    .filter(Boolean);

  const combinedText = lines.join(' | ');
  let name = pickLikelyName(lines);
  let producer = pickLikelyProducer(lines, name);
  let region = extractRegion(combinedText);
  let abv = extractAbv(combinedText);
  const sweetnessLevel = detectSweetness(combinedText);

  let description: string | undefined;
  let flavorNotes: string[] = [];
  let sourceCount = 0;

  if (TAVILY_API_KEY && (name || producer)) {
    const queries = buildSearchQueries(name, producer, region);
    const allResults: TavilySearchResult[] = [];
    const languages: Array<'italian' | 'english'> = ['italian', 'english'];

    for (const query of queries) {
      for (const language of languages) {
        const results = await tavilySearch(query, language);
        allResults.push(...results);
      }
      if (allResults.length >= 14) break;
    }

    const dedupedByUrl = new Map<string, TavilySearchResult>();
    for (const result of allResults) {
      const url = (result.url || '').trim();
      if (!url) continue;
      if (!dedupedByUrl.has(url)) {
        dedupedByUrl.set(url, result);
      }
      if (dedupedByUrl.size >= 6) break;
    }

    const topResults = Array.from(dedupedByUrl.values())
      .sort((a, b) => {
        const rankA = sourcePriorityRank(a.url);
        const rankB = sourcePriorityRank(b.url);
        if (rankA !== rankB) return rankA - rankB;
        return (b.score || 0) - (a.score || 0);
      })
      .slice(0, 6);

    sourceCount = topResults.length;
    const snippetText = topResults
      .map((result) => `${result.title || ''}. ${result.content || ''}`)
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean)
      .join(' ');

    const extractUrls = topResults
      .slice(0, 2)
      .map((result) => (result.url || '').trim())
      .filter(Boolean);
    const extractText = await tavilyExtract(
      extractUrls,
      `${name || ''} ${producer || ''} amaro note degustazione flavor notes ABV gradazione regione`
    );
    const webText = normalizeWhitespace(`${snippetText} ${extractText}`);

    if (!producer) {
      producer = extractLikelyProducerFromWebText(webText) || producer;
    }
    if (!region) {
      region = extractRegion(webText) || region;
    }
    if (typeof abv !== 'number') {
      abv = extractAbv(webText);
    }

    description = chooseDescriptionFromWebText(webText, name);
    flavorNotes = extractFlavorNotesFromDescription(webText);

    if (!name) {
      const guessedName = chooseDescriptionFromWebText(webText)?.split(/[,.]/)[0];
      if (guessedName && /amaro/i.test(guessedName)) {
        name = normalizeWhitespace(guessedName).slice(0, 80);
      }
    }
  }

  if (!description) {
    const fallback = lines.slice(0, 3).join(' ');
    description = fallback ? `Label text detected: ${fallback}` : undefined;
  }

  if (flavorNotes.length === 0 && description) {
    flavorNotes = extractFlavorNotesFromDescription(description);
  }

  const confidence = scoreConfidence(
    sourceCount,
    description,
    flavorNotes,
    Boolean(name && producer && typeof abv === 'number')
  );

  const uniqueFlavorNotes = Array.from(new Set(flavorNotes.map((note) => normalizeWhitespace(note)))).slice(0, 6);

  return {
    name,
    producer,
    region,
    abv,
    description,
    flavorNotes: uniqueFlavorNotes,
    sweetnessLevel,
    descriptionConfidence: confidence.description,
    flavorNotesConfidence: confidence.flavorNotes,
    descriptionNeedsReview: confidence.description !== 'high',
    flavorNotesNeedsReview: confidence.flavorNotes !== 'high',
  };
};

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
