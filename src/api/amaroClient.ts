import {
  AmaroBottle,
  CreateAmaroBottlePayload,
  UpdateAmaroBottlePayload,
  UserRating,
  SetRatingPayload,
  UserProfile,
  AuthSessionResponse,
  AdminUsersResponse,
  CapacityResponse,
} from '../types/amaro';

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
  descriptionConfidence?: 'low' | 'medium' | 'high';
  descriptionNeedsReview?: boolean;
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

const getApiBaseUrl = (): string => {
  const configuredBaseUrl =
    window.__APP_CONFIG__?.VITE_API_ENDPOINT || import.meta.env.VITE_API_ENDPOINT || '';

  return configuredBaseUrl.replace(/\/$/, '');
};

const getJsonBody = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    const text = await response.text();
    throw new Error(`${fallbackMessage}. Received unexpected non-JSON response (Status ${response.status}): ${text.slice(0, 160)}`);
  }

  return response.json() as Promise<T>;
};

const buildApiError = async (response: Response, fallbackMessage: string): Promise<Error> => {
  let detail = '';
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('+json')) {
      const payload = await response.json();
      const message = typeof payload?.message === 'string' ? payload.message : '';
      const error = typeof payload?.error === 'string' ? payload.error : '';
      detail = [message, error].filter(Boolean).join(' - ');
    } else {
      const text = await response.text();
      detail = text.slice(0, 160);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    detail = message || 'Could not parse error response';
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
  private getConfiguredBaseUrl(): string {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      throw new Error('API endpoint is not configured. Set VITE_API_ENDPOINT or deploy the runtime config script with the API URL.');
    }
    return baseUrl;
  }

  /**
   * Fetch all amari bottles from GET /amaros
   */
  async getBottles(): Promise<AmaroBottle[]> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }, 'Failed to fetch amari catalog');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to fetch amari catalog');
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
      headers['X-Amaro-Id-Token'] = `Bearer ${idToken}`;
    }

    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros`, {
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
      headers['X-Amaro-Id-Token'] = `Bearer ${idToken}`;
    }

    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/${encodeURIComponent(id)}`, {
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
      headers['X-Amaro-Id-Token'] = `Bearer ${idToken}`;
    }

    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/${encodeURIComponent(id)}`, {
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
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/image-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
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
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/analyze-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ imageUrl }),
    }, 'Failed to analyze bottle image');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to analyze bottle image');
    }

    return getJsonBody<BottleImageAnalysisResult>(response, 'Failed to analyze bottle image');
  }

  /**
   * Fetch all ratings for the currently logged-in user via GET /amaros/ratings
   */
  async getUserRatings(idToken: string): Promise<UserRating[]> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/ratings`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to fetch user ratings');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to fetch user ratings');
    }

    return getJsonBody<UserRating[]>(response, 'Failed to fetch user ratings');
  }

  /**
   * Fetch rating for a specific bottle for the currently logged-in user via GET /amaros/{id}/rating
   */
  async getUserRating(idToken: string, bottleId: string): Promise<UserRating | null> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/${encodeURIComponent(bottleId)}/rating`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to fetch bottle rating');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to fetch bottle rating');
    }

    return getJsonBody<UserRating | null>(response, 'Failed to fetch bottle rating');
  }

  /**
   * Set or update rating for a specific bottle via PUT /amaros/{id}/rating
   */
  async setUserRating(idToken: string, bottleId: string, payload: SetRatingPayload): Promise<UserRating> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/${encodeURIComponent(bottleId)}/rating`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    }, 'Failed to save rating');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to save rating');
    }

    return getJsonBody<UserRating>(response, 'Failed to save rating');
  }

  /**
   * Delete rating for a specific bottle via DELETE /amaros/{id}/rating
   */
  async deleteUserRating(idToken: string, bottleId: string): Promise<void> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/amaros/${encodeURIComponent(bottleId)}/rating`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to delete rating');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to delete rating');
    }
  }

  /**
   * Verify session upon Google sign-in via POST /auth/session
   */
  async initAuthSession(idToken: string): Promise<AuthSessionResponse> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/auth/session`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to initialize session');

    if (!response.ok) {
      throw await buildApiError(response, 'Sign-in rejected');
    }

    return getJsonBody<AuthSessionResponse>(response, 'Failed to initialize session');
  }

  /**
   * Admin: Fetch all users via GET /admin/users
   */
  async getAdminUsers(idToken: string): Promise<AdminUsersResponse> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/admin/users`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to fetch users list');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to fetch users list');
    }

    return getJsonBody<AdminUsersResponse>(response, 'Failed to fetch users list');
  }

  /**
   * Admin: Update user status (block/unblock) via PUT /admin/users/{email}/status
   */
  async updateUserStatus(idToken: string, email: string, status: 'active' | 'blocked'): Promise<UserProfile> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/admin/users/${encodeURIComponent(email)}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ status }),
    }, 'Failed to update user status');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to update user status');
    }

    return getJsonBody<UserProfile>(response, 'Failed to update user status');
  }

  /**
   * Admin: Delete user and purge ratings via DELETE /admin/users/{email}
   */
  async deleteUser(idToken: string, email: string): Promise<{ email: string; deleted: boolean }> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/admin/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to delete user');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to delete user');
    }

    return getJsonBody<{ email: string; deleted: boolean }>(response, 'Failed to delete user');
  }

  /**
   * Admin: Expand maximum allowed user capacity via POST /admin/capacity
   */
  async expandCapacity(idToken: string, increment: number = 10): Promise<CapacityResponse> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/admin/capacity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ increment }),
    }, 'Failed to expand user capacity');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to expand user capacity');
    }

    return getJsonBody<CapacityResponse>(response, 'Failed to expand user capacity');
  }

  /**
   * Admin: Get current capacity stats via GET /admin/capacity
   */
  async getCapacity(idToken: string): Promise<CapacityResponse> {
    const baseUrl = this.getConfiguredBaseUrl();

    const response = await runFetch(`${baseUrl}/admin/capacity`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Amaro-Id-Token': `Bearer ${idToken}`,
      },
    }, 'Failed to fetch capacity');

    if (!response.ok) {
      throw await buildApiError(response, 'Failed to fetch capacity');
    }

    return getJsonBody<CapacityResponse>(response, 'Failed to fetch capacity');
  }
}

export const amaroApiClient = new AmaroApiClient();
