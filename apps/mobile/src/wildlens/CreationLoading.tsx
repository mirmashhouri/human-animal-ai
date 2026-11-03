import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadingCopy, type CreationLoadingProps } from './creationLoadingCopy';
import { uiFontFamily, socialColors as c } from './theme';

export function CreationLoading({ stage, onStop, compact = false }: CreationLoadingProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reduced) { fade.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 1400, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 1400, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [fade, reduced]);
  const copy = loadingCopy[stage];
  return <View testID="creation-loading" style={[s.box, compact && { padding: 8, gap: 8 }]}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.drawing, compact && { height: 110 }]}>
      <Animated.View style={{ position: 'absolute', opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}><Ionicons name="person-outline" size={compact ? 80 : 105} color={c.text} /></Animated.View>
      <Animated.View style={{ opacity: fade }}><Ionicons name="paw-outline" size={compact ? 80 : 105} color={c.text} /></Animated.View>
    </View>
    {!compact ? <Text style={s.eyebrow}>YOU, REIMAGINED</Text> : null}
    <Text accessibilityLiveRegion="polite" style={[s.title, compact && { fontSize: 14, lineHeight: 19 }]}>{copy.title}</Text>{!compact ? <Text style={s.detail}>{copy.detail}</Text> : null}
    <Pressable accessibilityRole="button" onPress={onStop} style={[s.stop, compact && { paddingHorizontal: 12 }]}><Text style={[s.detail, compact && { fontSize: 12 }]}>Stop creating</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({
  box: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 12 }, drawing: { height: 155, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontFamily: uiFontFamily, color: '#a03d84', fontSize: 10, fontWeight: '600', letterSpacing: 2 },
  title: { fontFamily: uiFontFamily, color: c.text, fontSize: 19, fontWeight: '600', textAlign: 'center' },
  detail: { fontFamily: uiFontFamily, color: c.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  stop: { borderRadius: 22, borderWidth: 1, borderColor: c.border, paddingVertical: 8, paddingHorizontal: 22 },
});
