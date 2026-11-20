import { Check, Folder } from "lucide-react-native";
import { useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FormScroll, HeaderTextButton } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import type { WorkspaceItem } from "@/lib/services/api/notes/notes.api";
import { colors, spacing } from "@/lib/theme";

export function WorkspaceDestination({
  item,
  restore,
  targets,
  onClose,
  onSubmit,
}: {
  item: WorkspaceItem;
  restore: boolean;
  targets: WorkspaceItem[];
  onClose: () => void;
  onSubmit: (parentId: string | null, title?: string) => Promise<void>;
}) {
  const initial =
    restore && targets.some((target) => target.id === item.parentId)
      ? item.parentId
      : null;
  const [destination, setDestination] = useState<string | null>(initial);
  const [title, setTitle] = useState(item.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const canSave = (restore || item.parentId !== destination) && !!title.trim();
  const action = restore ? "Pulihkan" : "Pindahkan";

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit(destination, restore ? title.trim() : undefined);
    } catch (caught) {
      console.warn("Workspace item destination could not be saved", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "Perubahan belum dapat disimpan."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : onClose}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modal}>
        <View style={styles.header}>
          <HeaderTextButton label="Batal" onPress={onClose} disabled={saving} />
          <Text variant="headline" accessibilityRole="header">
            Folder tujuan
          </Text>
          <HeaderTextButton
            label={action}
            emphasis
            onPress={() => void save()}
            loading={saving}
            disabled={!canSave}
          />
        </View>
        <FormScroll>
          {restore ? (
            <TextField
              label="Nama"
              value={title}
              onChangeText={setTitle}
              maxLength={240}
              editable={!saving}
            />
          ) : (
            <Text variant="callout" tone="muted">
              {item.title}
            </Text>
          )}
          <InlineError message={error} />
          <ListSection>
            {[{ id: null, path: "Semua catatan" }, ...targets].map((target) => {
              const selected = target.id === destination;
              return (
                <ListRow
                  key={target.id ?? "root"}
                  title={target.path}
                  titleLines={2}
                  icon={Folder}
                  accessibilityLabel={
                    selected ? `${target.path}, dipilih` : target.path
                  }
                  trailing={
                    selected ? (
                      <Check size={20} color={colors.accent} />
                    ) : undefined
                  }
                  onPress={() => setDestination(target.id)}
                  disabled={saving}
                  chevron={false}
                />
              );
            })}
          </ListSection>
        </FormScroll>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
});
