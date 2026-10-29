import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WildLensStudio } from './src/wildlens/Studio';
import { lazy, Suspense } from 'react';
import { Platform, Text } from 'react-native';

const TeachingStudio = lazy(() => import('./src/teaching/TeachingStudio'));

export default function WildLensApp() {
  const teaching = Platform.OS === 'web' && typeof window !== 'undefined' &&
    (window.location.pathname === '/teach' || new URLSearchParams(window.location.search).get('studio') === 'teach');
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ed' }}>
    <StatusBar style="dark" />{teaching ? <Suspense fallback={<Text>Opening private studio…</Text>}><TeachingStudio /></Suspense> : <WildLensStudio />}
  </SafeAreaView></SafeAreaProvider>;
}
