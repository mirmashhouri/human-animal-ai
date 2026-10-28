import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';
import { inspectPhoto, renderArtwork, studioConfig } from './api';
import { extractPalette, isolateSubject } from './media';
import { exportArtwork } from './export';
import type { Artwork, Inspection, IsolatedSubject, StudioConfig, StudioOptions, StudioPhoto } from './types';

const ink = '#233d32', muted = '#737e74', line = '#dce0d4', green = '#315e44', paper = '#f5f3ed';
const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
const styles = ['Painterly', 'Editorial', 'Storybook'];
const moods = ['Dreamlike', 'Playful', 'Serene', 'Bold'];
const animals = ['Suggested', 'Fox', 'Owl', 'Wolf', 'Tiger', 'Deer'];
const demoAnalysis = {
  subjectVisible: true, title: 'A moment, reimagined.', pose: 'Example observation: a gently turned head and an open, upright composition.',
  composition: 'Example art direction: soft light, generous space and an understated background.',
  animalName: 'Red fox', animalReason: 'Example direction: a fox silhouette lends itself to a bright, expressive illustrated portrait.',
  story: 'A warm copper palette meets the quiet green of a woodland afternoon. This is an example story for the layout, not an analysis of the sample portrait.',
  palette: ['#a85f36', '#dbbc8d', '#506b48', '#e7e2d4', '#293b2e'],
};

function Action({ label, onPress, disabled = false, secondary = false, icon }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; icon?: keyof typeof Ionicons.glyphMap;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [s.action, secondary ? s.secondary : s.primary, disabled && s.disabled, pressed && { opacity: 0.8 }]}>
    {icon ? <Ionicons name={icon} size={18} color={secondary ? ink : '#fff'} /> : null}
    <Text style={[s.actionLabel, { color: secondary ? ink : '#fff' }]}>{label}</Text>
  </Pressable>;
}
function Options({ title, values, value, change, disabled }: { title: string; values: string[]; value: string; change: (value: string) => void; disabled: boolean }) {
  return <View style={s.optionGroup}><Text style={s.label}>{title}</Text><View style={s.chips}>
    {values.map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`${title}: ${item}`}
      accessibilityState={{ selected: item === value, disabled }} disabled={disabled} onPress={() => change(item)}
      style={[s.chip, item === value && s.chipSelected, disabled && { opacity: 0.65 }]}>
      <Text style={[s.chipText, item === value && { color: green }]}>{item}</Text>
    </Pressable>)}
  </View></View>;
}

export function WildLensStudio() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [photo, setPhoto] = useState<StudioPhoto | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [isolated, setIsolated] = useState<IsolatedSubject | null>(null);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [options, setOptions] = useState<StudioOptions>({ style: 'Painterly', mood: 'Dreamlike', subject: 'person', segment: Platform.OS === 'web' });
  const [animal, setAnimal] = useState('Suggested');
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'picking' | 'analyzing' | 'generating' | 'exporting'>('idle');
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
  const direction = inspection?.analysis;

  useEffect(() => {
    const controller = new AbortController();
    setConfig(null);
    const timeout = setTimeout(() => controller.abort(), 6000);
    void studioConfig(controller.signal).then(setConfig).catch(() => { if (!controller.signal.aborted) setConfig(null); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [connectionAttempt]);
  useEffect(() => () => operation.current?.abort(), []);

  function reset() {
    operation.current?.abort();
    setPhoto(null); setInspection(null); setIsolated(null); setArtwork(null); setConsent(false); setDemo(false); setError(''); setNotice('');
    setArtReady(false); scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  function updateOption(key: keyof StudioOptions, value: string | boolean) {
    setOptions(previous => ({ ...previous, [key]: value }));
    if (key !== 'style') { setInspection(null); setIsolated(null); setArtwork(null); setDemo(false); }
    else setArtwork(null);
  }
  async function choosePhoto(camera = false) {
    if (busyRef.current) return;
    busyRef.current = true; setPhase('picking'); setError(''); setNotice('');
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Allow camera access or choose a photo from your library.');
      }
      const pickOptions: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9, exif: false };
      const picked = camera ? await ImagePicker.launchCameraAsync(pickOptions) : await ImagePicker.launchImageLibraryAsync(pickOptions);
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) return;
      if ((asset.fileSize ?? 0) > 15 * 1024 * 1024 || asset.width < 64 || asset.height < 64) throw new Error('Choose a clear photo under 15 MB and at least 64 pixels wide and tall.');
      const size = asset.width >= asset.height ? { width: Math.min(1024, asset.width) } : { height: Math.min(1024, asset.height) };
      const normalized = await manipulateAsync(asset.uri, [{ resize: size }], { format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!normalized.base64 || normalized.base64.length > 2_796_204) throw new Error('This photo is too large after resizing. Try a smaller image.');
      const palette = await extractPalette(normalized.uri);
      setPhoto({ uri: normalized.uri, base64: normalized.base64, palette });
      setInspection(null); setArtwork(null); setIsolated(null); setConsent(false); setDemo(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'This photo could not be opened.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }
  async function exploreDemo() {
    if (busyRef.current) return;
    const portrait = Asset.fromModule(require('../../assets/photos/sample-portrait.jpg'));
    const fox = Asset.fromModule(require('../../assets/photos/red-fox.jpg'));
    setPhoto({ uri: portrait.uri, base64: '', palette: demoAnalysis.palette });
    setInspection({ ticket: 'local-demo', analysis: demoAnalysis, segmentationText: '', segmentationStatus: 'skipped', paletteSource: 'example-palette', promptVersion: 'layout-demo' });
    setArtwork({ image: fox.uri, model: 'Reference photograph', promptVersion: 'layout-demo', notice: 'Reference photograph, not generated artwork.' });
    setDemo(true); setConsent(false); setIsolated(null); setError(''); setNotice('Local layout demo. No photo has been uploaded and no Meta calls have been made.');
  }
  async function run(action: 'analyzing' | 'generating') {
    if (busyRef.current || !photo || !consent || demo) return;
    busyRef.current = true;
    const controller = new AbortController(); operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 195000);
    setPhase(action); setError(''); setNotice('');
    try {
      if (action === 'analyzing') {
        setArtwork(null); setInspection(null); setIsolated(null);
        const result = await inspectPhoto(photo, options, controller.signal);
        const cutout = options.segment ? await isolateSubject(photo.uri, result.segmentationText) : null;
        if (controller.signal.aborted) return;
        setInspection(result); setIsolated(cutout);
        if (cutout && cutout.count > 1) setNotice(`SAM found ${cutout.count} subjects. The largest is used for the cutout; upload a single-subject photo for more control.`);
      } else if (inspection) {
        setArtwork(null);
        setArtReady(false);
        const result = await renderArtwork(photo, inspection, options, animal, isolated?.base64, controller.signal);
        if (!controller.signal.aborted) setArtwork(result);
      }
    } catch (e) {
      setError(controller.signal.aborted ? 'Request stopped. Meta may still complete or bill work already started; it was not retried.' : e instanceof Error ? e.message : 'The studio could not finish this request.');
    } finally { clearTimeout(timeout); busyRef.current = false; operation.current = null; setPhase('idle'); }
  }
  async function download() {
    if (!artwork || !direction || !artReady || demo || busyRef.current) return;
    busyRef.current = true; setPhase('exporting'); setError('');
    try { await exportArtwork(resultRef, artwork.image, direction); setNotice('Your artwork and visual story are ready to keep.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Export could not finish.'); }
    finally { busyRef.current = false; setPhase('idle'); }
  }

  return <ScrollView ref={scrollRef} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.container}>
      <View style={s.nav}>
        <View style={s.brand}><View style={s.brandMark}><Ionicons name="aperture-outline" size={25} color="#fff" /></View><Text style={s.brandName}>WildLens<Text style={{ color: '#bd7048' }}>.</Text></Text></View>
        <View style={s.navRight}><Pressable accessibilityRole="button" onPress={() => setShowProcess(v => !v)}><Text style={s.navLink}>How it works</Text></Pressable>
          {wide ? <View style={s.metaBadge}><Text style={s.metaText}>Built with Meta AI</Text></View> : null}</View>
      </View>
      <View style={[s.hero, wide && { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
        <View><Text style={s.eyebrow}>A NEW PERSPECTIVE ON YOU</Text><Text accessibilityRole="header" style={[s.headline, !wide && { fontSize: 43 }]}>See yourself{wide ? '\n' : ' '}through the wild.</Text></View>
        <View style={{ maxWidth: 365, gap: 16 }}><Text style={s.intro}>Your photo. Nature’s imagination. Explore the shapes and colors that make a portrait yours, then turn them into something wonderfully wild.</Text>
          <View style={s.tinyRow}><View style={s.dot} /><Text style={s.tiny}>A creative lens. An entirely new portrait.</Text></View></View>
      </View>
      {showProcess ? <View style={s.process}><Text accessibilityRole="header" style={s.smallTitle}>One photo. Three perspectives.</Text>
        <Text style={s.body}>SAM 3.1 separates the subject. Muse Spark interprets visible composition and builds a visual story. Muse Image creates an animal-inspired portrait using your original photo and chosen direction.</Text>
        <Text style={s.caption}>Colors inspire the artwork’s atmosphere. They do not reveal someone’s emotions or personality. Muse Code is a development tool, not part of the photo pipeline.</Text></View> : null}
      <View style={s.steps}>{['01  Bring a photo', '02  Find your direction', '03  Make it wild'].map((step, i) => <View key={step} style={[s.step, (i === 0 || (i === 1 && photo) || (i === 2 && inspection)) ? s.activeStep : null]}><Text style={s.stepText}>{step}</Text></View>)}</View>
      <View style={[s.workspace, wide && { flexDirection: 'row', alignItems: 'stretch' }]}>
        <View style={[s.panel, wide && { flex: 1.1 }]}>
          <View style={s.panelHeading}><Text style={s.smallTitle}>The starting point</Text><Text style={s.caption}>{photo ? (demo ? 'Sample portrait' : 'Your original') : 'One clear photo'}</Text></View>
          <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={photo ? 'Change your photo' : 'Upload a photo'} onPress={() => void choosePhoto()} style={[s.photoWell, photo && { borderStyle: 'solid' }]}>
            {photo ? <Image source={{ uri: photo.uri }} accessibilityLabel={demo ? 'Sample portrait for layout demonstration' : 'Your uploaded photo'} style={s.photo} resizeMode="contain" /> : <View style={s.empty}>
              <View style={s.uploadIcon}><Ionicons name="scan-outline" size={34} color={green} /></View><Text style={s.uploadTitle}>A new side of you starts here.</Text><Text style={[s.body, { textAlign: 'center', maxWidth: 255 }]}>Bring a portrait with good light and one visible subject.</Text><View style={s.uploadPill}><Ionicons name="add" size={17} color={green} /><Text style={s.uploadPillText}>Choose a photo</Text></View><Text style={s.caption}>JPG or PNG · up to 15 MB</Text>
            </View>}
          </Pressable>
          <View style={s.photoActions}><Action secondary icon="image-outline" label={photo ? 'Change photo' : 'Upload photo'} disabled={busy} onPress={() => void choosePhoto()} /><Action secondary icon="camera-outline" label="Use camera" disabled={busy} onPress={() => void choosePhoto(true)} /></View>
          <Text style={s.caption}>Your photo stays on this device until you choose Analyze. Clear your session at any time.</Text>
          {isolated ? <View style={s.cutout}><Image source={{ uri: isolated.uri }} style={{ height: 110, width: 95 }} resizeMode="contain" accessibilityLabel="Subject isolated by SAM" /><View style={{ flex: 1, gap: 6 }}><Text style={s.label}>Subject, found.</Text><Text style={s.caption}>This SAM cutout will guide your portrait alongside the original image.</Text></View></View> : null}
        </View>
        <View style={[s.panel, s.directionPanel, wide && { flex: 1 }]}>
          <View style={s.panelHeading}><Text style={s.smallTitle}>Your creative direction</Text><Ionicons name="sparkles-outline" size={21} color="#a86b47" /></View>
          <Options title="Art style" values={styles} value={options.style} change={v => updateOption('style', v)} disabled={busy || demo} />
          <Options title="Choose an atmosphere" values={moods} value={options.mood} change={v => updateOption('mood', v)} disabled={busy || demo} />
          <Text style={s.caption}>An artistic mood you choose, inspired by the colors in your image.</Text>
          <Options title="Animal inspiration" values={animals} value={animal} change={v => { setAnimal(v); setArtwork(null); }} disabled={busy || demo} />
          <View style={s.isolation}><View style={{ flex: 1, gap: 4 }}><Text style={s.label}>Isolate the subject</Text><Text style={s.caption}>{Platform.OS === 'web' ? 'A cleaner reference for the transformation.' : 'Available in the browser studio.'}</Text></View><Switch accessibilityLabel="Isolate the subject" value={options.segment} onValueChange={v => updateOption('segment', v)} disabled={busy || demo || Platform.OS !== 'web'} trackColor={{ false: '#d9dfd3', true: '#88a58a' }} thumbColor="#fff" /></View>
          {options.segment ? <Options title="Photo subject" values={['person', 'animal']} value={options.subject} change={v => updateOption('subject', v)} disabled={busy || demo} /> : null}
          {photo && !demo ? <Pressable accessibilityRole="checkbox" accessibilityLabel="I have permission to use this photo and send it to Meta" accessibilityState={{ checked: consent, disabled: busy }} disabled={busy} onPress={() => setConsent(v => !v)} style={s.consent}>
            <View style={[s.check, consent && { backgroundColor: green, borderColor: green }]}>{consent ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}</View><Text style={[s.caption, { flex: 1 }]}>I have permission to use this photo and send it to Meta for analysis and image creation.</Text></Pressable> : null}
          {busy ? <View accessibilityLiveRegion="polite" style={s.progress}><ActivityIndicator color={green} /><Text style={[s.body, { flex: 1 }]}>{phase === 'analyzing' ? 'Reading the image and finding your subject…' : phase === 'generating' ? 'Painting your wild perspective…' : phase === 'exporting' ? 'Preparing your artwork…' : 'Opening your photo…'}</Text>
            {phase === 'analyzing' || phase === 'generating' ? <Pressable accessibilityRole="button" onPress={() => operation.current?.abort()}><Text style={s.navLink}>Stop</Text></Pressable> : null}</View> : null}
          <Action icon={inspection ? 'sparkles-outline' : 'scan-outline'} label={inspection ? (artwork ? 'Create another portrait' : 'Create my wild portrait') : 'Analyze my photo'}
            disabled={busy || !photo || !consent || !config?.liveReady || demo} onPress={() => void run(inspection ? 'generating' : 'analyzing')} />
          {!config?.liveReady ? <Text style={s.caption}>Live studio setup is pending. Explore the local demo below while Meta access is connected.</Text> : <Text style={s.caption}>{inspection ? 'Each creation makes one image request.' : `Analysis uses Muse Spark${options.segment ? ' and SAM' : ''}. Review the direction before generating.`}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Explore the local demo" disabled={busy} onPress={() => void exploreDemo()} style={{ paddingVertical: 8 }}><Text style={[s.navLink, { textAlign: 'center' }]}>Explore the local demo ↗</Text></Pressable>
        </View>
      </View>
      {error ? <View accessibilityRole="alert" style={s.error}><Ionicons name="alert-circle-outline" size={21} color="#8f3e2d" /><Text style={{ color: '#8f3e2d', flex: 1, lineHeight: 21 }}>{error}</Text></View> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={[s.caption, { marginTop: 16 }]}>{notice}</Text> : null}
      {direction && photo ? <View style={s.results}>
        <View style={s.resultsHeading}><View><Text style={s.eyebrow}>{demo ? 'LOCAL LAYOUT DEMO · NO AI CALLS' : 'YOUR WILD PERSPECTIVE'}</Text><Text accessibilityRole="header" style={s.resultTitle}>{direction.title}</Text></View>
          <Action secondary label="Clear session" disabled={busy} onPress={reset} /></View>
        <View style={[s.resultGrid, wide && { flexDirection: 'row' }]}>
          <View ref={resultRef} collapsable={false} style={[s.artCard, wide && { flex: 1.1 }]}>
            {artwork ? <Image key={artwork.image} source={{ uri: artwork.image }} style={s.art} resizeMode="contain" onLoad={() => setArtReady(true)} onError={() => { setArtwork(null); setArtReady(false); setError('The image could not be displayed. No automatic generation retry was made.'); }} accessibilityLabel={demo ? 'Red fox reference photo, not AI-generated' : 'Your Meta-generated animal-inspired portrait'} /> : <View style={[s.empty, { minHeight: 420 }]}><Ionicons name="color-palette-outline" size={44} color={green} /><Text style={s.uploadTitle}>A direction worth exploring.</Text><Text style={[s.body, { textAlign: 'center', maxWidth: 280 }]}>Review the visual story, choose your animal inspiration, then create your portrait.</Text></View>}
            <View style={s.artCaption}><Text style={s.label}>{demo ? 'Reference photo · layout demo' : artwork ? `${animal === 'Suggested' ? direction.animalName : animal} · ${options.style}` : 'Your canvas is ready'}</Text><Text style={s.caption}>{demo ? 'Not AI-generated. Photo credits below.' : artwork ? 'Created with Meta Muse Image' : 'Muse Image will use your original photo.'}</Text></View>
          </View>
          <View style={[s.storyCard, wide && { flex: 1 }]}>
            <Text style={s.eyebrow}>THE VISUAL STORY</Text><Text style={s.storyTitle}>{direction.animalName}</Text><Text style={s.body}>{direction.animalReason}</Text>
            <View style={s.divider} /><Text style={s.label}>The colors you brought</Text><View style={s.palette}>{direction.palette.map((hex, i) => <View key={`${hex}-${i}`} style={{ flex: 1, gap: 7 }}><View accessibilityLabel={`Palette color ${hex}`} style={[s.swatch, { backgroundColor: hex }]} /><Text style={s.hex}>{hex.toUpperCase()}</Text></View>)}</View>
            <Text style={s.caption}>{demo ? 'Illustrative palette' : inspection?.paletteSource === 'measured-in-browser' ? 'Sampled from your whole image on this device.' : 'Estimated from the image by Muse Spark.'} · Colors guide the artwork, not an emotion assessment.</Text>
            <Text style={[s.body, { fontFamily: serif, fontSize: 20, lineHeight: 31, marginVertical: 16 }]}>{direction.story}</Text>
            <View style={s.divider} /><Text style={s.label}>What we can see</Text><Text style={s.body}>{direction.pose}</Text><Text style={s.body}>{direction.composition}</Text>
            {artwork && !demo ? <Action icon="download-outline" label="Keep my artwork" disabled={busy || !artReady} onPress={() => void download()} /> : null}
            {!artwork && !demo ? <Action icon="sparkles-outline" label="Create from this direction" disabled={busy || !consent || !config?.liveReady} onPress={() => void run('generating')} /> : null}
            {demo ? <Text style={s.caption}>Example photos: Gromovataya (portrait, CC0) and Tomek Niedzwiedz (red fox, CC0). Sources and rights are bundled in assets/photos/credits.json. This demo is a layout reference.</Text> : null}
          </View>
        </View>
      </View> : null}
      <View style={s.footer}><Text style={s.footerBrand}>WildLens. A different kind of self-portrait.</Text><View style={s.tinyRow}><View style={[s.dot, { backgroundColor: config?.liveReady ? '#5c8958' : '#b19363' }]} /><Pressable accessibilityRole="button" onPress={() => setShowConnection(v => !v)}><Text style={s.navLink}>{config?.liveReady ? 'Meta studio connected' : 'Studio connection'}</Text></Pressable></View></View>
      {showConnection ? <View style={s.process}><Text style={s.label}>{config ? 'Backend connected' : 'Backend not reachable'}</Text><Text style={s.caption}>Meta key: {config?.keyConfigured ? 'configured' : 'needed'} · Credit confirmed: {config?.creditConfirmed ? 'yes' : 'pending'} · Live requests: {config?.paidRequestsEnabled ? 'enabled' : 'off'}</Text><Text style={s.caption}>Use scripts/setup-meta.ps1 in the project to configure the server. Your key stays out of the app.</Text><Pressable accessibilityRole="button" onPress={() => setConnectionAttempt(v => v + 1)}><Text style={s.navLink}>Refresh connection</Text></Pressable></View> : null}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { backgroundColor: paper, minHeight: '100%', paddingHorizontal: 22, paddingBottom: 35 }, container: { width: '100%', maxWidth: 1170, alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 25, borderBottomWidth: 1, borderColor: line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { backgroundColor: green, height: 39, width: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontFamily: serif, fontSize: 31, letterSpacing: -1.1, color: ink }, navRight: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  navLink: { color: green, fontSize: 12, fontWeight: '600', paddingVertical: 4 }, metaBadge: { paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: line, borderRadius: 20 }, metaText: { color: green, fontSize: 11, fontWeight: '600' },
  hero: { paddingTop: 44, paddingBottom: 35, gap: 24 }, eyebrow: { fontSize: 10, color: green, fontWeight: '700', letterSpacing: 2, marginBottom: 13 },
  headline: { fontFamily: serif, fontSize: 62, color: ink, letterSpacing: -2.7, lineHeight: 69 }, intro: { color: muted, fontSize: 15, lineHeight: 25 },
  tinyRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, tiny: { color: green, fontSize: 11 }, dot: { height: 6, width: 6, backgroundColor: '#bd7048', borderRadius: 5 },
  process: { backgroundColor: '#e9eddf', padding: 23, borderRadius: 15, gap: 12, marginBottom: 20 },
  steps: { flexDirection: 'row', marginBottom: 18, gap: 8 }, step: { flex: 1, paddingVertical: 13, borderTopWidth: 2, borderColor: line }, activeStep: { borderColor: '#749270' }, stepText: { color: green, fontSize: 11, fontWeight: '600' },
  workspace: { gap: 19 }, panel: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e0e2d8', borderRadius: 19, padding: 23, gap: 17 }, directionPanel: { backgroundColor: '#fdfcf7' },
  panelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, smallTitle: { fontFamily: serif, fontSize: 23, color: ink, letterSpacing: -0.5 },
  label: { fontSize: 12, fontWeight: '600', color: ink }, caption: { color: muted, fontSize: 11, lineHeight: 18 }, body: { color: '#627165', fontSize: 13, lineHeight: 23 },
  photoWell: { borderWidth: 1, borderColor: '#cbd3c3', borderStyle: 'dashed', borderRadius: 12, backgroundColor: '#f0f2e9', overflow: 'hidden', minHeight: 355 }, photo: { width: '100%', height: 380 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 17, minHeight: 355 }, uploadIcon: { backgroundColor: '#e3e9d9', height: 70, width: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  uploadTitle: { fontFamily: serif, fontSize: 23, color: ink, textAlign: 'center' }, uploadPill: { flexDirection: 'row', gap: 6, backgroundColor: '#e0e8d7', borderRadius: 22, paddingHorizontal: 19, paddingVertical: 11 }, uploadPillText: { color: green, fontWeight: '600', fontSize: 12 },
  photoActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, action: { paddingHorizontal: 17, paddingVertical: 14, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primary: { backgroundColor: green }, secondary: { borderWidth: 1, borderColor: line, backgroundColor: '#fafaf4' }, actionLabel: { fontSize: 12, fontWeight: '600' }, disabled: { opacity: 0.42 },
  optionGroup: { gap: 10 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderWidth: 1, borderColor: line, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 8, backgroundColor: '#fffefa' }, chipSelected: { borderColor: '#86a080', backgroundColor: '#eaf0e2' }, chipText: { fontSize: 11, color: muted },
  isolation: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eceee5' }, consent: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, check: { height: 19, width: 19, borderRadius: 4, borderWidth: 1, borderColor: '#aab5a1', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  progress: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 }, error: { flexDirection: 'row', gap: 10, backgroundColor: '#f5e7df', borderRadius: 10, padding: 16, marginTop: 20 },
  cutout: { flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: '#e9eee1', padding: 12, borderRadius: 12 },
  results: { marginTop: 45, gap: 23 }, resultsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 15, flexWrap: 'wrap' }, resultTitle: { fontFamily: serif, fontSize: 35, color: ink, letterSpacing: -1 }, resultGrid: { gap: 20 },
  artCard: { backgroundColor: '#e9ece0', borderRadius: 17, overflow: 'hidden' }, art: { width: '100%', height: 530 }, artCaption: { padding: 20, backgroundColor: '#e3e8da', gap: 5 },
  storyCard: { padding: 25, backgroundColor: '#fffefa', borderWidth: 1, borderColor: line, borderRadius: 17, gap: 12 }, storyTitle: { fontFamily: serif, fontSize: 30, color: ink }, divider: { height: 1, backgroundColor: line, marginVertical: 8 },
  palette: { flexDirection: 'row', gap: 6, marginVertical: 6 }, swatch: { height: 48, borderRadius: 7 }, hex: { fontSize: 8, color: muted },
  footer: { marginTop: 45, borderTopWidth: 1, borderColor: line, paddingVertical: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }, footerBrand: { fontSize: 11, color: muted },
});
