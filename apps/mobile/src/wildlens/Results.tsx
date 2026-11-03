import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Artwork, Inspection, StudioPhoto } from './types';
import { shareCaptions, shareCardColors as colors } from './shareCard';
import { uiFontFamily } from './theme';

export function PortraitResults({ photo, inspection, artwork, onLoad, onError }: {
  photo: StudioPhoto; inspection: Inspection; artwork: Artwork; onLoad: () => void; onError: () => void;
}) {
  const { analysis } = inspection;
  const [loadedRatio, setLoadedRatio] = useState({ uri: '', value: 1 });
  const aspectRatio = photo.width && photo.height ? photo.width / photo.height : loadedRatio.uri === photo.uri ? loadedRatio.value : 1;
  useEffect(() => {
    if (photo.width && photo.height) return;
    let active = true;
    Image.getSize(photo.uri, (width, height) => {
      if (active && width > 0 && height > 0) setLoadedRatio({ uri: photo.uri, value: width / height });
    }, () => {});
    return () => { active = false; };
  }, [photo.uri, photo.width, photo.height]);
  const loaded = useRef({ originalSrc: photo.uri, animalSrc: artwork.image, original: false, animal: false, notified: false });
  if (loaded.current.originalSrc !== photo.uri || loaded.current.animalSrc !== artwork.image) {
    loaded.current = { originalSrc: photo.uri, animalSrc: artwork.image, original: false, animal: false, notified: false };
  }
  const pair = loaded.current;
  function imageLoaded(kind: 'original' | 'animal') {
    if (loaded.current !== pair) return;
    pair[kind] = true;
    if (pair.original && pair.animal && !pair.notified) { pair.notified = true; onLoad(); }
  }
  return <View style={s.result} testID="portrait-share-card">
    <View testID="portrait-comparison" style={s.comparison}>
      <View testID="original-portrait-column" style={s.imageColumn}>
        <Image source={{ uri: photo.uri }} style={[s.image, { aspectRatio }]} resizeMode="contain" onLoad={() => imageLoaded('original')}
          onError={onError} accessibilityLabel="Your original portrait" />
      </View>
      <View testID="animal-portrait-column" style={s.imageColumn}>
        <Image key={artwork.image} source={{ uri: artwork.image }} style={[s.image, { aspectRatio }]} resizeMode="contain" onLoad={() => imageLoaded('animal')} onError={onError}
          accessibilityLabel="Your animal portrait" />
      </View>
    </View>
    <View testID="artwork-caption" accessibilityLabel="Your animal portrait phrase" style={s.captions}>
      {shareCaptions(analysis).map((caption, index) => <Text key={caption.id ?? index} testID={caption.id ? `subject-caption-${caption.id}` : 'portrait-caption'} style={s.caption}>{caption.prefix}<Text style={s.animal}>{caption.animal}</Text></Text>)}
    </View>
  </View>;
}

const s = StyleSheet.create({
  result: { backgroundColor: colors.paper, padding: 12, gap: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  comparison: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  imageColumn: { flex: 1, minWidth: 0, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.image },
  image: { width: '100%' },
  captions: { gap: 8, paddingHorizontal: 8, paddingBottom: 7 },
  caption: { fontFamily: uiFontFamily, color: colors.text, fontSize: 17, lineHeight: 25, textAlign: 'center' },
  animal: { fontWeight: '700' },
});
