export type SweetnessLevel = 'not-specified' | 'dry' | 'semi-sweet' | 'sweet';
export type BottleStatus = 'unopened' | 'opened' | 'finished';

export const ITALIAN_REGIONS = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
] as const;

export type ItalianRegion = (typeof ITALIAN_REGIONS)[number];

export interface AmaroBottle {
  id: string;
  name: string;
  producer: string;
  region?: ItalianRegion | string;
  abv?: number;
  description: string;
  flavorNotes: string[];
  sweetnessLevel: SweetnessLevel;
  status: BottleStatus;
  imageUrl?: string;
  rating?: number;
  dateAdded: string;
}

export type CreateAmaroBottlePayload = Omit<AmaroBottle, 'id' | 'dateAdded'> & {
  id?: string;
  dateAdded?: string;
};

export type UpdateAmaroBottlePayload = Partial<CreateAmaroBottlePayload>;
