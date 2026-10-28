import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

export function Button({ children, onPress, icon, secondary, disabled, loading, testID }: {
  children: string; onPress: () => void; icon?: IconName; secondary?: boolean;
  disabled?: boolean; loading?: boolean; testID?: string;
}) {
  const inactive = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityLabel={children}
    accessibilityState={{ disabled: !!inactive, busy: !!loading }} disabled={inactive} onPress={onPress}
    testID={testID} style={({ pressed }) => [styles.button, secondary && styles.secondary,
      inactive && { opacity: 0.5 }, pressed && !inactive && { opacity: 0.82, transform: [{ scale: 0.99 }] }]}>
    {loading ? <ActivityIndicator color={secondary ? colors.ink : colors.white} /> :
      icon ? <Icon name={icon} size={18} color={secondary ? colors.ink : colors.white} /> : null}
    <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>{children}</Text>
  </Pressable>;
}

export function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: colors.lime }]}>{children}</Text>;
}

export function Pill({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return <View style={styles.pill}>{icon ? <Icon name={icon} size={12} color={colors.olive} /> : null}
    <Text style={styles.pillText}>{children}</Text></View>;
}

export function TextLink({ children, onPress }: { children: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
    <Text style={styles.link}>{children}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 54, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 9, backgroundColor: colors.ink,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.ink },
  secondary: { backgroundColor: 'transparent', borderColor: colors.line },
  buttonText: { color: colors.white, fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2.2, color: colors.olive, lineHeight: 17 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.soft, borderRadius: 30, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 10, color: colors.olive, fontWeight: '600', letterSpacing: 0.4 },
  link: { fontSize: 13, color: colors.olive, textDecorationLine: 'underline', lineHeight: 20 },
});
