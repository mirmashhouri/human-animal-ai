import { Platform } from 'react-native';

export const webFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const uiFontFamily = Platform.OS === 'web' ? webFontFamily : Platform.OS === 'ios' ? 'System' : 'sans-serif';
export const socialColors = { background: '#fafafa', paper: '#ffffff', text: '#262626', muted: '#737373', border: '#dbdbdb', blue: '#0095f6' };
