export interface AmaroBottle {
  id: string;
  name: string;
  producer: string;
  region: string;
  abv: number;
  description: string;
  flavorNotes: string[];
  sweetnessLevel: 'not-specified' | 'dry' | 'semi-sweet' | 'sweet';
  status: 'unopened' | 'opened' | 'finished';
  imageUrl?: string;
  rating?: number;
  dateAdded: string;
}

export type CreateAmaroBottlePayload = Omit<AmaroBottle, 'id' | 'dateAdded'> & {
  id?: string;
  dateAdded?: string;
};
