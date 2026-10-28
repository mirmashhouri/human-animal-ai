import type { IsolatedSubject } from './types';
export async function extractPalette(_uri: string): Promise<string[]> { return []; }
export async function isolateSubject(_uri: string, _text: string): Promise<IsolatedSubject> {
  throw new Error('Mask isolation is available in the browser studio. Disable isolation to continue on this device.');
}
