import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { animals } from '../data';
import { colors, serif } from '../theme';
import { Button, Eyebrow, Icon, TextLink } from './Primitives';

export type InfoTopic = 'privacy' | 'how' | 'credits' | null;
const copy = {
  privacy: {
    tag: 'YOUR PHOTO, YOUR CHOICE', title: 'Private by design.',
    paragraphs: [
      'In local demo mode, your portrait stays on your device. It is not sent to the .NET server or an AI provider. Native image picking and resizing may create temporary files in the device cache. The sample portrait is always local and never analysed.',
      'If you configure an API server, the consent screen identifies whether the server uses demo matching or OpenAI. Nothing uploads until you confirm. The prototype does not save uploads or matching results to a database.',
      'A new live analysis uses two OpenAI requests: first the resized portrait produces a 20-field visual profile, then a text-only request compares eight candidate species against its distinctive shapes. In character mode, one further billed image-edit request sends your actual resized portrait, the chosen animal and supported visible descriptors to OpenAI. It draws a cartoon animal from your photo, not just a generic animal from words. Input-image processing also contributes to billing. There are no automatic retries. Provider retention rules apply; response storage is disabled for analysis but this is not a promise of zero retention.',
      'The server does not cache visual profiles, selected animals or generated characters. Every submission runs independently, including the same photo or concurrent uploads. Results remain in the current interface until you clear your session. No analysis cache or portrait digest is retained for future matching. Repeating a creation can bill both analysis requests and the image-edit request again.',
      'Only in internet-reference mode, species names and IDs go to iNaturalist to find reference photos. Your portrait and facial features are not sent there. Photos load directly from its public image host, which receives ordinary network information such as your IP address. Generated-image mode skips these lookups and the animal-photo review step entirely.',
      'When animal-photo review is enabled, a separate OpenAI request inspects up to six public animal photographs per species for a visible, sharp, unobstructed face. It receives no user portrait, facial features or resemblance reasons. Approved public selections are cached in server memory for up to six hours, subject to eviction and server restarts. No portrait or user-specific reason is stored in that cache.',
      'Clear your session to remove the portrait and result from the interface. This does not delete files you saved, copies you shared, browser caches or any data retained by an external provider.',
      'No advertising, tracking or public gallery is enabled in this build. A production privacy policy, consent review and retention controls are still required before release.',
      'The optional species explorer sends only your search text through the .NET server to GBIF. It does not send portraits. Opening source links takes you to GBIF, where its own privacy policy applies.',
      'The optional animal-image search panel prepares editable search words from the strongest supported profile features for the selected animal. Nothing goes to Pinterest or Google until you tap its search button; then your search words and ordinary network information go to that site, not your portrait. Their own privacy and retention policies apply. These keywords remain in the current result, not an analysis cache, and never enter the generic public animal-photo cache.',
    ],
  },
  how: {
    tag: 'BEHIND THE CHARACTER', title: 'A portrait, reimagined.',
    paragraphs: [
      'The main experience creates one cartoon animal using your portrait as the visual reference. AI chooses a species that can carry your distinctive facial shapes, then draws an unmistakable animal with those elements. It is creative artwork, not a detected animal identity, scientific test, personality reading, ancestry assessment or measure of attractiveness.',
      'Local demo mode uses three fixed examples. Live mode studies 20 features as a portrait painter or caricaturist: which visible proportions, contrasts and shapes give this particular face its character as a drawing? It separates faithful observations from hypothetical exaggerations, then selects up to three clearly supported focal shapes. Artistic prominence is not confidence, attractiveness, personality or statistical rarity. Hidden details are excluded and iris colour cannot become a structural focal point.',
      'The second request considers eight species from broad AI knowledge whose natural anatomy echoes those distinctive shapes. The server ranks signature fit first, overall geometry second, then uses scientific name to break ties. Every selected animal needs at least partial support on all focal shapes, strong support on one, and two strong shape matches overall. It explains both the artistic echo and an anatomical difference. These are subjective artistic choices, not measured probabilities or an exhaustive 10,000-species search; breed matching is not implemented.',
      'Character mode selects only the best-supported candidate. The image editor receives your actual portrait and translates visible eye spacing, expression, cheek shapes and facial proportions into a cartoon. Species-defining ears, muzzle or beak, fur and markings should stay clear. The goal is an animal character, not a human face pasted onto an animal. Likeness and anatomy can still be imperfect.',
      'The optional legacy Reference mode instead returns three species and retrieves licensed iNaturalist photographs. Its separate animal-photo review, when enabled, checks public animal images for a clear face, not resemblance to you. Local demo mode contains fixed reference photos and is not a preview of generated cartoon quality.',
      'Reasons and design notes are subjective AI interpretations, not measured probabilities or exact angles. No analysis is reused, so the same photo can produce a different animal or drawing on another submission. GBIF remains a separate taxonomy explorer.',
      'Explore similar animal looks opens Pinterest or Google Images with editable search words, only when you tap a link. No portrait is sent to those sites. External results may be unrelated and are not approved for reuse or imported into the share card.',
    ],
  },
  credits: { tag: 'REFERENCE PHOTOGRAPHY', title: 'Credit where it’s due.', paragraphs: [
    'Generated animal portraits are labelled AI-generated in the app and exported cards, with the configured OpenAI image model. They are not licensed wildlife photographs, do not carry invented photographer credits or Creative Commons claims, and may contain inaccuracies.',
    'Live photos come from iNaturalist with individual CC0, CC BY or CC BY-SA licence metadata. We exclude non-commercial, no-derivatives, hidden and flagged photos. Each result includes its photographer credit and original photo page, where the exact licence can be reviewed. Live animal photos are fitted in full to preserve their faces; attribution travels with the exported card. Source metadata is not a complete legal rights review or an endorsement.',
    'Animal photographs are bundled locally from Wikimedia Commons. Views are cropped. Licence notices travel with exported cards. Share-alike terms apply to adaptations of the relevant animal photograph; they do not imply that the photographer endorses this app.',
    'The sample portrait is by Gromovataya, CC0, via Wikimedia Commons. It illustrates the layout only, is never sent to an AI provider, and is not an endorsement or a real analysis result. Review personality/model-release rights before using it in a public campaign.',
    'Species discovery data is provided through GBIF — the Global Biodiversity Information Facility. Each search result links to its GBIF record and source dataset. GBIF metadata is not permission to reuse photographs, and GBIF does not endorse this app.',
  ] },
};

export function InfoModal({ topic, onClose }: { topic: InfoTopic; onClose: () => void }) {
  if (!topic) return null;
  const content = copy[topic];
  return <Modal transparent animationType="fade" visible onRequestClose={onClose}>
    <View style={styles.scrim}><View accessibilityViewIsModal style={styles.panel}>
      <View style={styles.top}><Eyebrow>{content.tag}</Eyebrow><Pressable accessibilityRole="button" accessibilityLabel="Close information" onPress={onClose} style={styles.close}><Icon name="x" /></Pressable></View>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 12 }}>
        <Text accessibilityRole="header" style={styles.title}>{content.title}</Text>
        {content.paragraphs.map(paragraph => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}
        {topic === 'credits' ? animals.map(animal => <View key={animal.id} style={styles.credit}>
          <Text style={styles.creditName}>{animal.name}</Text><Text style={styles.body}>{animal.photoCredit}</Text>
          <TextLink onPress={() => void Linking.openURL(animal.sourceUrl)}>Original photograph ↗</TextLink>
          <TextLink onPress={() => void Linking.openURL(animal.licenseUrl)}>Read the photograph licence ↗</TextLink>
        </View>) : null}
      </ScrollView>
      <Button onPress={onClose}>Got it</Button>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(15,24,15,0.55)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  panel: { backgroundColor: colors.paper, padding: 26, borderRadius: 18, width: '100%', maxWidth: 570, maxHeight: '90%', gap: 18 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, close: { padding: 10 },
  title: { fontFamily: serif, fontSize: 36, color: colors.ink, marginBottom: 22 }, body: { fontSize: 14, lineHeight: 23, color: colors.muted, marginBottom: 17 },
  credit: { paddingVertical: 14, borderTopWidth: 1, borderColor: colors.line }, creditName: { fontWeight: '600', fontSize: 16, color: colors.ink, marginBottom: 6 },
});
