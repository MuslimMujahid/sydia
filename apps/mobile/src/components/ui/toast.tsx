import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  useAnimatedValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";

type ToastOptions = {
  tone?: "default" | "error";
  action?: { label: string; onPress: () => void };
  durationMs?: number;
};

type ToastState = ToastOptions & { id: number; message: string };

type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** Short confirmations and undo offers, shown as a graphite banner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const show = useCallback<ShowToast>((message, options) => {
    counter.current += 1;
    setToast({ id: counter.current, message, ...options });
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <ToastView key={toast.id} toast={toast} onDone={() => setToast(null)} />
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  onDone,
}: {
  toast: ToastState;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(
      () =>
        Animated.timing(progress, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }).start(onDone),
      toast.durationMs ?? (toast.action ? 5_000 : 2_800)
    );

    return () => clearTimeout(timer);
  }, [onDone, progress, toast]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + spacing.sm }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole={toast.tone === "error" ? "alert" : "text"}
        style={[
          styles.toast,
          toast.tone === "error" && styles.error,
          {
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text
          variant="callout"
          weight="medium"
          tone="inverse"
          style={styles.message}
        >
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              toast.action?.onPress();
              onDone();
            }}
          >
            <Text variant="callout" weight="bold" color={colors.accent}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider.");

  return show;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    maxWidth: 520,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    boxShadow: shadows.raised,
  },
  error: { backgroundColor: colors.destructive },
  message: { flexShrink: 1 },
});
