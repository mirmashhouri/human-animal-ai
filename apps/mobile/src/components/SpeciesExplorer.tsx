import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { API_URL } from '../data';
import { searchSpecies } from '../api';
import { colors, serif } from '../theme';
import type { SpeciesSearch } from '../types';
import { Button, Eyebrow, Icon, TextLink } from './Primitives';

export function SpeciesExplorer({ wide }: { wide: boolean }) {
  const [query, setQuery] = useState('fox');
  const [field, setField] = useState<'common' | 'scientific'>('common');
  const [result, setResult] = useState<SpeciesSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);

  async function search(searchQuery = query.trim(), searchField = field, offset = 0) {
    if (requestRef.current || searchQuery.length < 2) return;
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setError(''); setResult(null);
    try {
      const next = await searchSpecies(searchQuery, searchField, offset, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch (exception) {
      if (requestRef.current === controller) setError(controller.signal.aborted ? 'The catalogue search timed out. Please try again.' :
        exception instanceof Error ? exception.message : 'The catalogue could not load.');
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false); }
    }
  }

  async function openSource(url: string) {
    // Only our GBIF species/dataset links are allowed, even if a server response is malformed.
    if (!/^https:\/\/www\.gbif\.org\/(?:species\/\d+|dataset\/[0-9a-f-]+)?$/.test(url)) return;
    try { await Linking.openURL(url); } catch { setError('The source link could not open. Visit gbif.org in your browser.'); }
  }

  return <View style={styles.panel} testID="species-explorer">
    <View style={styles.heading}><Icon name="globe" color={colors.olive} /><Eyebrow>EXPLORE BEYOND THE THREE REFERENCES</Eyebrow></View>
    <Text accessibilityRole="header" style={styles.title}>An animal world to discover.</Text>
    <Text style={styles.body}>Search species records from GBIF — the Global Biodiversity Information Facility. Each record includes its animal ID and a link to its source.</Text>
    <Text style={styles.note}>This is a separate taxonomy explorer. Live face suggestions use AI and iNaturalist photos; the three bundled photos are demo examples. GBIF records do not automatically grant photo rights or cover every domestic breed.</Text>
    <View style={styles.modes} accessibilityRole="radiogroup">
      {(['common', 'scientific'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
        accessibilityLabel={value === 'common' ? 'Common animal name' : 'Scientific animal name'}
        aria-checked={field === value}
        accessibilityState={{ checked: field === value, disabled: busy }} disabled={busy}
        onPress={() => setField(value)} style={[styles.mode, field === value && styles.selected]}>
        <Text style={styles.modeText}>{value === 'common' ? 'Common name' : 'Scientific name'}</Text>
      </Pressable>)}
    </View>
    <View style={[styles.form, wide && { flexDirection: 'row' }]}>
      <TextInput value={query} onChangeText={setQuery} maxLength={80} editable={!busy}
        accessibilityLabel="Animal catalogue search" placeholder={field === 'common' ? 'e.g. fox, owl, leopard' : 'e.g. Vulpes, Panthera'}
        placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" autoCorrect={false}
        returnKeyType="search" onSubmitEditing={() => void search()} />
      <Button onPress={() => void search()} disabled={!API_URL || query.trim().length < 2} loading={busy} icon="search">Search GBIF</Button>
    </View>
    <Text style={styles.note}>{API_URL ? 'Only the search text goes through your server to GBIF. No portrait is sent to GBIF. No GBIF API key is required.' : 'Start and connect the .NET API to enable this search. No GBIF API key is required.'}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {result ? <View style={styles.results}>
      <Text accessibilityLiveRegion="polite" style={styles.body}>{`${result.totalRecords.toLocaleString()} species records for “${result.query}” · showing ${result.results.length} on this page`}</Text>
      {result.results.length === 0 ? <Text style={styles.note}>No displayable animals on this page. Try another name or search by scientific name.</Text> : null}
      {result.results.map(animal => <View key={animal.key} style={styles.record}>
        <View style={styles.recordText}><Text style={styles.name}>{animal.name}</Text><Text style={styles.scientific}>{animal.scientificName}</Text>
          <Text style={styles.note}>{`${animal.family} · GBIF key ${animal.key}`}</Text></View>
        <View><TextLink onPress={() => void openSource(animal.sourceUrl)}>View on GBIF ↗</TextLink>
          <TextLink onPress={() => void openSource(animal.datasetUrl)}>Source dataset ↗</TextLink></View>
      </View>)}
      <View style={styles.pagination}>
        {result.offset > 0 ? <Button secondary onPress={() => void search(result.query, result.field, Math.max(0, result.offset - 12))}>Previous results</Button> : null}
        {result.nextOffset !== null ? <Button secondary onPress={() => void search(result.query, result.field, result.nextOffset!)}>Next results</Button> : null}
      </View>
      <Text style={styles.note}>{result.notice}</Text>
    </View> : null}
    <TextLink onPress={() => void openSource('https://www.gbif.org/')}>Data source: GBIF.org ↗</TextLink>
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.soft, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 24, gap: 14, marginVertical: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { fontFamily: serif, color: colors.ink, fontSize: 30 }, body: { color: colors.ink, fontSize: 14, lineHeight: 23 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 20 }, modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 20 },
  selected: { backgroundColor: colors.lime, borderColor: colors.olive }, modeText: { color: colors.ink, fontSize: 12 },
  form: { gap: 12 }, input: { flexGrow: 1, minWidth: 0, minHeight: 54, borderWidth: 1, borderColor: colors.line,
    borderRadius: 9, padding: 15, backgroundColor: colors.surface, color: colors.ink, fontSize: 15 },
  error: { color: colors.error, fontSize: 13, lineHeight: 21 }, results: { gap: 12 },
  record: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, padding: 18,
    backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  recordText: { flex: 1, minWidth: 160, gap: 5 }, name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  scientific: { color: colors.muted, fontStyle: 'italic', fontSize: 12 }, pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
