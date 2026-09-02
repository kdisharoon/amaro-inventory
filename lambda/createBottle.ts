import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AmaroRepository, AmaroBottle } from './shared/amaroRepository';

const randomUUID = (): string => {
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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