import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { API_URL, animalPhoto, animalPhotoUri, animals, demoResult, samplePortrait } from './src/data';
import { comparePortrait, getConfig } from './src/api';
import { colors, serif } from './src/theme';
import { shareComparison } from './src/share';
import type { MatchResult, Portrait, ServerConfig } from './src/types';
import { Button, Eyebrow, Icon, Pill, TextLink } from './src/components/Primitives';
import { ComparisonCard } from './src/components/ComparisonCard';
import { Welcome } from './src/components/Welcome';
import { InfoModal, type InfoTopic } from './src/components/InfoModal';
import { SpeciesExplorer } from './src/components/SpeciesExplorer';
import { AnimalSearchPanel } from './src/components/AnimalSearchPanel';
import { FaceProfilePanel } from './src/components/FaceProfilePanel';

type Screen = 'welcome' | 'preview' | 'matching' | 'result' | 'catalogue';

function KinformApp() {
  const { width } = useWindowDimensions();
  const wide = width >= 880;
  const [screen, setScreen] = useState<Screen>('welcome');
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [configError, setConfigError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [topic, setTopic] = useState<InfoTopic>(null);
  const [showDesignNotes, setShowDesignNotes] = useState(false);
  const cardRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const operationRef = useRef<AbortController | null>(null);
  const pickingRef = useRef(false);
  const exportingRef = useRef(false);
  const currentMatch = result?.matches[selected];
  const isLocal = !API_URL || portrait?.isSample;
  const isDemo = isLocal || config?.mode === 'demo';
  const characterMode = !isDemo && config?.experience === 'animal-character';
  const isCharacter = result?.experience === 'animal-character';

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setConfigError('');
    void getConfig(controller.signal).then(next => { setConfig(next); setConsent(false); }).catch(() => {
      setConfigError('The API server is not reachable. No photo has been uploaded.');
    }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [configAttempt]);

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [screen]);

  function clearSession() {
    operationRef.current?.abort();
    operationRef.current = null;
    setPortrait(null); setResult(null); setSelected(0); setConsent(false);
    setError(''); setMessage(''); setCardReady(false); setShowDesignNotes(false); setScreen('welcome');
  }

  async function acceptAsset(asset: ImagePicker.ImagePickerAsset) {
    if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) throw new Error('Choose a photograph smaller than 15 MB.');
    if (asset.width < 64 || asset.height < 64) throw new Error('Choose a larger portrait with a clearly visible face.');
    const size = asset.width >= asset.height ? { width: Math.min(1024, asset.width) } : { height: Math.min(1024, asset.height) };
    const normalized = await manipulateAsync(asset.uri, [{ resize: size }], { format: SaveFormat.JPEG, compress: 0.85, base64: true });
    operationRef.current?.abort();
    setPortrait({ uri: normalized.uri, base64: normalized.base64, isSample: false });
    setResult(null); setConsent(false); setSelected(0); setCardReady(false); setScreen('preview');
  }

  async function pickPhoto(camera: boolean) {
    if (pickingRef.current) return;
    pickingRef.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Camera access is off. Allow it in device settings, or upload a photo instead.');
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], allowsMultipleSelection: false,
        allowsEditing: Platform.OS !== 'web', aspect: [3, 4], quality: 0.9,
        exif: false,
      };
      const picked = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!picked.canceled && picked.assets[0]) await acceptAsset(picked.assets[0]);
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'That photo could not be opened. Please try another.'); }
    finally { pickingRef.current = false; setBusy(false); }
  }

  async function exploreSample() {
    if (pickingRef.current) return;
    pickingRef.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const asset = Asset.fromModule(samplePortrait);
      await asset.downloadAsync();
      operationRef.current?.abort();
      setPortrait({ uri: asset.localUri ?? asset.uri, isSample: true });
      setResult(demoResult()); setSelected(0); setConsent(false); setCardReady(false); setScreen('result');
    } catch { setError('The sample portrait could not load. Try uploading your own photograph.'); }
    finally { pickingRef.current = false; setBusy(false); }
  }

  async function compare() {
    if (!portrait || !consent || operationRef.current) return;
    const controller = new AbortController(); operationRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 360000);
    setError(''); setMessage(''); setScreen('matching');
    try {
      const next = await comparePortrait(portrait, consent, controller.signal, characterMode && consent);
      if (controller.signal.aborted) return;
      setResult(next); setSelected(0); setCardReady(false); setShowDesignNotes(false); setScreen('result');
    } catch (exception) {
      if (operationRef.current !== controller) return;
      setError(controller.signal.aborted ? 'The request timed out. Requests may have been billed. No analysis is cached and no automatic retry was made.' :
        exception instanceof Error ? exception.message : 'The request failed. Please try again.');
      setScreen('preview');
    } finally { clearTimeout(timeout); if (operationRef.current === controller) operationRef.current = null; }
  }

  function cancelMatch() {
    operationRef.current?.abort(); operationRef.current = null;
    setScreen('preview'); setMessage('Request cancelled. A provider may already have processed an in-flight upload.');
  }

  async function exportCard() {
    if (!portrait || !currentMatch || !result || !cardReady || exportingRef.current) return;
    exportingRef.current = true; setExporting(true); setError(''); setMessage('');
    try {
      const outcome: string = await shareComparison(cardRef, portrait, currentMatch.animal, result.isDemo);
      setMessage(outcome === 'downloaded' ? 'Your card was downloaded. It’s ready for your story.' :
        outcome === 'cancelled' ? '' : 'Share sheet opened. Choose where to send your card.');
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Export failed. Please try again.'); }
    finally { exportingRef.current = false; setExporting(false); }
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={[styles.container, !wide && { paddingHorizontal: 22 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kinform home" onPress={() => setScreen(result ? 'result' : 'welcome')} style={styles.wordmark}>
            <Icon name="aperture" size={27} color={colors.olive} /><Text style={styles.brand}>kinform</Text>
          </Pressable>
          <View style={styles.navigation}>
            {wide ? <Pressable accessibilityRole="button" onPress={() => setScreen(result ? 'result' : 'welcome')} style={styles.navButton}><Text style={[styles.navText, screen !== 'catalogue' && { color: colors.ink }]}>Discover</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => setScreen('catalogue')} style={styles.navButton}><Text style={[styles.navText, screen === 'catalogue' && { color: colors.ink }]}>The animals</Text></Pressable>
            {wide ? <Pressable accessibilityRole="button" onPress={() => setTopic('how')} style={styles.navButton}><Text style={styles.navText}>How it works</Text></Pressable> : null}
          </View>
          {wide ? <Pill icon="compass">EARLY PREVIEW</Pill> : null}
        </View>

        {configError ? <View style={styles.alert}><Text style={styles.error}>{configError}</Text><TextLink onPress={() => setConfigAttempt(x => x + 1)}>Reconnect to API</TextLink></View> : null}
        {config?.mode === 'experimental-live' && config.liveReady === false ? <View style={styles.notice}>
          <Icon name="key" color={colors.olive} size={18} /><Text style={styles.noticeText}>OpenAI setup needed · {config.model}. Set OPENAI_API_KEY and AI_ENABLE_PAID_REQUESTS=true in server/Kinform.Api/.env, then restart the API and refresh this page. Sample comparisons and GBIF search are available now.</Text>
          <TextLink onPress={() => setConfigAttempt(x => x + 1)}>Refresh API status</TextLink>
        </View> : null}
        {error ? <View accessibilityRole="alert" style={styles.alert}><Icon name="alert-circle" color={colors.error} size={18} /><Text style={[styles.error, { flex: 1 }]}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={() => setError('')} style={{ padding: 8 }}><Icon name="x" size={16} /></Pressable></View> : null}
        {message ? <View accessibilityLiveRegion="polite" style={styles.notice}><Icon name="check-circle" size={17} color={colors.olive} /><Text style={styles.noticeText}>{message}</Text></View> : null}
        {busy ? <View style={styles.notice}><ActivityIndicator color={colors.olive} /><Text style={styles.noticeText}>Preparing your photo…</Text></View> : null}

        {screen === 'welcome' ? <Welcome wide={wide} onUpload={() => void pickPhoto(false)} onCamera={() => void pickPhoto(true)} onSample={() => void exploreSample()} onHow={() => setTopic('how')} /> : null}

        {screen === 'preview' && portrait ? <View style={[styles.flow, wide && styles.flowWide]}>
          <View style={[styles.previewPhoto, wide && { flex: 1 }]}><Image source={{ uri: portrait.uri }} style={styles.fullImage} resizeMode="cover" accessibilityLabel="Preview of your selected portrait" /><View style={styles.cornerLabel}><Text style={styles.cornerText}>YOUR PORTRAIT</Text></View></View>
          <View style={[styles.flowCopy, wide && { flex: 1 }]}>
            <Eyebrow>01 / YOUR STARTING POINT</Eyebrow><Text accessibilityRole="header" style={styles.sectionTitle}>Good light.{`\n`}Just you.</Text>
            <Text style={styles.body}>A clear, front-facing portrait works best. Keep your face visible and use a photograph you have permission to share.</Text>
            <View style={styles.permissionBox}><Icon name="shield" color={colors.olive} size={22} /><View style={{ flex: 1 }}>
              <Text style={styles.smallTitle}>{isLocal ? 'This preview stays on your device' : config?.mode === 'demo' ? 'Your development API • demo mode' : 'Your API + OpenAI • experimental'}</Text>
              <Text style={styles.smallBody}>{isLocal ? 'You’ll see three fixed demo examples, not AI analysis. No image upload happens.' : config?.mode === 'demo' ? 'Your resized photo goes to the configured .NET server. It returns fixed examples, not AI analysis, and does not save the upload.' : config?.animalImageSource === 'Generated' ? 'Your resized portrait goes through your .NET server to OpenAI to study visible facial shapes and choose one animal. The same portrait is then sent to OpenAI’s image editor to create your cartoon animal character. No animal-photo website is searched. Provider retention rules apply.' : 'Your resized photo goes to your .NET server and OpenAI for visible-feature descriptions and species suggestions. Only species names go to iNaturalist; reference photos load from its public image host. Provider retention rules apply.'}</Text>
            </View></View>
            {!isDemo && config?.photoReviewEnabled ? <Text style={styles.smallBody}>Animal-photo review is enabled. Up to three additional billed AI requests inspect public animal photos only. Cached selections are reused; your portrait is not included in photo review.</Text> : null}
            {!isDemo && config?.animalImageSource === 'Generated' ? <Text style={styles.smallBody}>Each creation makes two billed analysis requests plus one billed image-edit request ({config.imageModel}, {config.imageQuality} quality), including input-image processing. The cartoon is created automatically and may contain mistakes. Repeating runs and can bill all requests again.</Text> : null}
            {!isDemo && config?.analysisCacheEnabled === false ? <Text style={styles.smallBody}>Analysis caching is off. Every submission is analysed again, including the same photo. Previous profiles and animal choices are not reused, so suggestions may change.</Text> : null}
            {!isDemo && config?.artisticSignatureEnabled ? <Text style={styles.smallBody}>{characterMode ? 'An artist’s interpretation: one clearly recognizable animal, with your eye shapes, expression and distinctive facial proportions translated into a cartoon. Your original photo stays unchanged; a new artwork is created.' : 'The AI identifies distinctive visible shapes and suggests species that echo them. This is an artistic interpretation, not a scientific result.'}</Text> : null}
            <Pressable accessibilityRole="checkbox" aria-checked={consent} accessibilityState={{ checked: consent }} accessibilityLabel="I have permission and agree to the described photo processing" onPress={() => setConsent(value => !value)} style={styles.checkboxRow}>
              <View style={[styles.checkbox, consent && styles.checked]}>{consent ? <Icon name="check" size={15} color={colors.white} /> : null}</View>
              <Text style={styles.checkboxText}>I have permission to use this photo and agree to the processing described above.</Text>
            </Pressable>
            <Button onPress={() => void compare()} disabled={!consent || (!isLocal && (!config || !!configError || (config.mode === 'experimental-live' && config.liveReady === false)))} icon="arrow-right">{isDemo ? 'Show demo comparison' : characterMode ? 'Create my animal character' : 'Find my animal match'}</Button>
            <View style={styles.inlineLinks}><TextLink onPress={() => void pickPhoto(false)}>Choose another photo</TextLink><TextLink onPress={() => setTopic('privacy')}>Photo privacy</TextLink></View>
          </View>
        </View> : null}

        {screen === 'matching' ? <View style={styles.processing}>
          <View style={styles.processingIcon}><ActivityIndicator size="large" color={colors.olive} /></View>
          <Eyebrow>{isDemo ? 'OPENING DEMO COMPARISON' : characterMode ? 'CREATING YOUR ANIMAL CHARACTER' : 'COMPARING YOUR PORTRAIT'}</Eyebrow>
          <Text style={styles.sectionTitle}>{isDemo ? 'A glimpse of the experience.' : characterMode ? 'Your face. Reimagined.' : 'Finding a familiar face.'}</Text>
          <Text style={[styles.body, { textAlign: 'center' }]}>{isDemo ? 'Demo examples are fixed and do not analyse your face.' : characterMode ? 'Studying your distinctive facial shapes, choosing one animal, then drawing a cartoon character from your actual portrait. This can take several minutes. No billed request is automatically retried.' : 'AI is describing visible facial shapes and suggesting three species. Next we look up credited animal photographs.'}</Text>
          <TextLink onPress={cancelMatch}>Cancel request</TextLink>
        </View> : null}

        {screen === 'result' && portrait && result && currentMatch ? <View style={styles.resultArea}>
          <View style={styles.resultHeading}><View style={{ maxWidth: '100%' }}><Eyebrow>{result.isDemo ? 'THE EXPERIENCE / DEMO' : isCharacter ? 'A PORTRAIT WITH A WILD SIDE' : 'YOUR VISUAL CONNECTION'}</Eyebrow>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { marginBottom: 0 }, !wide && { fontSize: 34, lineHeight: 42 }]}>{isCharacter ? 'Your animal character.' : 'A face from the wild.'}</Text></View><TextLink onPress={clearSession}>Start again ↗</TextLink></View>
          <View style={[styles.resultColumns, wide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
            <View style={[styles.cardColumn, wide && { flex: 1.15 }]}>
              <ComparisonCard key={`${result.id}-${currentMatch.animal.id}`} ref={cardRef} portrait={portrait} animal={currentMatch.animal} isDemo={result.isDemo} onReady={setCardReady} />
              <Text style={styles.cardFootnote}>{result.notice}</Text>
            </View>
            <View style={[styles.detailColumn, wide && { flex: 1 }]}>
              <View style={styles.detailHeader}><Text style={styles.smallTitle}>{result.isDemo ? 'Three pictured examples' : isCharacter ? 'One animal. Inspired by you.' : 'Your three AI suggestions'}</Text><Pill>{isCharacter ? 'AI ARTWORK' : `${result.matches.length} ANIMALS`}</Pill></View>
              {isCharacter ? <View style={styles.animalNotes}><Text style={styles.catalogueName}>{currentMatch.animal.name}</Text><Text style={styles.matchScientific}>{currentMatch.animal.scientificName}</Text><Text style={styles.body}>Your portrait is the visual reference. The animal’s anatomy stays recognizable while your distinctive shapes and expression guide the drawing.</Text></View> : <><Text style={styles.smallBody}>Choose an animal to see it beside your portrait.</Text>
              <View style={styles.matchList}>{result.matches.map((match, index) => <Pressable key={match.animal.id}
                accessibilityRole="button" accessibilityLabel={`Compare with ${match.animal.name}`} accessibilityState={{ selected: selected === index }}
                onPress={() => { if (selected !== index) { setCardReady(false); setSelected(index); setMessage(''); } }}
                style={({ pressed }) => [styles.matchRow, selected === index && styles.matchRowSelected, pressed && { opacity: 0.8 }]}>
                {animalPhotoUri(match.animal) ? <Image source={animalPhoto(match.animal)} style={styles.matchThumbnail} accessibilityLabel={match.animal.name} /> : <View style={[styles.matchThumbnail, { backgroundColor: colors.soft }]} />}
                <View style={{ flex: 1, gap: 5 }}><Text style={styles.matchName}>{match.animal.name}</Text><Text style={styles.matchScientific}>{match.animal.scientificName}</Text></View>
                <View style={styles.rank}><Text style={styles.rankText}>{String(match.rank).padStart(2, '0')}</Text>{selected === index ? <Icon name="check" color={colors.olive} size={15} /> : null}</View>
              </Pressable>)}</View></>}
              {!result.isDemo && currentMatch.animal.matchReason ? <View style={styles.animalNotes}><Eyebrow>{isCharacter ? 'THE DESIGN CONNECTION · AI INTERPRETATION' : 'WHY THIS SPECIES · AI INTERPRETATION'}</Eyebrow><Text style={styles.body}>{currentMatch.animal.matchReason}</Text></View> : null}
              {!result.isDemo && result.features?.length && !result.features.some(feature => feature.keyword) ? <View style={styles.animalNotes}><Eyebrow>VISIBLE FEATURES · NOT MEASUREMENTS</Eyebrow>{result.features.map(feature => <View key={feature.feature}><Text style={styles.smallTitle}>{feature.feature}</Text><Text style={styles.smallBody}>{feature.observation}</Text></View>)}</View> : null}
              <View style={styles.animalNotes}><Eyebrow>{currentMatch.animal.imageOrigin === 'generated' ? 'ABOUT YOUR CHARACTER' : 'ABOUT THE REFERENCE PHOTO'}</Eyebrow><Text style={styles.smallBody}>{currentMatch.animal.description}</Text>
                <View style={styles.traits}>{currentMatch.animal.traits.map(trait => <Pill key={trait}>{trait}</Pill>)}</View>
                <TextLink onPress={() => void Linking.openURL(currentMatch.animal.sourceUrl)}>{currentMatch.animal.imageOrigin === 'generated' ? 'About OpenAI image generation ↗' : 'Photo source & licence ↗'}</TextLink>
                {currentMatch.animal.speciesSourceUrl ? <TextLink onPress={() => void Linking.openURL(currentMatch.animal.speciesSourceUrl!)}>Species on iNaturalist ↗</TextLink> : null}
              </View>
              <Button onPress={() => void exportCard()} disabled={!cardReady} loading={exporting} icon="share-2" testID="share-comparison">{isCharacter ? 'Share character' : 'Share comparison'}</Button>
              <TextLink onPress={() => setTopic('credits')}>Image credits & rights ↗</TextLink>
            </View>
          </View>
          {isCharacter ? <TextLink onPress={() => setShowDesignNotes(value => !value)}>{showDesignNotes ? 'Hide design notes −' : 'Show design notes +'}</TextLink> : null}
          {!isCharacter || showDesignNotes ? <FaceProfilePanel key={result.id} result={result} wide={wide} /> : null}
          <AnimalSearchPanel key={`${result.id}-${currentMatch.animal.id}`} animal={currentMatch.animal} isDemo={result.isDemo} />
        </View> : null}

        {screen === 'catalogue' ? <View style={styles.catalogue}>
          <Eyebrow>THE REFERENCE COLLECTION</Eyebrow><Text accessibilityRole="header" style={styles.sectionTitle}>Many faces. One natural world.</Text>
          <Text style={styles.body}>The character experience chooses one animal from your facial shapes, then uses your portrait to draw a cartoon version. Explore taxonomy separately with GBIF. The three photos below are offline demo references, not generated characters.</Text>
          <SpeciesExplorer wide={wide} />
          <Eyebrow>THREE OFFLINE DEMO PHOTOGRAPHS</Eyebrow>
          <View style={styles.animalGrid}>{animals.map(animal => <View key={animal.id} style={[styles.animalTile, { width: wide ? '31.8%' : '100%' }]}>
            <Image source={animalPhoto(animal)} style={styles.cataloguePhoto} resizeMode="cover" accessibilityLabel={animal.name} />
            <View style={styles.animalTileCopy}><Eyebrow>{animal.family.toUpperCase()}</Eyebrow><Text style={styles.catalogueName}>{animal.name}</Text><Text style={styles.matchScientific}>{animal.scientificName}</Text>
              <Text style={styles.smallBody}>{animal.description}</Text><Text style={styles.photoCredit}>{animal.photoCredit} · cropped</Text>
              <TextLink onPress={() => void Linking.openURL(animal.sourceUrl)}>View source photograph ↗</TextLink>
            </View></View>)}</View>
          <TextLink onPress={() => setScreen(result ? 'result' : 'welcome')}>← Back to discover</TextLink>
        </View> : null}

        <View style={styles.footer}><View style={styles.footerLeft}><View style={styles.statusDot} /><Text style={styles.footerText}>{API_URL ? config?.mode === 'experimental-live' ? config.liveReady === false ? 'OPENAI SETUP NEEDED' : config.experience === 'animal-character' ? 'PORTRAIT → ANIMAL CHARACTER' : 'AI FEATURES + OPEN SPECIES' : 'DEVELOPMENT API · 3 DEMO ANIMALS' : 'LOCAL DEMO · 3 ANIMALS'}</Text></View>
          <View style={styles.footerLinks}><TextLink onPress={() => setTopic('privacy')}>Privacy</TextLink><TextLink onPress={() => setTopic('credits')}>Photo credits</TextLink>
            {portrait ? <TextLink onPress={clearSession}>Clear session</TextLink> : null}</View>
        </View>
      </View>
    </ScrollView>
    <InfoModal topic={topic} onClose={() => setTopic(null)} />
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><KinformApp /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, scroll: { flexGrow: 1 }, container: { width: '100%', maxWidth: 1260, marginHorizontal: 'auto', paddingHorizontal: 48 },
  header: { paddingVertical: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, gap: 14 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brand: { fontFamily: serif, color: colors.ink, fontSize: 34, letterSpacing: -1.5 },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 22 }, navButton: { paddingVertical: 12 }, navText: { color: colors.muted, fontSize: 12 },
  alert: { backgroundColor: '#F5E8DF', borderRadius: 9, padding: 15, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  error: { fontSize: 13, lineHeight: 21, color: colors.error }, notice: { marginTop: 16, flexDirection: 'row', alignItems: 'center', padding: 13, gap: 10, backgroundColor: colors.soft, borderRadius: 9 }, noticeText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.olive },
  flow: { gap: 32, paddingVertical: 40 }, flowWide: { flexDirection: 'row', gap: 65, alignItems: 'center', paddingVertical: 58 }, previewPhoto: { height: 460, borderRadius: 16, backgroundColor: colors.soft, overflow: 'hidden' }, fullImage: { height: '100%', width: '100%' },
  cornerLabel: { position: 'absolute', bottom: 18, left: 18, borderRadius: 5, backgroundColor: 'rgba(20,30,20,0.6)', padding: 10 }, cornerText: { color: '#fff', fontSize: 10, letterSpacing: 2 },
  flowCopy: { gap: 16 }, sectionTitle: { fontFamily: serif, fontSize: 40, letterSpacing: -1, lineHeight: 49, color: colors.ink, marginTop: 13, marginBottom: 16 }, body: { fontSize: 14, color: colors.muted, lineHeight: 24, maxWidth: 600 },
  permissionBox: { flexDirection: 'row', gap: 14, backgroundColor: colors.soft, padding: 18, borderRadius: 11, marginTop: 5 }, smallTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, lineHeight: 21 }, smallBody: { fontSize: 12, color: colors.muted, lineHeight: 20, marginTop: 6 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, checkbox: { width: 23, height: 23, borderWidth: 1, borderColor: colors.olive, borderRadius: 5, justifyContent: 'center', alignItems: 'center' }, checked: { backgroundColor: colors.olive }, checkboxText: { fontSize: 12, color: colors.ink, lineHeight: 20, flex: 1 }, inlineLinks: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 },
  processing: { minHeight: 520, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 18 }, processingIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  resultArea: { paddingVertical: 34 }, resultHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 28 }, resultColumns: { gap: 38 }, cardColumn: { minWidth: 0 }, detailColumn: { gap: 17, minWidth: 0 }, cardFootnote: { textAlign: 'center', fontSize: 10, color: colors.muted, lineHeight: 17, marginTop: 13 }, detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  matchList: { gap: 10 }, matchRow: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface }, matchRowSelected: { borderColor: colors.olive, backgroundColor: '#EDF0E2' }, matchThumbnail: { width: 62, height: 64, borderRadius: 6 }, matchName: { fontSize: 14, fontWeight: '600', color: colors.ink }, matchScientific: { color: colors.muted, fontSize: 11, fontStyle: 'italic' }, rank: { alignItems: 'center', gap: 4, minWidth: 24 }, rankText: { fontFamily: serif, fontSize: 21, color: colors.olive },
  animalNotes: { paddingVertical: 6, gap: 7 }, traits: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  catalogue: { paddingVertical: 42 }, animalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 22, marginTop: 30 }, animalTile: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }, cataloguePhoto: { height: 280, width: '100%' }, animalTileCopy: { padding: 22, gap: 8 }, catalogueName: { fontFamily: serif, fontSize: 28, color: colors.ink }, photoCredit: { fontSize: 10, color: colors.muted, lineHeight: 17, marginTop: 8 },
  footer: { borderTopWidth: 1, borderColor: colors.line, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 12 }, footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 }, statusDot: { height: 5, width: 5, borderRadius: 3, backgroundColor: colors.olive }, footerText: { fontSize: 8, letterSpacing: 1.1, color: colors.muted }, footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 18 },
});
