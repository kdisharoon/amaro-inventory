export type SweetnessLevel = 'not-specified' | 'dry' | 'semi-sweet' | 'sweet';
export type BottleStatus = 'unopened' | 'opened' | 'finished';

export interface AmaroBottle {
  id: string;
  name: string;
  producer: string;
  region: string;
  abv: number;
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
