import { X } from "lucide-react-native";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { colors, spacing } from "@/lib/theme";

interface SelectableTextModalProps {
  text: string | null;
  locale: SupportedLocale;
  onClose: () => void;
}

/** "Pilih teks": the message as plain selectable text, for partial copies. */
export function SelectableTextModal({
  text,
  locale,
  onClose,
}: SelectableTextModalProps) {
  return (
    <Modal
      visible={text !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text variant="headline">
            {locale === "en" ? "Select text" : "Pilih teks"}
          </Text>
          <IconButton
            icon={X}
            variant="filled"
            size={36}
            accessibilityLabel={locale === "en" ? "Close" : "Tutup"}
            onPress={onClose}
          />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <NativeText selectable style={styles.text}>
            {text}
          </NativeText>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  content: { padding: spacing.xl },
  text: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.foreground,
  },
});
