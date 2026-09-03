import { AmaroBottle, CreateAmaroBottlePayload } from '../types/amaro';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      VITE_API_ENDPOINT?: string;
      GOOGLE_CLIENT_ID?: string;
      ADMIN_EMAIL?: string;
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
}

export const amaroApiClient = new AmaroApiClient(API_BASE_URL);
