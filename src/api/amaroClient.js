const API_BASE_URL = import.meta.env.VITE_API_ENDPOINT || '';
class AmaroApiClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    /**
     * Fetch all amari bottles from GET /amaros
     */
    async getBottles() {
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
    async addBottle(payload) {
        const response = await fetch(`${this.baseUrl}/amaros`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`Failed to add amaro bottle (Status ${response.status})`);
        }
        return response.json();
    }
}
export const amaroApiClient = new AmaroApiClient(API_BASE_URL);
