export type StudioConfig = {
  liveReady: boolean; keyConfigured: boolean; creditConfirmed: boolean; paidRequestsEnabled: boolean;
  visionModel: string; imageModel: string; segmentationModel: string; promptVersion: string;
};
export type Direction = {
  subjectVisible: boolean; title: string; pose: string; composition: string;
  animalName: string; animalReason: string; story: string; palette: string[];
};
export type Inspection = {
  ticket: string; analysis: Direction; segmentationText: string;
  segmentationStatus: 'segmented' | 'skipped'; paletteSource: string; promptVersion: string;
};
export type Artwork = { image: string; model: string; promptVersion: string; notice: string };
export type StudioPhoto = { uri: string; base64: string; palette: string[] };
export type StudioOptions = { style: string; mood: string; subject: string; segment: boolean };
export type IsolatedSubject = { uri: string; base64: string; count: number };
