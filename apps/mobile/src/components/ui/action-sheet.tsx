import type { LucideIcon } from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { colors, radius, spacing } from "@/lib/theme";

export type ActionSheetOption = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
};

export type ActionSheetRequest = {
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
};

type ShowActionSheet = (request: ActionSheetRequest) => void;

const ActionSheetContext = createContext<ShowActionSheet | null>(null);

/**
 * iOS uses the system action sheet. Android has none, so it gets a Material
 * bottom sheet with the same options.
 */
export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ActionSheetRequest | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback<ShowActionSheet>((next) => {
    if (Platform.OS === "ios") {
      const cancelLabel = next.cancelLabel ?? "Batal";
      const labels = [
        ...next.options.map((option) => option.label),
        cancelLabel,
      ];
      const destructiveButtonIndex = next.options.flatMap((option, index) =>
        option.destructive ? [index] : []
      );

      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: next.title,
          message: next.message,
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex,
          tintColor: colors.foreground,
        },
        (index) => next.options[index]?.onPress()
      );

      return;
    }

    setRequest(next);
  }, []);

  function choose(option: ActionSheetOption) {
    setRequest(null);
    // Let the sheet close before the action opens another surface.
    setTimeout(option.onPress, 120);
  }

  return (
    <ActionSheetContext.Provider value={show}>
      {children}
      <Modal
        visible={request !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setRequest(null)}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Tutup menu"
          onPress={() => setRequest(null)}
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}
        >
          <View style={styles.handle} />
          {request?.title || request?.message ? (
            <View style={styles.header}>
              {request.title ? (
                <Text variant="callout" weight="semibold">
                  {request.title}
                </Text>
              ) : null}
              {request.message ? (
                <Text variant="footnote" tone="muted">
                  {request.message}
                </Text>
              ) : null}
            </View>
          ) : null}
          {request?.options.map((option) => {
            const Icon = option.icon;
            const color = option.destructive
              ? colors.destructive
              : colors.foreground;

            return (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                onPress={() => choose(option)}
                android_ripple={{ color: colors.pressed }}
                style={styles.option}
              >
                {Icon ? (
                  <Icon size={20} color={color} strokeWidth={1.75} />
                ) : null}
                <Text variant="body" weight="medium" color={color}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </ActionSheetContext.Provider>
  );
}

export function useActionSheet(): ShowActionSheet {
  const show = useContext(ActionSheetContext);
  if (!show)
    throw new Error("useActionSheet must be used inside ActionSheetProvider.");

  return useMemo(() => show, [show]);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.input,
    marginBottom: spacing.sm,
  },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: 56,
    paddingHorizontal: spacing.xxl,
  },
});
