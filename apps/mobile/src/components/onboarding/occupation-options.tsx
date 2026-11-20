import * as Haptics from "expo-haptics";
import { Fragment } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import {
  OCCUPATION_LABELS,
  USER_OCCUPATIONS,
  type UserOccupation,
} from "@/lib/services/api/users/users.api";
import { colors, radius, shadows, spacing } from "@/lib/theme";

interface OccupationOptionsProps {
  value: UserOccupation | null;
  onChange: (value: UserOccupation) => void;
  disabled?: boolean;
  /** Names the group for assistive technology. */
  label: string;
}

/**
 * "Which describes you best" as a radio list. The answer picks the example
 * messages Sydia shows; it never limits what the user can do.
 */
export function OccupationOptions({
  value,
  onChange,
  disabled = false,
  label,
}: OccupationOptionsProps) {
  return (
    <View
      style={styles.card}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {USER_OCCUPATIONS.map((occupation, index) => {
        const selected = value === occupation;

        return (
          <Fragment key={occupation}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={OCCUPATION_LABELS[occupation]}
              disabled={disabled}
              onPress={() => {
                if (selected) return;
                void Haptics.selectionAsync();
                onChange(occupation);
              }}
              android_ripple={{ color: colors.pressed }}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text variant="body" weight={selected ? "semibold" : "regular"}>
                {OCCUPATION_LABELS[occupation]}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.card,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.xxl + spacing.xl,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: { backgroundColor: colors.pressed },
  disabled: { opacity: 0.5 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.75,
    borderColor: colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.accent },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
});
