import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { AmaroRepository, AmaroBottle } from './shared/amaroRepository';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log('POST /bottles invoked', { event });

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Missing request body' }),
      };
    }

    const payload = JSON.parse(event.body);

    if (!payload.name || !payload.producer || !payload.region || typeof payload.abv !== 'number') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message: 'Validation error: name, producer, region, and abv (number) are required.',
        }),
      };
    }

    const newBottle: AmaroBottle = {
      id: randomUUID(),
      name: payload.name,
      producer: payload.producer,
      region: payload.region,
      abv: payload.abv,
      description: payload.description || '',
      flavorNotes: Array.isArray(payload.flavorNotes) ? payload.flavorNotes : [],
      sweetnessLevel: payload.sweetnessLevel,
      rating: typeof payload.rating === 'number' ? payload.rating : undefined,
      dateAdded: new Date().toISOString(),
    };

    const created = await AmaroRepository.createBottle(newBottle);

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(created),
    };
  } catch (error) {
    console.error('Error creating amaro bottle:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};