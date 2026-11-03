import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { sampleComparisons } from './sampleComparisons';
import { uiFontFamily, socialColors as c } from './theme';

export function SampleGallery() {
  const { width } = useWindowDimensions();
  const columns = width > 640 ? 2 : 1;
  return <View testID="sample-gallery" style={s.gallery}>
    <Text accessibilityRole="header" style={s.heading}>A little inspiration.</Text><Text style={s.hint}>One portrait. A whole new wild side.</Text>
    <View style={s.columns}>{Array.from({ length: columns }, (_, column) => <View key={column} style={s.column}>
      {sampleComparisons.map((sample, index) => index % columns === column ? <View key={sample.id} style={s.card}>
        <Image source={sample.thumbnail} style={{ width: '100%', aspectRatio: sample.width / sample.height }} resizeMode="contain" accessibilityLabel={sample.caption} />
      </View> : null)}
    </View>)}</View>
  </View>;
}
const s = StyleSheet.create({
  gallery: { marginTop: 44 }, heading: { fontFamily: uiFontFamily, fontSize: 22, fontWeight: '600', letterSpacing: -.6, color: c.text, marginBottom: 7 },
  hint: { fontFamily: uiFontFamily, fontSize: 13, lineHeight: 20, color: c.muted }, columns: { flexDirection: 'row', gap: 18, marginTop: 20 }, column: { flex: 1, gap: 18 },
  card: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.paper },
});
