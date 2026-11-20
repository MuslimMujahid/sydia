import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Check, Sparkles } from "lucide-react-native";
import { useEffect, useRef } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "@/components/ui/text";
import type { AssistantPersona } from "@/lib/services/api/users/users.api";
import { colors, radius, shadows, spacing } from "@/lib/theme";
import {
  DEFAULT_ASSISTANT_PERSONA,
  PERSONA_OPTIONS,
  type PersonaOption,
} from "./personas";

interface PersonaPickerProps {
  value: AssistantPersona;
  onChange: (persona: AssistantPersona) => void;
  disabled?: boolean;
  /** Marks the default persona as recommended (first-run setup). */
  showRecommended?: boolean;
}

/**
 * Swipeable persona cards that snap one at a time. The selected card takes
 * the coral outline; selecting scrolls it into view.
 */
export function PersonaPicker({
  value,
  onChange,
  disabled = false,
  showRecommended = false,
}: PersonaPickerProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(280, Math.round(width * 0.72));
  const gap = spacing.md;
  const listRef = useRef<FlatList<PersonaOption>>(null);
  const selectedIndex = Math.max(
    0,
    PERSONA_OPTIONS.findIndex((option) => option.value === value)
  );

  useEffect(() => {
    listRef.current?.scrollToOffset({
      offset: Math.max(0, selectedIndex * (cardWidth + gap)),
      animated: true,
    });
  }, [cardWidth, gap, selectedIndex]);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={PERSONA_OPTIONS}
      keyExtractor={(option) => option.value}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + gap}
      decelerationRate="fast"
      contentContainerStyle={[styles.track, { gap }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Persona asisten"
      renderItem={({ item }) => {
        const selected = item.value === value;

        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={`${item.label}. ${item.description}`}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(item.value);
            }}
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth },
              selected && styles.cardSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.imageWrap}>
              <Image
                source={item.image}
                style={styles.image}
                contentFit="cover"
                accessibilityLabel={item.imageAlt}
                transition={120}
              />
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? (
                  <Check size={14} color={colors.white} strokeWidth={3} />
                ) : null}
              </View>
            </View>
            <View style={styles.body}>
              <Text variant="headline">{item.label}</Text>
              <Text variant="footnote" tone="muted" numberOfLines={3}>
                {item.description}
              </Text>
              {showRecommended && item.value === DEFAULT_ASSISTANT_PERSONA ? (
                <View style={styles.recommended}>
                  <Sparkles size={13} color={colors.accent} strokeWidth={2} />
                  <Text variant="caption" weight="semibold" tone="accent">
                    Direkomendasikan
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  track: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  card: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    boxShadow: shadows.card,
  },
  cardSelected: { borderColor: colors.accent },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  imageWrap: { aspectRatio: 4 / 3, backgroundColor: colors.muted },
  image: { width: "100%", height: "100%" },
  radio: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.input,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  body: { padding: spacing.lg, gap: spacing.xs, minHeight: 124 },
  recommended: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.xs,
  },
});
