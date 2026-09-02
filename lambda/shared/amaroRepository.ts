import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

export interface AmaroBottle {
  id: string;
  name: string;
  producer: string;
  region: string;
  abv: number;
  description?: string;
  flavorNotes: string[];
  sweetnessLevel?: 'dry' | 'semi-sweet' | 'sweet';
  rating?: number;
  dateAdded: string;
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.TABLE_NAME || '';

export class AmaroRepository {
  /**
   * Retrieves all amaro bottles from DynamoDB.
   */
  static async getAllBottles(): Promise<AmaroBottle[]> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': 'AMARO',
        ':skPrefix': 'BOTTLE#',
      },
    });

    const response = await docClient.send(command);
    if (!response.Items) return [];

    return response.Items.map((item) => ({
      id: item.id,
      name: item.name,
      producer: item.producer,
      region: item.region,
      abv: item.abv,
      description: item.description,
      flavorNotes: item.flavorNotes || [],
      sweetnessLevel: item.sweetnessLevel,
      rating: item.rating,
      dateAdded: item.dateAdded,
    }));
  }

  /**
   * Saves a new amaro bottle to DynamoDB.
   */
  static async createBottle(bottle: AmaroBottle): Promise<AmaroBottle> {
    const item = {
      PK: 'AMARO',
      SK: `BOTTLE#${bottle.id}`,
      ...bottle,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    });

    await docClient.send(command);
    return bottle;
  }
}