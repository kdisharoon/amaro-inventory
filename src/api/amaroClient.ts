import { AmaroBottle, CreateAmaroBottlePayload, UpdateAmaroBottlePayload } from '../types/amaro';

export interface ImageUploadTarget {
  uploadUrl: string;
  imageUrl: string;
}

export interface BottleImageAnalysisResult {
  name?: string;
  producer?: string;
  region?: string;
  abv?: number;
  description?: string;
  flavorNotes?: string[];
  sweetnessLevel?: 'not-specified' | 'dry' | 'semi-sweet' | 'sweet';
  descriptionConfidence?: 'low' | 'medium' | 'high';
  flavorNotesConfidence?: 'low' | 'medium' | 'high';
  descriptionNeedsReview?: boolean;
  flavorNotesNeedsReview?: boolean;
}

declare global {
  interface Window {
    __APP_CONFIG__?: {
      VITE_API_ENDPOINT?: string;
      GOOGLE_CLIENT_ID?: string;
      ADMIN_EMAIL?: string;
      IMAGE_BASE_URL?: string;
    };
    google?: any;
  }
}

const API_BASE_URL =
  window.__APP_CONFIG__?.VITE_API_ENDPOINT || import.meta.env.VITE_API_ENDPOINT || '';

const getJsonBody = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    const text = await response.text();
    if (text.trim().startsWith('<')) {
      throw new Error('API endpoint is misconfigured or returned HTML instead of JSON. Check the deployed runtime config and API URL settings.');
    }
    throw new Error(`${fallbackMessage}. Received unexpected response: ${text.slice(0, 160)}`);
  }

  return response.json() as Promise<T>;
};

const buildApiError = async (response: Response, fallbackMessage: string): Promise<Error> => {
  let detail = '';
  try {
    const payload = await getJsonBody<{
      message?: string;
      error?: string;
    }>(response, fallbackMessage);
    const message = typeof payload?.message === 'string' ? payload.message : '';
    const error = typeof payload?.error === 'string' ? payload.error : '';
    detail = [message, error].filter(Boolean).join(' - ');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    detail = message || 'Response was not valid JSON';
  }

  const suffix = detail ? `: ${detail}` : '';
  return new Error(`${fallbackMessage} (Status ${response.status})${suffix}`);
};

const runFetch = async (input: RequestInfo | URL, init: RequestInit, action: string): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(`${action}: network error. This is often a CORS issue, timeout, or temporary connectivity problem.`);
  }
};

class AmaroApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Fetch all amari bottles from GET /amaros
   */
  async getBottles(): Promise<AmaroBottle[]> {
    if (!this.baseUrl) {
      throw new Error('API endpoint is not configured. Set VITE_API_ENDPOINT or deploy the runtime config script with the API URL.');
    }

    const response = await runFetch(`${this.baseUrl}/amaros`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }, 'Failed to fetch amari catalog');

    if (!response.ok) {
      throw new Error(`Failed to fetch amari catalog (Status ${response.status})`);
    }

    return getJsonBody<AmaroBottle[]>(response, 'Failed to fetch amari catalog');
  }

  /**
   * Add a new amaro bottle via POST /amaros
   */
  async addBottle(payload: CreateAmaroBottlePayload, idToken?: string): Promise<AmaroBottle> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await runFetch(`${this.baseUrl}/amaros`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }, 'Failed to add amaro bottle');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to add amaro bottle');
    }

    return getJsonBody<AmaroBottle>(response, 'Failed to add amaro bottle');
  }

  /**
   * Update an amaro bottle via PUT /amaros/{id}
   */
  async updateBottle(id: string, payload: UpdateAmaroBottlePayload, idToken?: string): Promise<AmaroBottle> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await runFetch(`${this.baseUrl}/amaros/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    }, 'Failed to update amaro bottle');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to update amaro bottle');
    }

    return getJsonBody<AmaroBottle>(response, 'Failed to update amaro bottle');
  }

  /**
   * Delete an amaro bottle via DELETE /amaros/{id}
   */
  async deleteBottle(id: string, idToken?: string): Promise<void> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await runFetch(`${this.baseUrl}/amaros/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    }, 'Failed to delete amaro bottle');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to delete amaro bottle');
    }
  }

  /**
   * Request a presigned URL for uploading a bottle image to S3.
   */
  async requestImageUploadUrl(idToken: string, contentType: string, fileName?: string): Promise<ImageUploadTarget> {
    const response = await runFetch(`${this.baseUrl}/amaros/image-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ contentType, fileName }),
    }, 'Failed to request image upload URL');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to request image upload URL');
    }

    return getJsonBody<ImageUploadTarget>(response, 'Failed to request image upload URL');
  }

  /**
   * Upload an image file directly to S3 using a presigned URL.
   */
  async uploadImageToS3(uploadUrl: string, file: File): Promise<void> {
    const response = await runFetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'image/jpeg',
      },
      body: file,
    }, 'Failed to upload image file to storage');

    if (!response.ok) {
      throw new Error(`Failed to upload image file (Status ${response.status})`);
    }
  }

  /**
   * Analyze a bottle image and return suggested form field values.
   */
  async analyzeBottleImage(idToken: string, imageUrl: string): Promise<BottleImageAnalysisResult> {
    const response = await runFetch(`${this.baseUrl}/amaros/analyze-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ imageUrl }),
    }, 'Failed to analyze bottle image');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to analyze bottle image');
    }

    return getJsonBody<BottleImageAnalysisResult>(response, 'Failed to analyze bottle image');
  }
}

export const amaroApiClient = new AmaroApiClient(API_BASE_URL);
