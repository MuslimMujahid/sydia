import type { LucideIcon } from "lucide-react-native";
import { useRef, useState, type ComponentRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";

export type DropdownMenuItem = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
};

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  /** Icon of the round trigger button. */
  icon: LucideIcon;
  accessibilityLabel: string;
  size?: number;
  iconSize?: number;
}

type Anchor = { top: number; right: number };

/**
 * A round icon button that drops a popover menu down from itself,
 * right-aligned to it.
 * Tapping outside or picking an item closes it.
 */
export function DropdownMenu({
  items,
  icon,
  accessibilityLabel,
  size,
  iconSize,
}: DropdownMenuProps) {
  const triggerRef = useRef<ComponentRef<typeof View>>(null);
  const { width } = useWindowDimensions();
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  function open() {
    triggerRef.current?.measureInWindow((x, y, triggerWidth, triggerHeight) =>
      setAnchor({
        top: y + triggerHeight + spacing.xs,
        right: Math.max(spacing.sm, width - (x + triggerWidth)),
      })
    );
  }

  function close() {
    setAnchor(null);
  }

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <IconButton
          icon={icon}
          size={size}
          iconSize={iconSize}
          accessibilityLabel={accessibilityLabel}
          onPress={open}
        />
      </View>
      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Tutup menu"
          onPress={close}
        />
        {anchor ? (
          <View
            style={[styles.menu, { top: anchor.top, right: anchor.right }]}
            accessibilityRole="menu"
          >
            {items.map(({ label, icon: Icon, destructive, onPress }) => {
              const tint = destructive ? colors.destructive : colors.foreground;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="menuitem"
                  onPress={() => {
                    close();
                    onPress();
                  }}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && styles.pressed,
                  ]}
                >
                  {Icon ? (
                    <Icon size={18} color={tint} strokeWidth={2} />
                  ) : null}
                  <Text
                    variant="callout"
                    weight="medium"
                    style={{ color: tint }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    minWidth: 196,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.raised,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.pressed },
});
