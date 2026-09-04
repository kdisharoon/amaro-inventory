import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DetectTextCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const rekognitionClient = new RekognitionClient({});
const translateClient = new TranslateClient({});

const TABLE_NAME = process.env.TABLE_NAME || 'AmaroTable';
const IMAGE_BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || '';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';
const VISION_WEB_DETECTION_ENABLED = (process.env.VISION_WEB_DETECTION_ENABLED || 'false').toLowerCase() === 'true';

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

interface VisionWebEntity {
  description?: string;
  score?: number;
}

interface VisionBestGuessLabel {
  label?: string;
}

interface VisionWebDetection {
  webEntities?: VisionWebEntity[];
  bestGuessLabels?: VisionBestGuessLabel[];
}

interface VisionAnnotateResponse {
  responses?: Array<{
    webDetection?: VisionWebDetection;
  }>;
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
  reddit: ['reddit.com', 'redd.it'],
  blog: ['blog', 'magazine', 'journal', 'review', 'recensione', 'medium', 'substack'],
};

const TAVILY_TIMEOUT_MS = 4500;
const GOOGLE_VISION_TIMEOUT_MS = 4000;


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

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const isGenericAmaroName = (value?: string): boolean => {
  const normalized = normalizeWhitespace((value || '').toLowerCase());
  return !normalized || normalized === 'amaro' || normalized === 'amari' || normalized === 'amaro italiano';
};

const hasSentenceMarkers = (value: string): boolean => {
  const lower = value.toLowerCase();
  return /\b(in cui|che|per offrire|offrire|alternativa|produzione industriale|with|made with|crafted to|offre|lavora)\b/.test(lower);
};

const looksLikeBadNameCandidate = (value?: string): boolean => {
  const candidate = normalizeWhitespace(value || '');
  if (!candidate) return true;
  const words = candidate.split(/\s+/).length;
  if (words > 6) return true;
  if (candidate.length > 48) return true;
  if (/[.,;:!?]/.test(candidate)) return true;
  if (hasSentenceMarkers(candidate)) return true;
  return false;
};

const looksLikeBadProducerCandidate = (value?: string): boolean => {
  const candidate = normalizeWhitespace(value || '');
  if (!candidate) return true;
  if (candidate.length > 64) return true;
  if (candidate.split(/\s+/).length > 8) return true;
  if (hasSentenceMarkers(candidate)) return true;
  return false;
};

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

const looksLikeBrandLine = (line: string): boolean => {
  const normalized = normalizeWhitespace(line);
  if (!normalized || normalized.length < 3 || normalized.length > 48) return false;
  if (/%/.test(normalized)) return false;
  if (/\d/.test(normalized)) return false;
  if (/\b(amaro|liquore|digestivo|prodotto|gradazione|vol)\b/i.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  if (words.length > 4) return false;
  return true;
};

const extractFlavorNotesFromDescription = (text: string): string[] => {
  const normalized = text.toLowerCase();
  const noteMatches: string[] = [];

  const patterns = [
    /(?:notes?|aromas?|hints?|flavors?)\s+of\s+([^.;]+)/gi,
    /(?:with|featuring)\s+([^.;]+?)\s+(?:notes?|aromas?|hints?|flavors?)/gi,
    /(?:note|sentori|aromi)\s+di\s+([^.;]+)/gi,
    /(?:con)\s+([^.;]+?)\s+(?:note|sentori|aromi)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      noteMatches.push(match[1]);
    }
  }

  const splitNotes = noteMatches
    .flatMap((segment) => segment.split(/,| and | e |\//i))
    .map((entry) => normalizeWhitespace(entry.replace(/\b(a|an|the|soft|gentle|balanced|light|subtle|del|della|delle|degli|di|con)\b/gi, '')))
    .map((entry) =>
      entry
        .replace(/\berbe aromatiche\b/gi, 'herbal')
        .replace(/\bagrumi\b/gi, 'citrus')
        .replace(/\barancia\b/gi, 'orange')
        .replace(/\blimone\b/gi, 'lemon')
        .replace(/\berbe\b/gi, 'herbs')
        .replace(/\bginepro\b/gi, 'juniper')
        .replace(/\bcannella\b/gi, 'cinnamon')
        .replace(/\bvaniglia\b/gi, 'vanilla')
        .replace(/\bmenta\b/gi, 'mint')
        .replace(/\brabarbaro\b/gi, 'rhubarb')
        .replace(/\bliquirizia\b/gi, 'licorice')
        .replace(/\bchina\b/gi, 'quinine')
        .replace(/\bcaramello\b/gi, 'caramel')
    )
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
  if (!host) return 4;

  const includesAny = (terms: string[]): boolean => terms.some((term) => host.includes(term));

  if (includesAny(SOURCE_PRIORITY_KEYWORDS.producer)) return 0;
  if (includesAny(SOURCE_PRIORITY_KEYWORDS.retail)) return 1;
  if (includesAny(SOURCE_PRIORITY_KEYWORDS.reddit)) return 2;
  if (includesAny(SOURCE_PRIORITY_KEYWORDS.blog)) return 3;
  return 4;
};

const isHighTrustSource = (url?: string): boolean => {
  const rank = sourcePriorityRank(url);
  return rank === 0 || rank === 1;
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

const sourceBaseWeight = (rank: number): number => {
  if (rank === 0) return 4.0;
  if (rank === 1) return 3.0;
  if (rank === 2) return 2.0;
  if (rank === 3) return 1.4;
  return 1.0;
};

const looksItalian = (text: string): boolean => {
  const sample = text.toLowerCase();
  if (!sample) return false;
  return /\b(il|la|gli|della|delle|degli|amaro|liquore|erbe|sentori|aromi|gradazione|prodotto)\b/.test(sample);
};

const translateToEnglishIfNeeded = async (text?: string): Promise<string | undefined> => {
  const value = normalizeWhitespace(text || '');
  if (!value || !looksItalian(value)) return value || undefined;

  try {
    const response = await translateClient.send(
      new TranslateTextCommand({
        Text: value.slice(0, 4500),
        SourceLanguageCode: 'it',
        TargetLanguageCode: 'en',
      })
    );
    const translated = normalizeWhitespace(response.TranslatedText || '');
    return translated || value;
  } catch (error) {
    console.error('TranslateText failed', error);
    return value;
  }
};

const addVote = (map: Map<string, number>, key: string | undefined, weight: number) => {
  const normalized = normalizeWhitespace(key || '');
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + weight);
};

interface WeightedStringEvidence {
  score: number;
  sources: Set<string>;
}

interface WeightedNumberEvidence {
  score: number;
  sources: Set<string>;
}

const addStringEvidence = (
  map: Map<string, WeightedStringEvidence>,
  key: string | undefined,
  weight: number,
  sourceHost: string,
  isValid: (value?: string) => boolean
) => {
  const normalized = normalizeWhitespace(key || '');
  if (!normalized || !isValid(normalized)) return;
  const existing = map.get(normalized);
  if (existing) {
    existing.score += weight;
    if (sourceHost) existing.sources.add(sourceHost);
  } else {
    map.set(normalized, {
      score: weight,
      sources: sourceHost ? new Set([sourceHost]) : new Set(),
    });
  }
};

const addNumberEvidence = (
  map: Map<number, WeightedNumberEvidence>,
  value: number,
  weight: number,
  sourceHost: string
) => {
  if (!Number.isFinite(value)) return;
  const existing = map.get(value);
  if (existing) {
    existing.score += weight;
    if (sourceHost) existing.sources.add(sourceHost);
  } else {
    map.set(value, {
      score: weight,
      sources: sourceHost ? new Set([sourceHost]) : new Set(),
    });
  }
};

const chooseStrongStringEvidence = (
  map: Map<string, WeightedStringEvidence>,
  minScore: number,
  minSources: number
): string | undefined => {
  let bestValue: string | undefined;
  let bestScore = 0;
  for (const [value, evidence] of map.entries()) {
    if (evidence.sources.size < minSources) continue;
    if (evidence.score > bestScore) {
      bestValue = value;
      bestScore = evidence.score;
    }
  }
  return bestScore >= minScore ? bestValue : undefined;
};

const chooseStrongNumberEvidence = (
  map: Map<number, WeightedNumberEvidence>,
  minScore: number,
  minSources: number
): number | undefined => {
  let bestValue: number | undefined;
  let bestScore = 0;
  for (const [value, evidence] of map.entries()) {
    if (evidence.sources.size < minSources) continue;
    if (evidence.score > bestScore) {
      bestValue = value;
      bestScore = evidence.score;
    }
  }
  return bestScore >= minScore ? bestValue : undefined;
};

const extractAbvCandidates = (text: string): number[] => {
  const matches = Array.from(text.matchAll(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:abv|alc\.?\/vol)?/gi));
  const values = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 5 && value <= 80);
  return Array.from(new Set(values));
};

const extractProducerCandidate = (text: string): string | undefined => {
  const match = text.match(
    /(?:produced by|distilled by|crafted by|prodotto da|distillato da|azienda|distilleria|liquorificio)\s+([^.;,]+)/i
  );
  if (!match?.[1]) return undefined;
  const candidate = normalizeWhitespace(match[1]).slice(0, 80);
  return looksLikeBadProducerCandidate(candidate) ? undefined : candidate;
};

const extractNameCandidate = (text: string): string | undefined => {
  const match = text.match(/\b(amaro\s+[a-z0-9'\- ]{2,60})\b/i);
  if (!match?.[1]) return undefined;
  const candidate = normalizeWhitespace(match[1]).slice(0, 80);
  return looksLikeBadNameCandidate(candidate) ? undefined : candidate;
};

const chooseTopVoted = (votes: Map<string, number>, minScore = 2): string | undefined => {
  let best: string | undefined;
  let bestScore = 0;
  for (const [value, score] of votes.entries()) {
    if (score > bestScore) {
      best = value;
      bestScore = score;
    }
  }
  return bestScore >= minScore ? best : undefined;
};

const chooseTopVotedNumber = (votes: Map<number, number>, minScore = 2): number | undefined => {
  let best: number | undefined;
  let bestScore = 0;
  for (const [value, score] of votes.entries()) {
    if (score > bestScore) {
      best = value;
      bestScore = score;
    }
  }
  return bestScore >= minScore ? best : undefined;
};

const fetchJsonWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<any> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const googleVisionWebDetect = async (imageUrl: string): Promise<string[]> => {
  if (!VISION_WEB_DETECTION_ENABLED || !GOOGLE_VISION_API_KEY) return [];

  let response: Response;
  try {
    response = await fetchJsonWithTimeout(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(GOOGLE_VISION_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                source: {
                  imageUri: imageUrl,
                },
              },
              features: [
                {
                  type: 'WEB_DETECTION',
                  maxResults: 8,
                },
              ],
            },
          ],
        }),
      },
      GOOGLE_VISION_TIMEOUT_MS
    );
  } catch (error) {
    console.error('Google Vision web detection request failed', error);
    return [];
  }

  if (!response.ok) {
    console.error('Google Vision web detection failed', response.status);
    return [];
  }

  const payload = (await response.json()) as VisionAnnotateResponse;
  const detection = payload.responses?.[0]?.webDetection;
  if (!detection) return [];

  const bestGuesses = (detection.bestGuessLabels || [])
    .map((entry) => normalizeWhitespace(entry.label || ''))
    .filter((entry) => entry.length >= 3 && entry.length <= 60);

  const entityHints = (detection.webEntities || [])
    .filter((entry) => (entry.score || 0) >= 0.3)
    .map((entry) => normalizeWhitespace(entry.description || ''))
    .filter((entry) => entry.length >= 3 && entry.length <= 60)
    .filter((entry) => !/^amaro$/i.test(entry));

  return Array.from(new Set([...bestGuesses, ...entityHints])).slice(0, 4);
};

const tavilySearch = async (query: string, language: 'italian' | 'english'): Promise<TavilySearchResult[]> => {
  if (!TAVILY_API_KEY) return [];

  let response: Response;
  try {
    response = await fetchJsonWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          max_results: 4,
          include_answer: false,
          include_raw_content: false,
          include_usage: false,
          topic: 'general',
          country: 'italy',
          language,
        }),
      },
      TAVILY_TIMEOUT_MS
    );
  } catch (error) {
    console.error('Tavily search request failed', error);
    return [];
  }

  if (!response.ok) {
    console.error('Tavily search failed', response.status);
    return [];
  }

  const payload = (await response.json()) as TavilySearchResponse;
  return Array.isArray(payload.results) ? payload.results : [];
};

const tavilyExtract = async (urls: string[], query: string): Promise<Map<string, string>> => {
  if (!TAVILY_API_KEY || urls.length === 0) return new Map();

  let response: Response;
  try {
    response = await fetchJsonWithTimeout(
      'https://api.tavily.com/extract',
      {
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
          chunks_per_source: 2,
          include_usage: false,
        }),
      },
      TAVILY_TIMEOUT_MS
    );
  } catch (error) {
    console.error('Tavily extract request failed', error);
    return new Map();
  }

  if (!response.ok) {
    console.error('Tavily extract failed', response.status);
    return new Map();
  }

  const payload = (await response.json()) as TavilyExtractResponse;
  const output = new Map<string, string>();
  for (const item of payload.results || []) {
    const url = normalizeWhitespace(item.url || '');
    const content = normalizeWhitespace(item.raw_content || '');
    if (url && content) {
      output.set(url, content);
    }
  }
  return output;
};

const pickLikelyName = (lines: string[]): string | undefined => {
  const candidates = lines
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 4 && line.length <= 48)
    .filter((line) => !/%/.test(line));

  let bestLine: string | undefined;
  let bestScore = -Infinity;
  for (const line of candidates) {
    const lower = line.toLowerCase();
    const words = line.split(/\s+/).length;
    const letters = line.replace(/[^a-z]/gi, '');
    const uppercaseRatio = letters.length > 0 ? (letters.match(/[A-Z]/g)?.length || 0) / letters.length : 0;

    let score = 0;
    if (/\bamaro\b/i.test(line)) score += 2;
    if (words <= 4) score += 2;
    if (words >= 7) score -= 2;
    if (uppercaseRatio > 0.55) score += 1;
    if (hasSentenceMarkers(lower)) score -= 3;
    if (/\b(note|sentori|aromi|degustazione|prodotto)\b/i.test(line)) score -= 2;

    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  if (looksLikeBadNameCandidate(bestLine)) return undefined;

  if (bestLine && /^amaro$/i.test(bestLine)) {
    const amaroIndex = lines.findIndex((line) => normalizeWhitespace(line).toLowerCase() === 'amaro');
    if (amaroIndex >= 0) {
      const neighbors = [lines[amaroIndex - 1], lines[amaroIndex + 1], lines[amaroIndex + 2]]
        .map((value) => normalizeWhitespace(value || ''))
        .filter(Boolean)
        .filter((value) => looksLikeBrandLine(value) && !/^amaro$/i.test(value));
      if (neighbors.length > 0) {
        return toTitleCase(`Amaro ${neighbors[0]}`);
      }
    }
  }

  return bestLine;
};

const pickLikelyProducer = (lines: string[], name?: string): string | undefined => {
  const candidate = lines.find((line) => {
    if (name && normalizeWhitespace(line) === name) return false;
    return /distiller|liquor|spirits|azienda|house|fratelli|fratello|brothers/i.test(line);
  });
  const normalized = candidate ? normalizeWhitespace(candidate) : undefined;
  if (normalized && !looksLikeBadProducerCandidate(normalized)) {
    return normalized;
  }

  const fallback = lines
    .map((line) => normalizeWhitespace(line))
    .filter((line) => {
      if (!looksLikeBrandLine(line)) return false;
      if (name && line.toLowerCase() === name.toLowerCase()) return false;
      if (/^amaro$/i.test(line)) return false;
      return true;
    })
    .sort((a, b) => b.length - a.length)[0];

  return fallback && !looksLikeBadProducerCandidate(fallback) ? toTitleCase(fallback) : undefined;
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
  const ocrName = pickLikelyName(lines);
  const ocrProducer = pickLikelyProducer(lines, ocrName);
  const ocrRegion = extractRegion(combinedText);
  const ocrAbv = extractAbv(combinedText);

  let name = ocrName;
  let producer = ocrProducer;
  let region = ocrRegion;
  let abv = ocrAbv;
  const sweetnessLevel = detectSweetness(combinedText);

  let description: string | undefined;
  let flavorNotes: string[] = [];
  let sourceCount = 0;
  const visionHints = await googleVisionWebDetect(imageUrl);

  if (TAVILY_API_KEY && (name || producer)) {
    const baseQueries = buildSearchQueries(name, producer, region).slice(0, 2);
    const hintQueries = visionHints
      .map((hint) => normalizeWhitespace(`${name || ''} ${producer || ''} ${hint} amaro ABV producer region`))
      .filter((query) => query.length >= 8)
      .slice(0, 2);
    const queries = Array.from(new Set([...baseQueries, ...hintQueries])).slice(0, 4);
    const allResults: TavilySearchResult[] = [];
    const languages: Array<'italian' | 'english'> = ['italian', 'english'];

    for (const query of queries) {
      const queryResults = await Promise.all(languages.map((language) => tavilySearch(query, language)));
      allResults.push(...queryResults.flat());
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
    const extractByUrl = await tavilyExtract(
      extractUrls,
      `${name || ''} ${producer || ''} amaro note degustazione flavor notes ABV gradazione regione`
    );
    const sourceTexts = topResults.map((result) => {
      const url = normalizeWhitespace(result.url || '');
      const extracted = extractByUrl.get(url) || '';
      return normalizeWhitespace(`${result.title || ''}. ${result.content || ''}. ${extracted}`);
    });
    const webText = normalizeWhitespace(`${snippetText} ${sourceTexts.join(' ')}`);

    const nameVotes = new Map<string, number>();
    const producerVotes = new Map<string, number>();
    const regionVotes = new Map<string, number>();
    const abvVotes = new Map<number, number>();

    const nameEvidence = new Map<string, WeightedStringEvidence>();
    const producerEvidence = new Map<string, WeightedStringEvidence>();
    const regionEvidence = new Map<string, WeightedStringEvidence>();
    const abvEvidence = new Map<number, WeightedNumberEvidence>();

    if (ocrName) addVote(nameVotes, ocrName, 2.2);
    if (ocrProducer) addVote(producerVotes, ocrProducer, 2.0);
    if (ocrRegion) addVote(regionVotes, ocrRegion, 1.8);
    if (typeof ocrAbv === 'number') abvVotes.set(ocrAbv, (abvVotes.get(ocrAbv) || 0) + 1.8);

    topResults.forEach((result, index) => {
      const text = sourceTexts[index] || '';
      if (!text) return;

      const rank = sourcePriorityRank(result.url);
      const relevancy = Math.max(0, Math.min(1.5, result.score || 0));
      let weight = sourceBaseWeight(rank) + relevancy;
      const host = hostnameForUrl(result.url);

      const lowerText = text.toLowerCase();
      if (ocrName && lowerText.includes(ocrName.toLowerCase())) weight += 0.8;
      if (ocrProducer && lowerText.includes(ocrProducer.toLowerCase())) weight += 0.6;

      addVote(nameVotes, extractNameCandidate(text), weight * 0.9);
      addVote(producerVotes, extractProducerCandidate(text), weight * 1.0);
      addVote(regionVotes, extractRegion(text), weight * 0.9);

      for (const abvValue of extractAbvCandidates(text)) {
        abvVotes.set(abvValue, (abvVotes.get(abvValue) || 0) + weight * 1.1);
      }

      if (isHighTrustSource(result.url)) {
        addStringEvidence(nameEvidence, extractNameCandidate(text), weight, host, (value) => !looksLikeBadNameCandidate(value));
        addStringEvidence(producerEvidence, extractProducerCandidate(text), weight, host, (value) => !looksLikeBadProducerCandidate(value));
        addStringEvidence(regionEvidence, extractRegion(text), weight, host, () => true);
        for (const abvValue of extractAbvCandidates(text)) {
          addNumberEvidence(abvEvidence, abvValue, weight, host);
        }
      }
    });

    const confirmedName = chooseStrongStringEvidence(nameEvidence, 5.2, 2);
    const confirmedProducer = chooseStrongStringEvidence(producerEvidence, 4.8, 2);
    const confirmedRegion = chooseStrongStringEvidence(regionEvidence, 4.0, 2);
    const confirmedAbv = chooseStrongNumberEvidence(abvEvidence, 4.2, 2);

    if (!name || looksLikeBadNameCandidate(name)) {
      name = confirmedName || chooseTopVoted(nameVotes, 2.2) || name;
    }

    if (!producer || looksLikeBadProducerCandidate(producer)) {
      producer = confirmedProducer || chooseTopVoted(producerVotes, 2.2) || producer;
    } else if (confirmedProducer) {
      producer = confirmedProducer;
    }

    if (!region && confirmedRegion) {
      region = confirmedRegion;
    }

    if (typeof abv !== 'number' && typeof confirmedAbv === 'number') {
      abv = confirmedAbv;
    }

    if (!producer) {
      producer = extractLikelyProducerFromWebText(webText) || producer;
    }

    const canUseWebDescription = Boolean(name && !isGenericAmaroName(name) && producer);
    if (canUseWebDescription) {
      description = chooseDescriptionFromWebText(webText, name);
      flavorNotes = extractFlavorNotesFromDescription(webText);
    }

    if (!name || isGenericAmaroName(name)) {
      const guessedName = chooseDescriptionFromWebText(webText)?.split(/[,.]/)[0];
      if (guessedName && /amaro/i.test(guessedName) && !looksLikeBadNameCandidate(guessedName)) {
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

  description = await translateToEnglishIfNeeded(description);
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
