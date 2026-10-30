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

export const INTERNATIONAL_REGIONS = [
  'France',
  'Germany',
  'Greece',
] as const;

export const REGIONS = [
  ...ITALIAN_REGIONS,
  ...INTERNATIONAL_REGIONS,
] as const;

export type ItalianRegion = (typeof ITALIAN_REGIONS)[number];
export type InternationalRegion = (typeof INTERNATIONAL_REGIONS)[number];
export type Region = (typeof REGIONS)[number];

export interface AmaroBottle {
  id: string;
  name: string;
  producer: string;
  region?: Region | ItalianRegion | string;
  abv?: number;
  description: string;
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

export interface UserRating {
  bottleId: string;
  userId: string;
  score: number;
  notes?: string;
  updatedAt: string;
}

export interface SetRatingPayload {
  score: number;
  notes?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  status: 'active' | 'blocked';
  role: 'admin' | 'member';
  createdAt: string;
  lastLoginAt: string;
  ratingsCount?: number;
}

export interface AuthSessionResponse {
  user: UserProfile;
  isAdmin: boolean;
  config: {
    maxUsers: number;
  };
}

export interface AdminUsersResponse {
  users: UserProfile[];
  totalUsers: number;
  maxUsers: number;
}

export interface CapacityResponse {
  maxUsers: number;
  totalUsers: number;
  updated?: boolean;
}
