import { forwardRef, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { animalPhoto, animalPhotoUri } from '../data';
import { colors, serif } from '../theme';
import type { Animal, Portrait } from '../types';

export const ComparisonCard = forwardRef<View, {
  portrait: Portrait; animal: Animal; isDemo: boolean; onReady?: (ready: boolean) => void;
}>(function ComparisonCard({ portrait, animal, isDemo, onReady }, ref) {
  const loaded = useRef(new Set<string>());
  const failedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const generated = animal.imageOrigin === 'generated';
  function mark(which: 'human' | 'animal') {
    loaded.current.add(which);
    if (loaded.current.size === 2 && !failedRef.current) onReady?.(true);
  }
  function fail() { failedRef.current = true; setFailed(true); onReady?.(false); }
  return <View ref={ref} collapsable={false} style={styles.card} testID="comparison-card">
    <View style={styles.top}>
      <Text style={styles.brand}>kinform</Text>
      <Text style={styles.edition}>{isDemo ? 'DEMO / NOT AN AI RESULT' : generated ? 'AI ANIMAL CHARACTER' : 'A VISUAL RESEMBLANCE'}</Text>
    </View>
    <View style={styles.pictures}>
      <View style={styles.half}>
        <Image source={{ uri: portrait.uri }} accessibilityLabel={portrait.isSample ? 'Sample human portrait' : 'Your uploaded portrait'}
          style={styles.photo} resizeMode={generated ? 'contain' : 'cover'} onLoad={() => mark('human')} onError={fail} />
        <View style={styles.photoTag}><Text style={styles.photoTagText}>{portrait.isSample ? 'SAMPLE PORTRAIT' : 'YOU'}</Text></View>
      </View>
      <View style={styles.half}>
        {animalPhotoUri(animal) && !failed ? <Image source={animalPhoto(animal)} accessibilityLabel={generated ? `Portrait-inspired cartoon of ${animal.name}` : `Reference photograph of ${animal.name}`}
          style={styles.photo} resizeMode={isDemo ? 'cover' : 'contain'} onLoad={() => mark('animal')} onError={fail} /> :
          <View style={styles.missing}><Text style={styles.scientific}>{generated ? 'Image generation unavailable' : animal.photoReviewStatus === 'no_suitable' ? 'No suitable portrait found' : animal.photoReviewStatus === 'unavailable' ? 'Photo review unavailable' : 'Photo unavailable'}</Text><Text style={styles.credit}>{generated ? animal.imageError ?? 'No animal image was returned. No substitute photo was used.' : 'Use the species source link below. No unrelated image has been substituted.'}</Text></View>}
        <View style={styles.photoTag}><Text style={styles.photoTagText}>{animal.name.toUpperCase()}</Text></View>
      </View>
      <View style={styles.join}><Text style={styles.joinText}>↔</Text></View>
    </View>
    <View style={styles.bottom}>
      <Text style={styles.subtitle}>{isDemo ? 'An example from the wild.' : generated ? 'Your face. Reimagined.' : 'An unexpected resemblance.'}</Text>
      <Text style={styles.animalName}>{animal.name}</Text>
      <Text style={styles.scientific}>{animal.scientificName}</Text>
      <View style={styles.rule} />
      {animal.photoReviewStatus === 'approved' ? <Text style={styles.subtitle}>AI-REVIEWED ANIMAL PORTRAIT</Text> : null}
      {generated ? <Text style={styles.subtitle}>AI CARTOON · INSPIRED BY YOUR PORTRAIT</Text> : null}
      <Text style={styles.credit}>{animal.photoCredit}{animalPhotoUri(animal) ? isDemo ? ' · cropped' : ' · shown in full' : ''}</Text>
      {animal.licenseUrl ? <Text style={styles.license}>{animal.licenseUrl.replace('https://', '')}</Text> : null}
      {!generated ? <Text style={styles.license}>{animal.sourceUrl.replace('https://', '')}</Text> : null}
      {portrait.isSample ? <Text style={styles.license}>Sample portrait: Gromovataya · CC0 · demo only</Text> : null}
      {failed ? <Text style={styles.error}>A photograph could not load. Please reopen this card.</Text> : null}
    </View>
  </View>;
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', borderColor: colors.line, borderWidth: 1 },
  top: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brand: { fontFamily: serif, fontSize: 26, letterSpacing: -1, color: colors.ink },
  edition: { fontSize: 8, letterSpacing: 1, color: colors.muted, maxWidth: '50%', textAlign: 'right' },
  pictures: { flexDirection: 'row', height: 300, gap: 3 },
  half: { flex: 1, backgroundColor: colors.soft, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  missing: { flex: 1, padding: 24, gap: 12, justifyContent: 'center', alignItems: 'center' },
  photoTag: { position: 'absolute', left: 10, bottom: 14, backgroundColor: 'rgba(20,30,20,0.6)', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 4 },
  photoTagText: { color: '#fff', fontSize: 8, letterSpacing: 1, fontWeight: '600' },
  join: { position: 'absolute', top: '45%', left: '50%', marginLeft: -18, width: 36, height: 36, backgroundColor: colors.paper, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  joinText: { color: colors.ink, fontSize: 22 },
  bottom: { padding: 23, alignItems: 'center' },
  subtitle: { fontSize: 11, color: colors.olive, marginBottom: 8 },
  animalName: { fontFamily: serif, fontSize: 31, color: colors.ink, textAlign: 'center' },
  scientific: { fontSize: 11, fontStyle: 'italic', color: colors.muted, marginTop: 6 },
  rule: { height: 1, backgroundColor: colors.line, width: 40, marginVertical: 14 },
  credit: { fontSize: 9, color: colors.muted, textAlign: 'center', lineHeight: 15 },
  license: { fontSize: 8, color: colors.muted, textAlign: 'center', lineHeight: 13 },
  error: { color: colors.error, fontSize: 11, paddingTop: 10 },
});
