export type Animal = {
  id: string;
  name: string;
  scientificName: string;
  family: string;
  description: string;
  traits: string[];
  photoCredit: string;
  licenseUrl: string;
  sourceUrl: string;
  imagePath: string;
  hybridEligible: boolean;
  matchReason?: string | null;
  searchKeywords?: string[] | null;
  imageOrigin?: 'reference' | 'generated';
  imageError?: string | null;
  speciesSourceUrl?: string | null;
  photoStatus?: 'available' | 'unavailable' | 'unverified_species';
  photoReviewStatus?: 'approved' | 'no_suitable' | 'unavailable' | 'disabled' | 'not_reviewed';
};

export type Portrait = { uri: string; base64?: string; isSample: boolean };
export type MatchResult = {
  id: string;
  isDemo: boolean;
  catalogueVersion: string;
  notice: string;
  experience?: 'comparison' | 'animal-character';
  matches: { rank: number; animal: Animal }[];
  features?: { feature: string; observation: string; keyword?: string | null; visibility?: 'clear' | 'uncertain' | 'not_visible' | null;
    salience?: number; artisticEmphasis?: string | null; signatureRank?: number | null }[] | null;
};

export type ServerConfig = {
  mode: 'demo' | 'experimental-live';
  provider: string;
  catalogueSize: number;
  hybridEnabled: boolean;
  model?: string;
  liveReady?: boolean;
  photoReviewEnabled?: boolean;
  photoReviewModel?: string;
  animalImageSource?: 'Generated' | 'Reference';
  imageModel?: string;
  imageQuality?: string;
  analysisCalls?: number;
  analysisFeatureCount?: number;
  analysisCacheEnabled?: boolean;
  artisticSignatureEnabled?: boolean;
  experience?: 'comparison' | 'animal-character';
  resultCount?: number;
  portraitUsedForGeneration?: boolean;
};

export type SpeciesSearch = {
  query: string;
  field: 'common' | 'scientific';
  totalRecords: number;
  offset: number;
  nextOffset: number | null;
  source: string;
  sourceUrl: string;
  notice: string;
  results: { key: number; name: string; scientificName: string; family: string;
    datasetKey: string; sourceUrl: string; datasetUrl: string }[];
};
