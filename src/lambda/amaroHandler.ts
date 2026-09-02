import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'AmaroTable';

export interface AmaroItem {
  id: string;
  name: string;
  producer: string;
  region: string;
  abv: number;
  description: string;
  flavorNotes: string[];
  sweetnessLevel: 'bone-dry' | 'dry' | 'semi-sweet' | 'sweet';
  rating?: number;
  dateAdded: string;
}

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

  try {
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
        sweetnessLevel: body.sweetnessLevel || 'semi-sweet',
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
