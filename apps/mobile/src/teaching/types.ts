export type Crop = { x: number; y: number; width: number; height: number };
export type Trait = { key: string; value: number | null; visibility: 'clear' | 'uncertain' | 'hidden'; importance: number | null; renderInstruction: string };
export type Example = {
  caseId: string; groupId: string; personPosition: string;
  reference: { file: string; originalFile?: string | null; kind?: string; personOnly?: boolean; crop?: Crop | null; [key: string]: unknown };
  acceptedAnimals: string[]; rejectedAnimals: string[]; selectionCues: string[];
  creativeMappings: Record<string, unknown>[]; creativeNotes: string;
  confidence: 'unspecified' | 'certain' | 'alternatives' | 'uncertain'; split: 'unassigned' | 'train' | 'validation' | 'test';
  traits: Trait[]; archived: boolean; revision: number; updatedAt?: string | null;
  traitScale?: 5 | 100; salientFeatures?: string[]; appearance?: Record<string, string>;
  [key: string]: unknown;
};
export type Snapshot = { caseId: string; groupId: string; split: string; acceptedAnimals: string[]; rejectedAnimals: string[]; labelHash: string; revision: number };
export type Prediction = { caseId: string; animals: string[]; error?: string | null; evidence?: { caseId: string; revision: number; score: number }[] | null };
export type Metrics = { cases: number; covered: number; missing: number; groups: number; top1Hits: number; top3Hits: number; rejectedChoices: number; top1Agreement: number | null; top3Agreement: number | null };
export type Run = { id: string; name: string; version: string; source: string; createdAt: string; datasetHash: string; cases: Snapshot[]; predictions: Prediction[]; metrics: Metrics; status: string };
export type Comparison = { comparableCases: number; excludedCases: number; a: Metrics; b: Metrics; top1Delta: number | null };
export type Status = { configured: boolean; authenticated: boolean; metaReady: boolean; promptVersion: string };
export type MemoryStatus = { enabled: boolean; version: string; indexedExamples: number; labeledExamples: number; totalExamples: number; datasetHash: string; updatedAt: string; notice: string };
export const traitLabels: [string, string][] = [
  ['face_ratio', 'Face height / width'], ['face_roundness', 'Face roundness'], ['forehead_width', 'Forehead width'], ['cheek_width', 'Cheek width'], ['jaw_width', 'Jaw width'],
  ['cheek_fullness', 'Cheek fullness'], ['jaw_taper', 'Jaw taper'], ['chin_width', 'Chin width'], ['chin_pointedness', 'Chin pointedness'], ['lower_face_height', 'Lower-face height'],
  ['eye_size', 'Eye size'], ['eye_spacing', 'Eye spacing'], ['eye_roundness', 'Eye roundness'], ['eye_tilt', 'Eye corner tilt'], ['eye_projection', 'Eye prominence'],
  ['nose_length', 'Nose length'], ['nose_width', 'Nose width'], ['nose_projection', 'Nose projection'], ['nose_bridge', 'Nose bridge curve'], ['nose_mouth_gap', 'Nose–mouth gap'],
  ['mouth_width', 'Mouth width'], ['lip_fullness', 'Lip fullness'], ['smile_curve', 'Smile curve'], ['smile_asymmetry', 'Smile asymmetry'], ['tooth_display', 'Tooth display'],
  ['head_turn', 'Head turn'], ['head_tilt', 'Head tilt'], ['ear_prominence', 'Ear prominence'], ['neck_length', 'Neck length'], ['shoulder_width', 'Shoulder width'], ['forehead_height','Forehead height'], ['brow_thickness','Eyebrow thickness'],
];
