import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { archiveCard, studioConfig } from './api';
import { extractPalette } from './media';
import { createPortrait, type CreationStage } from './pipeline';
import { exportArtwork, serializeArtwork } from './export';
import { PortraitResults } from './Results';
import { CameraCapture } from './CameraCapture';
import type { CameraPhoto } from './cameraTypes';
import type { Artwork, Inspection, StudioConfig, StudioPhoto } from './types';
import { uiFontFamily, socialColors as c } from './theme';

const gradient = ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5'] as const;
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
    {icon ? <Ionicons name={icon} size={18} color={secondary ? c.text : '#fff'} /> : null}
    <Text style={[s.actionLabel, { color: secondary ? c.text : '#fff' }]}>{label}</Text>
  </Pressable>;
}
export function WildLensStudio() {
  const { width, height } = useWindowDimensions();
  const [photo, setPhoto] = useState<StudioPhoto | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [archiveError, setArchiveError] = useState('');
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const operation = useRef<AbortController | null>(null);
  const archiveOperation = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const resultRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const busy = phase !== 'idle';
  const complete = Boolean(photo && inspection && artwork);
  const compact = width < 600;
  const panelPadding = compact ? 14 : 20;
  const previewWidth = Math.max(1, Math.min(620, width - 36) - panelPadding * 2 - 2);
  const previewHeight = photo ? Math.min(previewWidth / ((photo.width ?? 1) / (photo.height ?? 1)), Math.max(96, Math.min(440, height - 350))) : 0;
  useEffect(() => {
    const controller = new AbortController(); setConfig(null);
    const timeout = setTimeout(() => controller.abort(), 6000);
    void studioConfig(controller.signal).then(setConfig).catch(() => { if (!controller.signal.aborted) setConfig(null); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [connectionAttempt]);
  useEffect(() => () => { operation.current?.abort(); archiveOperation.current?.abort(); }, []);
  function reset() {
    operation.current?.abort(); archiveOperation.current?.abort(); archiveOperation.current = null;
    setPhoto(null); setInspection(null); setArtwork(null); setArtReady(false); setArchiveStatus('idle'); setArchiveError('');
    setError(''); setNotice(''); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  async function preparePhoto(asset: CameraPhoto & { fileSize?: number }) {
    if ((asset.fileSize ?? 0) > 15 * 1024 * 1024 || asset.width < 64 || asset.height < 64) throw new Error('Choose a clear portrait under 15 MB and at least 64 pixels wide and tall.');
    const size = asset.width >= asset.height ? { width: Math.min(1024, asset.width) } : { height: Math.min(1024, asset.height) };
    const normalized = await manipulateAsync(asset.uri, [{ resize: size }], { format: SaveFormat.JPEG, compress: 0.85, base64: true });
    if (!normalized.base64 || normalized.base64.length > 2_796_204) throw new Error('This photo is too large after resizing. Try a smaller portrait.');
    const palette = await extractPalette(normalized.uri);
    setPhoto({ uri: normalized.uri, base64: normalized.base64, palette, width: normalized.width, height: normalized.height }); setInspection(null); setArtwork(null);
    setArtReady(false); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  async function acceptCameraPhoto(captured: CameraPhoto) {
    setCameraOpen(false);
    if (busyRef.current) return;
    busyRef.current = true; setPhase('picking'); setError(''); setNotice('');
    try { await preparePhoto(captured); }
    catch (e) { setError(e instanceof Error ? e.message : 'The camera photo could not be opened.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }
  async function choosePhoto(camera = false) {
    if (busyRef.current) return;
    if (camera && Platform.OS === 'web') { setCameraOpen(true); return; }
    busyRef.current = true; setPhase('picking'); setError(''); setNotice('');
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access or choose a photo from your library.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9, exif: false, cameraType: ImagePicker.CameraType.front };
      const picked = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) return;
      await preparePhoto(asset);
    } catch (e) { setError(e instanceof Error ? e.message : 'This photo could not be opened.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }
  async function generate() {
    if (busyRef.current || !photo || !config?.liveReady) return;
    busyRef.current = true;
    const controller = new AbortController(); operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 390000);
    setError(''); setNotice(''); setArtwork(null); setInspection(null); setArtReady(false); setArchiveStatus('idle'); setArchiveError('');
    try {
      const result = await createPortrait(photo, controller.signal, stage => { if (!controller.signal.aborted) setPhase(stage); });
      if (controller.signal.aborted) return;
      setInspection(result.inspection); setArtwork(result.artwork); scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setError(controller.signal.aborted ? 'Creation stopped. Work already started at Meta may still complete; it was not retried.' : e instanceof Error ? e.message : 'Your portrait could not be created.');
    } finally { clearTimeout(timeout); busyRef.current = false; operation.current = null; setPhase('idle'); }
  }
  async function saveServerCopy() {
    if (!config?.archiveEnabled || !photo || !artwork?.archiveToken || !inspection || archiveOperation.current) return;
    const controller = new AbortController(); archiveOperation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    setArchiveStatus('saving'); setArchiveError('');
    try {
      const encoded = await serializeArtwork(resultRef, photo, artwork.image, inspection.analysis);
      controller.signal.throwIfAborted();
      await archiveCard(encoded, artwork.archiveToken, controller.signal);
      if (!controller.signal.aborted) setArchiveStatus('saved');
    } catch (e) {
      if (archiveOperation.current === controller) {
        setArchiveStatus('failed');
        setArchiveError(controller.signal.aborted ? 'The server save timed out. You can retry saving or download your card.' : e instanceof Error ? e.message : 'The server copy could not be saved. You can still download your card.');
      }
    } finally {
      clearTimeout(timeout);
      if (archiveOperation.current === controller) archiveOperation.current = null;
    }
  }
  async function download() {
    if (!photo || !artwork || !inspection || !artReady || busyRef.current) return;
    busyRef.current = true; setPhase('exporting'); setError('');
    try { await exportArtwork(resultRef, photo, artwork.image, inspection.analysis); setNotice('Your portraits and caption are saved together.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'The image could not be saved.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }
  return <><ScrollView ref={scrollRef} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><View style={s.container}>
    <View style={s.nav}><View style={s.brand}><Image source={require('../../assets/wildfie-icon.png')} style={s.brandMark} accessibilityLabel="Wildfie camera and paw icon" /><Text style={s.brandName}>Wildfie<Text style={{ color: '#d62976' }}>.</Text></Text></View>
      <Pressable accessibilityRole="button" onPress={() => setShowProcess(v => !v)}><Text style={s.link}>How it works</Text></Pressable></View>
    <View style={[s.hero, photo && { paddingVertical: 16 }]}>{!photo ? <Text style={s.eyebrow}>A DIFFERENT KIND OF SELF-PORTRAIT</Text> : null}
      <Text accessibilityRole="header" style={[s.headline, { fontSize: photo ? 24 : compact ? 32 : 40 }]}>{complete ? 'Your wild side.' : photo ? 'Your wild side awaits.' : 'Your selfie, a little wilder.'}</Text>
      {!photo ? <Text style={s.intro}>One photo. One click. An animal portrait with the details that make it yours.</Text> : null}</View>
    {showProcess ? <View style={s.process}><Text style={s.body}>Upload a clear photo, then choose Create my animal. Each clear face gets its own animal inspiration. Muse Image creates one portrait, keeping your group together in the same positions.</Text>
      <Text style={s.caption}>Powered by Meta’s Muse Spark, SAM and Muse Image. Your photo is sent for processing only when you choose to generate.</Text></View> : null}
    {!complete ? <View testID="upload-panel" style={[s.uploadPanel, { padding: panelPadding, gap: compact ? 12 : 17 }]}>
      <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={photo ? 'Change your photo' : 'Upload a photo'} onPress={() => void choosePhoto()} style={[s.photoWell, photo && { borderStyle: 'solid', minHeight: 0 }]}>
        {photo ? <Image source={{ uri: photo.uri }} accessibilityLabel="Your uploaded photo" style={[s.preview, { height: previewHeight }]} resizeMode="contain" /> : <View style={[s.empty, compact && { minHeight: Math.min(270, height * 0.35), padding: 16 }]}>
          <LinearGradient colors={gradient} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={s.uploadRing}><View style={s.uploadIcon}><Ionicons name="images-outline" size={32} color={c.text} /></View></LinearGradient><Text style={s.uploadTitle}>Start with you.</Text><Text style={[s.body, { textAlign: 'center' }]}>Good light. Clear faces. Solo or together.</Text>
          <View style={s.uploadPill}><Ionicons name="add" size={17} color={c.blue} /><Text style={s.link}>Choose a photo</Text></View><Text style={s.caption}>JPG or PNG · up to 15 MB</Text></View>}
      </Pressable>
      <View style={s.photoActions}><Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Upload photo'} disabled={busy} onPress={() => void choosePhoto()}><Text style={s.link}>{photo ? 'Change photo' : 'Upload photo'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void choosePhoto(true)}><Text style={s.link}>Use camera</Text></Pressable></View>
      {photo ? <><Action icon="sparkles-outline" label="Create my animal" disabled={busy || !config?.liveReady} onPress={() => void generate()} />
        <Text style={[s.caption, { textAlign: 'center' }]}>By generating, you confirm you have permission to use this photo and send it to Meta for analysis and image creation.{config?.archiveEnabled ? ' A copy of your final comparison card will be saved on our server.' : ''}</Text></> : null}
      {!config?.liveReady ? <View style={{ alignItems: 'center' }}><Text style={[s.caption, { textAlign: 'center' }]}>The studio connection is unavailable.</Text><Pressable accessibilityRole="button" onPress={() => setConnectionAttempt(value => value + 1)}><Text style={s.link}>Retry connection</Text></Pressable></View> : null}
      {busy && phase !== 'exporting' ? <View accessibilityLiveRegion="polite" style={s.progress}><ActivityIndicator color={c.blue} /><Text style={[s.body, { flex: 1 }]}>{progress[phase as Exclude<Phase, 'idle'>]}</Text>
        {phase !== 'picking' ? <Pressable accessibilityRole="button" onPress={() => operation.current?.abort()}><Text style={s.link}>Stop</Text></Pressable> : null}</View> : null}
    </View> : null}
    {complete && photo && inspection && artwork ? <>
      <View style={s.resultActions}><Action icon="download-outline" label="Save image" disabled={busy || !artReady} onPress={() => void download()} />
        <Action secondary label="Start over" disabled={busy} onPress={reset} /></View>
      <View ref={resultRef} collapsable={false}><PortraitResults photo={photo} inspection={inspection} artwork={artwork} onLoad={() => { setArtReady(true); void saveServerCopy(); }}
        onError={() => { setArtwork(null); setArtReady(false); setError('One of the portraits could not be displayed. No automatic retry was made.'); }} /></View>
      {/* {archiveStatus === 'saving' ? <Text accessibilityLiveRegion="polite" style={[s.caption, { marginTop: 12 }]}>Saving a server copy…</Text> : null}
      {archiveStatus === 'saved' ? <Text testID="server-save-status" accessibilityLiveRegion="polite" style={[s.caption, { marginTop: 12 }]}>Server copy saved.</Text> : null}
      {archiveStatus === 'failed' ? <View style={{ marginTop: 12 }}><Text accessibilityRole="alert" style={s.caption}>{archiveError}</Text><Pressable accessibilityRole="button" onPress={() => void saveServerCopy()}><Text style={s.link}>Retry server save</Text></Pressable></View> : null} */}
    </> : null}
    {error ? <View accessibilityRole="alert" style={s.error}><Ionicons name="alert-circle-outline" size={21} color="#8f3e2d" /><Text style={{ color: '#8f3e2d', flex: 1, lineHeight: 22 }}>{error}</Text></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={[s.caption, { marginTop: 16 }]}>{notice}</Text> : null}
  </View></ScrollView>{cameraOpen ? <CameraCapture onClose={() => setCameraOpen(false)} onCapture={captured => void acceptCameraPhoto(captured)} /> : null}</>;
}
const s = StyleSheet.create({
  page: { backgroundColor: c.background, minHeight: '100%', paddingHorizontal: 18, paddingBottom: 28 }, container: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 1, borderColor: c.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { height: 34, width: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, brandName: { fontFamily: uiFontFamily, fontSize: 26, fontWeight: '700', letterSpacing: -1, color: c.text },
  hero: { paddingVertical: 32, gap: 11 }, eyebrow: { fontFamily: uiFontFamily, fontSize: 10, color: c.muted, fontWeight: '600', letterSpacing: 1.3 }, headline: { fontFamily: uiFontFamily, fontWeight: '700', color: c.text, letterSpacing: -1 }, intro: { fontFamily: uiFontFamily, color: c.muted, fontSize: 15, lineHeight: 24, maxWidth: 600 },
  uploadPanel: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 20, gap: 17, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.paper },
  photoWell: { minHeight: 280, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 7, backgroundColor: '#fafafa', overflow: 'hidden' }, preview: { width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 25, minHeight: 310 }, uploadRing: { height: 76, width: 76, borderRadius: 38, padding: 3 }, uploadIcon: { flex: 1, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', borderRadius: 36 },
  uploadTitle: { fontFamily: uiFontFamily, fontSize: 24, fontWeight: '600', color: c.text }, uploadPill: { paddingHorizontal: 14, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  photoActions: { flexDirection: 'row', justifyContent: 'center', gap: 28 }, link: { fontFamily: uiFontFamily, color: c.blue, fontSize: 13, fontWeight: '600', paddingVertical: 11 },
  body: { fontFamily: uiFontFamily, fontSize: 14, lineHeight: 22, color: c.muted }, caption: { fontFamily: uiFontFamily, fontSize: 11, lineHeight: 18, color: c.muted },
  action: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: c.blue }, secondary: { borderWidth: 1, borderColor: c.border, backgroundColor: c.paper }, actionLabel: { fontFamily: uiFontFamily, fontSize: 14, fontWeight: '600' },
  resultActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
  process: { backgroundColor: c.paper, borderWidth: 1, borderColor: c.border, padding: 20, borderRadius: 9, gap: 10, marginBottom: 20 }, progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  error: { marginTop: 20, padding: 17, flexDirection: 'row', gap: 10, backgroundColor: '#fff2ef', borderRadius: 8 },
});
