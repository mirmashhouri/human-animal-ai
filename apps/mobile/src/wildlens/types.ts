export type StudioConfig = {
  liveReady: boolean; keyConfigured: boolean; creditConfirmed: boolean; paidRequestsEnabled: boolean;
  visionModel: string; imageModel: string; segmentationModel: string; promptVersion: string;
};
export type Direction = {
  subjectVisible: boolean; title: string; pose: string; composition: string;
  animalName: string; animalReason: string; story: string; palette: string[];
  signature?: { feature: string; observation: string; animalTranslation: string; visibility: 'clear' | 'uncertain'; priority: number }[] | null;
  expression?: string | null; atmosphere?: string | null;
  faceProfile?: { subjectVisible: boolean; outline: string; lengthWidth: string; cheekJaw: string; eyes: string; noseMouth: string; lengthClass: string } | null;
  candidates?: { name: string; outlineFit: number; lengthFit: number; eyeFit: number; noseMouthFit: number; majorMismatch: boolean; naturalLengthClass: string; comparison: string; mismatch: string }[] | null;
};
export type Inspection = {
  ticket: string; analysis: Direction; segmentationText: string;
  segmentationStatus: 'segmented' | 'skipped'; paletteSource: string; promptVersion: string;
};
export type Artwork = { image: string; model: string; promptVersion: string; notice: string };
export type StudioPhoto = { uri: string; base64: string; palette: string[] };
export type StudioOptions = { style: string; mood: string; subject: string; segment: boolean };
export type IsolatedSubject = { uri: string; base64: string; count: number };
