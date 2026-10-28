import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MatchResult } from '../types';
import { colors, serif } from '../theme';
import { Eyebrow, TextLink } from './Primitives';

export function FaceProfilePanel({ result, wide }: { result: MatchResult; wide: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const features = result.features ?? [];
  if (result.isDemo || !features.some(feature => feature.keyword)) return null;
  const observed = features.filter(feature => feature.visibility === 'clear').length;
  const signature = features.filter(feature => feature.visibility === 'clear' && feature.signatureRank != null)
    .sort((a, b) => a.signatureRank! - b.signatureRank!);
  return <View style={styles.panel} testID="face-profile-panel">
    <Eyebrow>THE CARICATURIST’S EYE</Eyebrow>
    {signature.length > 0 ? <View style={styles.signature} testID="artistic-signature">
      <Text accessibilityRole="header" style={styles.title}>The shapes an artist would emphasize.</Text>
      <Text style={styles.body}>These are the AI’s focal choices for this portrait. They guide the animal choice; they are not proof of resemblance. The drawing directions below are imagined exaggerations, not facts or measurements.{result.experience === 'animal-character' ? ' The character editor also sees the actual portrait.' : ''}</Text>
      {signature.map(feature => <View key={feature.feature} style={styles.signatureItem}>
        <Text style={styles.signatureLabel}>{feature.signatureRank}. {feature.feature} · {feature.keyword}</Text>
        <Text style={styles.body}>Observed: {feature.observation}</Text>
        <Text style={styles.emphasis}>Artist’s emphasis: {feature.artisticEmphasis}</Text>
      </View>)}
    </View> : null}
    <Text accessibilityRole="header" style={styles.title}>Your 20-part visual profile.</Text>
    <Text style={styles.body}>{observed} of {features.length} details were marked clearly visible by AI. Uncertain or hidden details do not affect the ranking. These are visual descriptions, not measurements or personality traits.</Text>
    <Text style={styles.body}>{signature.length > 0 ? 'The distinctive shapes above led the comparison of eight animal candidates. Overall facial geometry breaks ties, and iris colour is only a minor accent. Each selected animal must support the focal shapes, not just share generic details.' : 'This profile was extracted before choosing animals. Start a new comparison with the updated API to see the artist’s focal shapes.'}</Text>
    <View style={styles.grid}>{features.map(feature => <View key={feature.feature} style={[styles.item, { flexBasis: wide ? 180 : 130 }]}>
      <Text style={styles.label}>{feature.feature}</Text>
      <Text style={[styles.keyword, feature.visibility !== 'clear' && { color: colors.muted }]}>{feature.visibility === 'clear' ? feature.keyword : 'Not reliably observable'}</Text>
      {expanded ? <Text style={styles.detail}>{feature.observation}</Text> : null}
    </View>)}</View>
    <TextLink onPress={() => setExpanded(value => !value)}>{expanded ? 'Hide visual observations' : 'Show all visual observations'}</TextLink>
    <Text style={styles.detail}>Every submission runs a fresh analysis; previous profiles and animal choices are not reused. Even the same photo can receive different AI suggestions. These comparisons are subjective, not proof of accuracy.</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginTop: 30, padding: 22, gap: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface },
  title: { fontFamily: serif, fontSize: 28, lineHeight: 35, color: colors.ink },
  body: { fontSize: 12, lineHeight: 21, color: colors.muted },
  signature: { gap: 14, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.line },
  signatureItem: { padding: 14, gap: 7, borderRadius: 8, backgroundColor: colors.soft },
  signatureLabel: { fontSize: 13, lineHeight: 21, fontWeight: '600', color: colors.ink },
  emphasis: { fontSize: 12, lineHeight: 21, color: colors.olive, fontStyle: 'italic' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { flexBasis: 180, flexGrow: 1, minWidth: 0, padding: 12, gap: 6, borderRadius: 8, backgroundColor: colors.soft },
  label: { fontSize: 10, color: colors.muted }, keyword: { fontSize: 13, lineHeight: 19, color: colors.ink, fontWeight: '600' },
  detail: { fontSize: 11, lineHeight: 19, color: colors.muted },
});
