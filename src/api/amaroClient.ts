import { AmaroBottle, CreateAmaroBottlePayload } from '../types/amaro';

export interface ImageUploadTarget {
  uploadUrl: string;
  imageUrl: string;
}

export interface ImportedImageResult {
  imageUrl: string;
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

class AmaroApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Fetch all amari bottles from GET /amaros
   */
  async getBottles(): Promise<AmaroBottle[]> {
    const response = await fetch(`${this.baseUrl}/amaros`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch amari catalog (Status ${response.status})`);
    }

    return response.json();
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

    const response = await fetch(`${this.baseUrl}/amaros`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to add amaro bottle (Status ${response.status})`);
    }

    return response.json();
  }

  /**
   * Request a presigned URL for uploading a bottle image to S3.
   */
  async requestImageUploadUrl(idToken: string, contentType: string, fileName?: string): Promise<ImageUploadTarget> {
    const response = await fetch(`${this.baseUrl}/amaros/image-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ contentType, fileName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to request image upload URL (Status ${response.status})`);
    }

    return response.json() as Promise<ImageUploadTarget>;
  }

  /**
   * Upload an image file directly to S3 using a presigned URL.
   */
  async uploadImageToS3(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'image/jpeg',
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload image file (Status ${response.status})`);
    }
  }

  /**
   * Import an externally hosted image URL into S3 storage.
   */
  async importImageFromUrl(idToken: string, sourceUrl: string): Promise<ImportedImageResult> {
    const response = await fetch(`${this.baseUrl}/amaros/import-image-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ sourceUrl }),
    });

    if (!response.ok) {
      throw new Error(`Failed to import internet image (Status ${response.status})`);
    }

    return response.json() as Promise<ImportedImageResult>;
  }
}

export const amaroApiClient = new AmaroApiClient(API_BASE_URL);
