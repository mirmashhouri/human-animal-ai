import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import { studioConfig } from './api';
import { extractPalette } from './media';
import { createPortrait, type CreationStage } from './pipeline';
import { exportArtwork } from './export';
import { PortraitResults } from './Results';
import type { Artwork, Inspection, StudioConfig, StudioPhoto } from './types';

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
type Phase = 'idle' | 'picking' | CreationStage | 'exporting';
const progress: Record<Exclude<Phase, 'idle'>, string> = {
  picking: 'Opening your photo…', analyzing: 'Reading your photo and finding your subject…',
  isolating: 'Finding your silhouette…', generating: 'Creating your animal portrait…', exporting: 'Preparing your artwork…',
};
function Action({ label, onPress, disabled = false, secondary = false, icon }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; icon?: keyof typeof Ionicons.glyphMap;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [s.action, secondary ? s.secondary : s.primary, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
    {icon ? <Ionicons name={icon} size={18} color={secondary ? '#315e44' : '#fff'} /> : null}
    <Text style={[s.actionLabel, { color: secondary ? '#315e44' : '#fff' }]}>{label}</Text>
  </Pressable>;
}
export function WildLensStudio() {
  const { width } = useWindowDimensions();
  const [photo, setPhoto] = useState<StudioPhoto | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [demo, setDemo] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const operation = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const resultRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const busy = phase !== 'idle';
  const complete = Boolean(photo && inspection && artwork);
  useEffect(() => {
    const controller = new AbortController(); setConfig(null);
    const timeout = setTimeout(() => controller.abort(), 6000);
    void studioConfig(controller.signal).then(setConfig).catch(() => { if (!controller.signal.aborted) setConfig(null); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [connectionAttempt]);
  useEffect(() => () => operation.current?.abort(), []);
  function reset() {
    operation.current?.abort(); setPhoto(null); setInspection(null); setArtwork(null); setArtReady(false);
    setDemo(false); setError(''); setNotice(''); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  async function choosePhoto(camera = false) {
    if (busyRef.current) return;
    busyRef.current = true; setPhase('picking'); setError(''); setNotice('');
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access or choose a photo from your library.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9, exif: false };
      const picked = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) return;
      if ((asset.fileSize ?? 0) > 15 * 1024 * 1024 || asset.width < 64 || asset.height < 64) throw new Error('Choose a clear portrait under 15 MB and at least 64 pixels wide and tall.');
      const size = asset.width >= asset.height ? { width: Math.min(1024, asset.width) } : { height: Math.min(1024, asset.height) };
      const normalized = await manipulateAsync(asset.uri, [{ resize: size }], { format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!normalized.base64 || normalized.base64.length > 2_796_204) throw new Error('This photo is too large after resizing. Try a smaller portrait.');
      const palette = await extractPalette(normalized.uri);
      setPhoto({ uri: normalized.uri, base64: normalized.base64, palette }); setInspection(null); setArtwork(null);
      setArtReady(false); setDemo(false); scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (e) { setError(e instanceof Error ? e.message : 'This photo could not be opened.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }
  async function generate() {
    if (busyRef.current || !photo || demo || !config?.liveReady) return;
    busyRef.current = true;
    const controller = new AbortController(); operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 390000);
    setError(''); setNotice(''); setArtwork(null); setInspection(null); setArtReady(false);
    try {
      const result = await createPortrait(photo, controller.signal, stage => { if (!controller.signal.aborted) setPhase(stage); });
      if (controller.signal.aborted) return;
      setInspection(result.inspection); setArtwork(result.artwork); scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setError(controller.signal.aborted ? 'Creation stopped. Work already started at Meta may still complete; it was not retried.' : e instanceof Error ? e.message : 'Your portrait could not be created.');
    } finally { clearTimeout(timeout); busyRef.current = false; operation.current = null; setPhase('idle'); }
  }
  function exploreDemo() {
    if (busyRef.current) return;
    setPhoto({ uri: Asset.fromModule(require('../../assets/photos/sample-portrait.jpg')).uri, base64: '', palette: ['#a85f36', '#dbbc8d', '#506b48', '#e7e2d4', '#293b2e'] });
    setInspection({ ticket: 'local-demo', segmentationText: '', segmentationStatus: 'skipped', paletteSource: 'example-palette', promptVersion: 'layout-demo',
      analysis: { subjectVisible: true, title: 'A moment, reimagined.', pose: 'An illustrative portrait direction.', composition: 'Soft woodland colors.',
        animalName: 'Red fox', animalReason: 'An example artistic direction inspired by the shapes of a woodland fox. This is a layout demonstration, not an analysis of the sample portrait.',
        story: 'Warm copper meets the quiet green of a woodland afternoon. A small moment becomes a different kind of self-portrait.',
        palette: ['#a85f36', '#dbbc8d', '#506b48', '#e7e2d4', '#293b2e'] } });
    setArtwork({ image: Asset.fromModule(require('../../assets/photos/red-fox.jpg')).uri, model: 'Reference photograph', promptVersion: 'layout-demo', notice: 'Reference photograph, not generated artwork.' });
    setArtReady(false); setDemo(true); setError(''); setNotice('Local layout demo. No photo was sent to Meta.'); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  async function download() {
    if (!artwork || !inspection || !artReady || demo || busyRef.current) return;
    busyRef.current = true; setPhase('exporting'); setError('');
    try { await exportArtwork(resultRef, artwork.image, inspection.analysis); setNotice('Your animal portrait is ready to keep.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'The image could not be saved.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }
  return <ScrollView ref={scrollRef} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><View style={s.container}>
    <View style={s.nav}><View style={s.brand}><View style={s.brandMark}><Ionicons name="aperture-outline" size={25} color="#fff" /></View><Text style={s.brandName}>WildLens<Text style={{ color: '#bd7048' }}>.</Text></Text></View>
      <Pressable accessibilityRole="button" onPress={() => setShowProcess(v => !v)}><Text style={s.link}>How it works</Text></Pressable></View>
    <View style={[s.hero, complete && { paddingVertical: 27 }]}><Text style={s.eyebrow}>{complete ? (demo ? 'LOCAL LAYOUT DEMO' : 'YOUR WILD PERSPECTIVE') : 'A DIFFERENT KIND OF SELF-PORTRAIT'}</Text>
      <Text accessibilityRole="header" style={[s.headline, { fontSize: width < 600 ? 36 : 48 }]}>{complete ? 'A little human. A little wild.' : 'Your portrait, a little wilder.'}</Text>
      {!complete ? <Text style={s.intro}>One photo. One click. An animal portrait with the details that make it yours.</Text> : null}</View>
    {showProcess ? <View style={s.process}><Text style={s.body}>Upload a clear portrait, then choose Create my animal. Muse Spark interprets visible shapes, pose and colors, and Muse Image creates an animal-inspired portrait from your original photo.</Text>
      <Text style={s.caption}>Powered by Meta’s Muse Spark, SAM and Muse Image. Your photo is sent for processing only when you choose to generate.</Text></View> : null}
    {!complete ? <View style={s.uploadPanel}>
      <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={photo ? 'Change your photo' : 'Upload a photo'} onPress={() => void choosePhoto()} style={[s.photoWell, photo && { borderStyle: 'solid' }]}>
        {photo ? <Image source={{ uri: photo.uri }} accessibilityLabel="Your uploaded photo" style={s.preview} resizeMode="contain" /> : <View style={s.empty}>
          <View style={s.uploadIcon}><Ionicons name="scan-outline" size={34} color="#315e44" /></View><Text style={s.uploadTitle}>Start with you.</Text><Text style={[s.body, { textAlign: 'center' }]}>A clear portrait. Good light. Just you.</Text>
          <View style={s.uploadPill}><Ionicons name="add" size={17} color="#315e44" /><Text style={s.link}>Choose a photo</Text></View><Text style={s.caption}>JPG or PNG · up to 15 MB</Text></View>}
      </Pressable>
      <View style={s.photoActions}><Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Upload photo'} disabled={busy} onPress={() => void choosePhoto()}><Text style={s.link}>{photo ? 'Change photo' : 'Upload photo'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void choosePhoto(true)}><Text style={s.link}>Use camera</Text></Pressable></View>
      {photo ? <><Action icon="sparkles-outline" label="Create my animal" disabled={busy || !config?.liveReady} onPress={() => void generate()} />
        <Text style={[s.caption, { textAlign: 'center' }]}>By generating, you confirm you have permission to use this photo and send it to Meta for analysis and image creation.</Text></> : null}
      {!config?.liveReady ? <Text style={[s.caption, { textAlign: 'center' }]}>Live connection is pending. You can explore the demo while the studio is connected.</Text> : null}
      {busy && phase !== 'exporting' ? <View accessibilityLiveRegion="polite" style={s.progress}><ActivityIndicator color="#315e44" /><Text style={[s.body, { flex: 1 }]}>{progress[phase as Exclude<Phase, 'idle'>]}</Text>
        {phase !== 'picking' ? <Pressable accessibilityRole="button" onPress={() => operation.current?.abort()}><Text style={s.link}>Stop</Text></Pressable> : null}</View> : null}
    </View> : null}
    {complete && photo && inspection && artwork ? <>
      <View style={s.resultActions}>{!demo ? <Action icon="download-outline" label="Save my animal" disabled={busy || !artReady} onPress={() => void download()} /> : null}
        <Action secondary label={demo ? 'Try my own photo' : 'Start over'} disabled={busy} onPress={demo ? () => void choosePhoto() : reset} /></View>
      <View ref={resultRef} collapsable={false}><PortraitResults photo={photo} inspection={inspection} artwork={artwork} demo={demo} onLoad={() => setArtReady(true)}
        onError={() => { setArtwork(null); setArtReady(false); setError('The animal image could not be displayed. No automatic retry was made.'); }} /></View>
    </> : null}
    {error ? <View accessibilityRole="alert" style={s.error}><Ionicons name="alert-circle-outline" size={21} color="#8f3e2d" /><Text style={{ color: '#8f3e2d', flex: 1, lineHeight: 22 }}>{error}</Text></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={[s.caption, { marginTop: 16 }]}>{notice}</Text> : null}
    <View style={s.footer}><Pressable accessibilityRole="button" disabled={busy} onPress={exploreDemo}><Text style={s.link}>Explore the demo</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setShowConnection(v => !v)} style={s.status}><View style={[s.dot, { backgroundColor: config?.liveReady ? '#6a8b5e' : '#b19363' }]} /><Text style={s.caption}>{config?.liveReady ? 'Meta connected' : 'Studio connection'}</Text></Pressable></View>
    {showConnection ? <View style={s.process}><Text style={s.caption}>{config ? 'Backend connected.' : 'Backend not reachable.'} Meta key: {config?.keyConfigured ? 'configured' : 'needed'}. Credit: {config?.creditConfirmed ? 'confirmed' : 'pending'}. Live requests: {config?.paidRequestsEnabled ? 'enabled' : 'off'}.</Text>
      <Pressable accessibilityRole="button" onPress={() => setConnectionAttempt(v => v + 1)}><Text style={s.link}>Refresh connection</Text></Pressable></View> : null}
  </View></ScrollView>;
}
const s = StyleSheet.create({
  page: { backgroundColor: '#f5f3ed', minHeight: '100%', paddingHorizontal: 20, paddingBottom: 30 }, container: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 23, borderBottomWidth: 1, borderColor: '#dce0d4' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { backgroundColor: '#315e44', height: 39, width: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, brandName: { fontFamily: serif, fontSize: 31, letterSpacing: -1, color: '#233d32' },
  hero: { paddingVertical: 37, gap: 13 }, eyebrow: { fontSize: 10, color: '#52704d', fontWeight: '700', letterSpacing: 1.9 }, headline: { fontFamily: serif, color: '#233d32', letterSpacing: -1.6 }, intro: { color: '#737e74', fontSize: 15, lineHeight: 25, maxWidth: 600 },
  uploadPanel: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 22, gap: 17, borderRadius: 19, borderWidth: 1, borderColor: '#dce0d4', backgroundColor: '#fffefa' },
  photoWell: { minHeight: 280, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd3c3', borderRadius: 12, backgroundColor: '#eff2e8', overflow: 'hidden' }, preview: { height: 350, width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 25, minHeight: 280 }, uploadIcon: { height: 61, width: 61, backgroundColor: '#e3e9d9', alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  uploadTitle: { fontFamily: serif, fontSize: 28, color: '#233d32' }, uploadPill: { paddingHorizontal: 18, paddingVertical: 7, backgroundColor: '#e0e8d7', borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 5 },
  photoActions: { flexDirection: 'row', justifyContent: 'center', gap: 28 }, link: { color: '#315e44', fontSize: 12, fontWeight: '600', paddingVertical: 7 },
  body: { fontSize: 14, lineHeight: 23, color: '#647064' }, caption: { fontSize: 11, lineHeight: 18, color: '#798171' },
  action: { minHeight: 47, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: '#315e44' }, secondary: { borderWidth: 1, borderColor: '#dce0d4', backgroundColor: '#fffefa' }, actionLabel: { fontSize: 13, fontWeight: '600' },
  resultActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
  process: { backgroundColor: '#e9eddf', padding: 21, borderRadius: 13, gap: 10, marginBottom: 20 }, progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  error: { marginTop: 20, padding: 17, flexDirection: 'row', gap: 10, backgroundColor: '#f5e7df', borderRadius: 11 }, footer: { borderTopWidth: 1, borderColor: '#dce0d4', paddingTop: 20, marginTop: 35, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, status: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { height: 6, width: 6, borderRadius: 3 },
});
