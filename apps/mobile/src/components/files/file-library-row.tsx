import { ChevronRight, CircleAlert } from "lucide-react-native";
import { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { CheckCircle } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";
import type { LibraryItem } from "@/lib/services/api/file-library/file-library.api";
import { colors, spacing } from "@/lib/theme";
import { dayKeyInZone, formatShortDayKey } from "@/lib/utils/date-time";
import { formatFileSize } from "@/lib/utils/format";
import { itemStatusLabel, libraryPathLabel } from "./file-format";
import { FileThumbnail } from "./file-thumbnail";

interface FileLibraryRowProps {
  item: LibraryItem;
  headers: Record<string, string> | null;
  timeZone: string;
  selectionMode: boolean;
  selected: boolean;
  /** Search results span folders, so they show where each item lives. */
  showPath: boolean;
  onPress: (item: LibraryItem) => void;
  onLongPress: (item: LibraryItem) => void;
}

export const FileLibraryRow = memo(function FileLibraryRow({
  item,
  headers,
  timeZone,
  selectionMode,
  selected,
  showPath,
  onPress,
  onLongPress,
}: FileLibraryRowProps) {
  const deleting = Boolean(item.deletingOperationId);
  const status = itemStatusLabel({
    status: item.status,
    deleting,
    skippedImageCount: item.skippedImageCount,
  });
  const failed = item.status === "failed" && !deleting;
  const pending = deleting || item.status === "processing";
  const meta = [
    item.kind === "folder"
      ? `${item.childCount ?? 0} item`
      : formatFileSize(item.size ?? 0),
    formatShortDayKey(dayKeyInZone(item.createdAt, timeZone)),
  ].join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.kind === "folder" ? "Folder" : "File"} ${item.name}`}
      accessibilityHint={
        selectionMode ? undefined : "Tekan lama untuk tindakan lainnya"
      }
      accessibilityState={selectionMode ? { selected } : undefined}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={350}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
        deleting && styles.deleting,
      ]}
    >
      {selectionMode ? (
        <CheckCircle
          checked={selected}
          disabled={deleting}
          onToggle={() => onPress(item)}
          accessibilityLabel={`Pilih ${item.name}`}
          color={colors.accent}
        />
      ) : null}
      <FileThumbnail
        kind={item.kind}
        id={item.id}
        name={item.name}
        fileKind={item.fileKind}
        headers={headers}
      />
      <View style={styles.texts}>
        <Text variant="body" weight="medium" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {meta}
          {status && status !== "Siap" ? (
            <Text variant="footnote" tone={failed ? "destructive" : "muted"}>
              {` · ${status}`}
            </Text>
          ) : null}
        </Text>
        {showPath ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {libraryPathLabel(item.path)}
          </Text>
        ) : null}
      </View>
      {pending ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : failed ? (
        <CircleAlert size={18} color={colors.destructive} strokeWidth={2} />
      ) : item.kind === "folder" && !selectionMode ? (
        <ChevronRight
          size={18}
          color={colors.mutedForeground}
          strokeWidth={2}
        />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  selected: { backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.pressed },
  deleting: { opacity: 0.6 },
  texts: { flex: 1, gap: 2 },
});
