import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { photos, samplePortrait } from '../data';
import { colors, serif } from '../theme';
import { Button, Eyebrow, Icon, TextLink } from './Primitives';

export function Welcome({ wide, onUpload, onCamera, onSample, onHow }: {
  wide: boolean; onUpload: () => void; onCamera: () => void; onSample: () => void; onHow: () => void;
}) {
  return <View>
    <View style={[styles.hero, wide && styles.heroWide]}>
      <View style={[styles.intro, wide && { flex: 1, paddingRight: 42 }]}>
        <View style={styles.eyebrowRow}><View style={styles.dot} /><Eyebrow>A DIFFERENT KIND OF SELF-PORTRAIT</Eyebrow></View>
        <Text accessibilityRole="header" style={[styles.title, !wide && { fontSize: 51, lineHeight: 58 }]}>
          A little human.{`\n`}<Text style={styles.titleAccent}>A little wild.</Text>
        </Text>
        <Text style={styles.description}>Your face, reimagined as an animal character.{`\n`}One unmistakable animal. Your distinctive shapes.{`\n`}A cartoon portrait with a little more wild.</Text>
        <View style={styles.actions}>
          <Button onPress={onUpload} icon="upload" testID="upload-photo">Create my character</Button>
          <Button onPress={onCamera} icon="camera" secondary>Use camera</Button>
        </View>
        <View style={styles.privacy}><Icon name="shield" size={13} color={colors.olive} /><Text style={styles.privacyText}>Your photo. Your choice. No account needed.</Text></View>
        <TextLink onPress={onSample}>Explore the offline layout demo →</TextLink>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Explore sample human and animal comparison" onPress={onSample}
        style={[styles.visual, wide ? { flex: 1, height: 470 } : { height: 350, marginTop: 15 }]}>
        <View style={styles.imageFrame}>
          <View style={styles.visualImages}>
            <Image source={samplePortrait} style={styles.halfImage} resizeMode="cover" accessibilityLabel="Stock portrait used only to illustrate the comparison layout" />
            <Image source={photos['red-fox']} style={styles.halfImage} resizeMode="cover" accessibilityLabel="Red fox reference photograph" />
          </View>
          <LinearGradient colors={['transparent', 'rgba(20,30,20,0.7)']} style={styles.gradient}>
            <Text style={styles.visualLabel}>REFERENCE PHOTOS · NOT A GENERATED CHARACTER</Text>
            <Text style={styles.visualCaption}>The before-and-after layout.</Text>
          </LinearGradient>
          <View style={styles.visualBadge}><Icon name="aperture" color={colors.olive} size={22} /></View>
        </View>
        <View style={styles.captionStrip}>
          <Text style={styles.captionText}>HUMAN × RED FOX</Text>
          <View style={styles.samplePill}><View style={styles.tinyDot} /><Text style={styles.captionText}>OFFLINE LAYOUT DEMO</Text></View>
        </View>
      </Pressable>
    </View>
    <View style={styles.divider} />
    <View style={[styles.steps, !wide && { gap: 26 }]}>
      {[
        ['01', 'One portrait.', 'A selfie or a favourite photo. Just you, in good light.'],
        ['02', 'One animal character.', 'AI chooses an animal, then draws a cartoon using your portrait.'],
        ['03', 'Made to be shared.', 'Your photo and your character, together in a shareable card.'],
      ].map(([number, title, body]) => <View key={number} style={[styles.step, !wide && { minWidth: '100%' }]}>
        <Text style={styles.stepNumber}>{number}</Text><View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepBody}>{body}</Text>
        </View>
      </View>)}
    </View>
    <View style={styles.bottomNote}><Text style={styles.noteText}>An artist’s interpretation. Not a personality test.</Text>
      <TextLink onPress={onHow}>Behind the character ↗</TextLink></View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { paddingTop: 42, paddingBottom: 44, gap: 20 }, heroWide: { flexDirection: 'row', alignItems: 'center', paddingTop: 72, paddingBottom: 62, gap: 30 },
  intro: { alignItems: 'flex-start' }, eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 26 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.olive },
  title: { fontFamily: serif, fontSize: 66, lineHeight: 76, letterSpacing: -2.5, color: colors.ink },
  titleAccent: { fontStyle: 'italic', color: colors.olive },
  description: { color: colors.muted, fontSize: 15, lineHeight: 26, marginTop: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 30 },
  privacy: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 17 }, privacyText: { fontSize: 11, color: colors.muted },
  visual: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  imageFrame: { flex: 1, position: 'relative' }, visualImages: { flexDirection: 'row', flex: 1, gap: 3 },
  halfImage: { flex: 1, height: '100%', backgroundColor: colors.soft },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingTop: 80 },
  visualLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 2, color: colors.lime, marginBottom: 10 },
  visualCaption: { color: colors.white, fontFamily: serif, fontSize: 25, fontStyle: 'italic' },
  visualBadge: { position: 'absolute', top: '42%', left: '50%', marginLeft: -25, width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.paper, justifyContent: 'center', alignItems: 'center', borderWidth: 5, borderColor: 'rgba(255,255,255,0.5)' },
  captionStrip: { flexDirection: 'row', justifyContent: 'space-between', padding: 17, gap: 6 },
  captionText: { color: colors.muted, fontSize: 8, letterSpacing: 1, fontWeight: '600' },
  samplePill: { flexDirection: 'row', alignItems: 'center', gap: 6 }, tinyDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.olive },
  divider: { height: 1, backgroundColor: colors.line }, steps: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 35, gap: 35 },
  step: { flex: 1, flexDirection: 'row', gap: 17, minWidth: 180 }, stepNumber: { color: '#AAB09B', fontFamily: serif, fontSize: 27 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 7 }, stepBody: { fontSize: 12, lineHeight: 19, color: colors.muted, maxWidth: 245 },
  bottomNote: { paddingTop: 8, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  noteText: { fontFamily: serif, fontStyle: 'italic', color: colors.olive, fontSize: 15 },
});
