import type { CreationStage } from './pipeline';

export type CreationLoadingProps = { stage: CreationStage; onStop: () => void; compact?: boolean };
export const loadingCopy: Record<CreationStage, { title: string; detail: string }> = {
  analyzing: { title: 'Finding your wild side…', detail: 'A familiar face. A fresh perspective.' },
  isolating: { title: 'Tracing your silhouette…', detail: 'Keeping the little details that make it you.' },
  generating: { title: 'A little wilder with every line…', detail: 'Your animal portrait is being created. Good things take a moment.' },
};
