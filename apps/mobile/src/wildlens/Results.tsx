import { Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Artwork, Inspection, StudioPhoto } from './types';

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';

export function PortraitResults({ photo, inspection, artwork, demo, onLoad, onError }: {
  photo: StudioPhoto; inspection: Inspection; artwork: Artwork; demo: boolean; onLoad: () => void; onError: () => void;
}) {
  const { width } = useWindowDimensions();
  const { analysis } = inspection;
  const subjects = analysis.groupPhoto ? analysis.subjects ?? [] : [];
  const signature = (analysis.signature ?? []).filter(feature => feature.visibility === 'clear')
    .slice().sort((a, b) => b.priority - a.priority).slice(0, 4);
  return <View style={s.result}>
    <View testID="portrait-comparison" style={s.comparison}>
      <View testID="original-portrait-column" style={s.imageColumn}>
        <Image source={{ uri: photo.uri }} style={s.image} resizeMode="contain" accessibilityLabel={demo ? 'Demo original portrait' : 'Your original portrait'} />
        <View style={s.imageCaption}><Text style={s.label}>{analysis.groupPhoto ? 'Your group' : 'You'}</Text><Text style={s.caption}>{demo ? 'Sample photograph' : 'The original photo'}</Text></View>
      </View>
      <View testID="animal-portrait-column" style={s.imageColumn}>
        <Image key={artwork.image} source={{ uri: artwork.image }} style={s.image} resizeMode="contain" onLoad={onLoad} onError={onError}
          accessibilityLabel={demo ? 'Demo animal reference, not generated' : 'Your animal portrait'} />
        <View style={s.imageCaption}><Text style={s.label}>{analysis.groupPhoto ? 'Your animals' : analysis.animalName}</Text><Text style={s.caption}>{demo ? 'Reference photo · layout demo' : 'Your animal-inspired portrait'}</Text>
          {!demo && inspection.personalization?.status === 'used' && inspection.personalization.examples > 0 ? <Text testID="preference-guidance" style={s.caption}>Guided by your preferences</Text> : null}</View>
      </View>
    </View>
    <View testID="portrait-details" style={s.details}>
      <View style={s.reason}>
        <Text style={s.eyebrow}>{subjects.length > 1 ? 'WHY THESE ANIMALS' : 'WHY THIS ANIMAL'}</Text>
        {subjects.length ? subjects.map(subject => <View key={subject.id} testID={`subject-reason-${subject.id}`} style={s.subjectReason}>
          <Text style={s.caption}>{subject.position}</Text><Text accessibilityRole="header" style={s.sectionTitle}>{subject.animalName}</Text>
          <Text style={s.body}>{subject.animalReason}</Text>
        </View>) : <><Text accessibilityRole="header" style={s.title}>{analysis.animalName}</Text><Text style={s.body}>{analysis.animalReason}</Text></>}
      </View>
      {signature.length ? <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>The details that make it yours</Text>
        <View style={s.features}>{signature.map((feature, index) => <View key={`${feature.feature}-${index}`} style={[s.feature, width >= 800 && { flexBasis: '47%', flexGrow: 1 }]}>
          <Text style={s.label}>{feature.feature}</Text><Text style={s.body}>{feature.observation}</Text>
          <View style={s.transfer}><Text style={s.transferLabel}>IN YOUR ANIMAL</Text><Text style={s.body}>{feature.animalTranslation}</Text></View>
        </View>)}</View>
      </View> : null}
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Your colors</Text>
        <View style={s.palette}>{analysis.palette.map((hex, index) => <View key={`${hex}-${index}`} style={{ flex: 1, gap: 8 }}>
          <View accessibilityLabel={`Palette color ${hex}`} style={[s.swatch, { backgroundColor: hex }]} /><Text style={s.hex}>{hex.toUpperCase()}</Text>
        </View>)}</View>
        <Text style={s.caption}>{demo ? 'Example color palette.' : inspection.paletteSource === 'measured-in-browser' ? 'Sampled from your photo.' : 'A scene palette interpreted from your photo.'}</Text>
      </View>
      {analysis.expression || analysis.atmosphere ? <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Expression & atmosphere</Text>
        {analysis.expression ? <View style={s.description}><Text style={s.label}>Visible expression</Text><Text style={s.body}>{analysis.expression}</Text></View> : null}
        {analysis.atmosphere ? <View style={s.description}><Text style={s.label}>Artwork mood</Text><Text style={s.body}>{analysis.atmosphere}</Text></View> : null}
        <Text style={s.caption}>Mood is an artistic reading of the light, colors and composition.</Text>
      </View> : null}
      <View style={s.section}><Text accessibilityRole="header" style={s.sectionTitle}>A little story</Text><Text style={s.story}>{analysis.story}</Text></View>
      {demo ? <Text style={s.caption}>Local demo: no AI analysis or generation. Portrait: Gromovataya, CC0. Fox: Tomek Niedzwiedz, CC0.</Text> : null}
    </View>
  </View>;
}

const s = StyleSheet.create({
  result: { gap: 25 }, comparison: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  imageColumn: { flex: 1, minWidth: 0, borderRadius: 15, overflow: 'hidden', backgroundColor: '#e9eddf', borderWidth: 1, borderColor: '#dce0d4' },
  image: { width: '100%', aspectRatio: 3 / 4, maxHeight: 560 },
  imageCaption: { paddingHorizontal: 16, paddingVertical: 15, gap: 5, backgroundColor: '#fdfcf6' },
  details: { backgroundColor: '#fffefa', padding: 25, borderRadius: 17, borderWidth: 1, borderColor: '#dce0d4', gap: 25 },
  reason: { gap: 10 }, eyebrow: { color: '#52704d', fontSize: 10, letterSpacing: 1.9, fontWeight: '700' },
  subjectReason: { gap: 7, paddingVertical: 12 },
  title: { fontFamily: serif, fontSize: 33, color: '#233d32', letterSpacing: -0.8 }, section: { borderTopWidth: 1, borderColor: '#e3e6db', paddingTop: 23, gap: 13 },
  sectionTitle: { fontFamily: serif, fontSize: 24, color: '#233d32', letterSpacing: -0.4 },
  label: { fontSize: 13, color: '#233d32', fontWeight: '600' }, body: { fontSize: 14, lineHeight: 23, color: '#647064' },
  caption: { fontSize: 11, color: '#798171', lineHeight: 18 }, features: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  feature: { flexBasis: '100%', padding: 17, borderRadius: 12, backgroundColor: '#f3f5ec', gap: 8 },
  transfer: { borderTopWidth: 1, borderColor: '#dfe5d5', paddingTop: 10, marginTop: 3, gap: 6 }, transferLabel: { fontSize: 9, letterSpacing: 1.4, fontWeight: '700', color: '#5e7654' },
  palette: { flexDirection: 'row', gap: 7 }, swatch: { height: 54, borderRadius: 7 }, hex: { fontSize: 9, color: '#798171' },
  description: { gap: 5 }, story: { fontFamily: serif, fontSize: 21, lineHeight: 32, color: '#53664e' },
});
