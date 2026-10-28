import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { animalSearchUrl, MAX_SEARCH_LENGTH, normalizeSearchQuery, suggestedAnimalQuery, type ImageSearchProvider } from '../animalSearch';
import type { Animal } from '../types';
import { colors, serif } from '../theme';
import { Button, Eyebrow, Icon, TextLink } from './Primitives';

// The parent keys this panel by result + animal so edits cannot follow a different match.
export function AnimalSearchPanel({ animal, isDemo }: { animal: Animal; isDemo: boolean }) {
  const suggestion = suggestedAnimalQuery(animal, isDemo);
  const [query, setQuery] = useState(suggestion);
  const [error, setError] = useState('');
  const empty = !normalizeSearchQuery(query);

  function edit(value: string) {
    setQuery(value); setError('');
  }

  async function search(provider: ImageSearchProvider) {
    const url = animalSearchUrl(provider, query);
    if (!url) return;
    setError('');
    try { await Linking.openURL(url); }
    catch { setError('The search could not open. Please allow browser pop-ups or try again.'); }
  }

  return <View style={styles.panel} testID="animal-search-panel">
    <View style={styles.heading}><Icon name="search" size={22} color={colors.olive} /><Eyebrow>BEYOND THE REFERENCE</Eyebrow></View>
    <Text accessibilityRole="header" style={styles.title}>Explore similar animal looks.</Text>
    <Text style={styles.body}>{isDemo ? 'A species-only search for this demo, not keywords from your face.' : animal.searchKeywords?.length ?
      `AI suggested search words for ${animal.name} from visible features. They are visual inspiration, not a measured match.` :
      `Start with ${animal.name}. No feature keywords were provided for this result.`} Edit the words to explore a breed, eye colour or a closer portrait.</Text>
    <Text style={styles.label}>Your search words</Text>
    <TextInput accessibilityLabel="Animal image search words" value={query} maxLength={MAX_SEARCH_LENGTH}
      onChangeText={edit} style={styles.input}
      placeholder="e.g. Persian cat rounded face green eyes portrait" placeholderTextColor={colors.muted}
      autoCapitalize="none" autoCorrect={false} multiline />
    <TextLink onPress={() => edit(suggestion)}>Reset suggested words</TextLink>
    <View style={styles.privacy}><Icon name="external-link" size={16} color={colors.olive} /><Text style={[styles.small, { flex: 1 }]}>Only when you tap: your search words go to the chosen site, never your portrait. Links open the website, which has its own privacy policy.</Text></View>
    <View style={styles.buttons}>
      <View style={styles.button}><Button secondary icon="external-link" disabled={empty} onPress={() => void search('pinterest')}>Search Pinterest</Button></View>
      <View style={styles.button}><Button secondary icon="external-link" disabled={empty} onPress={() => void search('google')}>Search Google Images</Button></View>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Text style={styles.small}>External results are not AI-reviewed or cleared for reuse. They do not replace the animal image on your share card.</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginTop: 30, padding: 22, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: serif, fontSize: 28, lineHeight: 35, color: colors.ink },
  body: { fontSize: 13, lineHeight: 22, color: colors.muted, maxWidth: 780 },
  label: { fontSize: 12, fontWeight: '600', color: colors.ink, marginTop: 6 },
  input: { borderWidth: 1, borderColor: colors.olive, borderRadius: 8, padding: 13, minHeight: 72, fontSize: 14, lineHeight: 22, color: colors.ink, backgroundColor: colors.paper, textAlignVertical: 'top' },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  small: { fontSize: 11, lineHeight: 18, color: colors.muted },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  error: { color: colors.error, fontSize: 12, lineHeight: 20 },
});
