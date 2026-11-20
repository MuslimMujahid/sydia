import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { colors, radius, shadows, spacing } from "@/lib/theme";

interface NamePromptProps {
  visible: boolean;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  maxLength?: number;
  /** Throw to keep the prompt open with the error shown. */
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

/**
 * A small centered dialog asking for one name: create or rename a folder or
 * a contact group. Android has no system text prompt, so both platforms use it.
 */
export function NamePrompt(props: NamePromptProps) {
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (!saving) props.onClose();
      }}
    >
      {props.visible ? (
        <NamePromptBody {...props} saving={saving} onSavingChange={setSaving} />
      ) : null}
    </Modal>
  );
}

function NamePromptBody({
  title,
  description,
  label,
  initialValue = "",
  submitLabel,
  maxLength,
  onSubmit,
  onClose,
  saving,
  onSavingChange,
}: NamePromptProps & {
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const canSave = value.trim().length > 0 && !saving;

  async function submit() {
    if (!canSave) return;
    onSavingChange(true);
    setError(null);

    try {
      await onSubmit(value.trim());
    } catch (caught) {
      console.warn("Name prompt save failed", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Perubahan tidak dapat disimpan. Coba lagi."
      );
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.overlay}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Tutup"
        onPress={saving ? undefined : onClose}
      />
      <View style={styles.card} accessibilityViewIsModal>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
        <TextField
          label={label}
          value={value}
          onChangeText={setValue}
          autoFocus
          maxLength={maxLength}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        <InlineError message={error} />
        <View style={styles.actions}>
          <Button
            label="Batal"
            variant="ghost"
            onPress={onClose}
            disabled={saving}
          />
          <Button
            label={submitLabel}
            variant="secondary"
            loading={saving}
            disabled={!canSave}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
    backgroundColor: colors.overlay,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    gap: spacing.lg,
    boxShadow: shadows.raised,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
