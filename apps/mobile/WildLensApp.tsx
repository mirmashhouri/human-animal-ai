import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WildLensStudio } from './src/wildlens/Studio';

export default function WildLensApp() {
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ed' }}>
    <StatusBar style="dark" /><WildLensStudio />
  </SafeAreaView></SafeAreaProvider>;
}
