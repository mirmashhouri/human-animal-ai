import { Platform } from 'react-native';

export const colors = {
  paper: '#F6F4EC', surface: '#FFFEFA', ink: '#20291F', muted: '#737969',
  olive: '#606C46', lime: '#DCE6BF', line: '#DDDFD2', soft: '#EDEFE3',
  error: '#9D3F31', white: '#FFFFFF',
};
export const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
