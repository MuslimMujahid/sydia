import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  FileText,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { colors, radius, shadows, spacing } from "@/lib/theme";
import {
  dismissUploads,
  retryFailedUploads,
  useUploads,
  type UploadEntry,
} from "./upload-store";

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.track} accessibilityRole="progressbar">
      <View
        style={[
          styles.fill,
          { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` },
        ]}
      />
    </View>
  );
}

function EntryState({ entry }: { entry: UploadEntry }) {
  if (entry.state === "uploading")
    return <ActivityIndicator size="small" color={colors.mutedForeground} />;
  if (entry.state === "completed")
    return <CircleCheck size={18} color={colors.foreground} strokeWidth={2} />;
  if (entry.state === "failed")
    return <CircleAlert size={18} color={colors.destructive} strokeWidth={2} />;

  return (
    <Text variant="caption" tone="muted">
      Menunggu
    </Text>
  );
}

/** Upload progress shown on Files screens while a batch runs or needs attention. */
export function UploadTray() {
  const queryClient = useQueryClient();
  const { entries, running } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  if (!entries.length) return null;

  const completed = entries.filter(
    (entry) => entry.state === "completed"
  ).length;
  const failed = entries.filter((entry) => entry.state === "failed").length;
  const current = entries.find((entry) => entry.state === "uploading");
  const title = running
    ? `Mengunggah ${Math.min(completed + failed + 1, entries.length)} dari ${entries.length} file`
    : failed
      ? `${failed} file gagal diunggah`
      : `${completed} file diunggah`;
  const destination = (current ?? entries.at(-1))?.destination;
  const overall =
    (completed + failed + (current?.progress ?? 0)) /
    Math.max(entries.length, 1);

  return (
    <View style={styles.card} accessibilityLabel="Hasil unggahan">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={
            collapsed
              ? "Tampilkan rincian unggahan"
              : "Sembunyikan rincian unggahan"
          }
          onPress={() => setCollapsed((value) => !value)}
          style={styles.toggle}
        >
          {running ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : failed ? (
            <CircleAlert size={20} color={colors.destructive} strokeWidth={2} />
          ) : (
            <CircleCheck size={20} color={colors.foreground} strokeWidth={2} />
          )}
          <View style={styles.titles}>
            <Text
              variant="callout"
              weight="semibold"
              accessibilityLiveRegion="polite"
            >
              {title}
            </Text>
            {destination ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                Ke {destination}
              </Text>
            ) : null}
          </View>
          {collapsed ? (
            <ChevronDown size={18} color={colors.mutedForeground} />
          ) : (
            <ChevronUp size={18} color={colors.mutedForeground} />
          )}
        </Pressable>
        {running ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup hasil unggahan"
            hitSlop={10}
            onPress={dismissUploads}
            style={styles.close}
          >
            <X size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {running ? <ProgressBar value={overall} /> : null}
      {collapsed ? null : (
        <View style={styles.list}>
          {entries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <FileText
                size={16}
                color={colors.mutedForeground}
                strokeWidth={1.75}
              />
              <View style={styles.entryTexts}>
                <Text variant="footnote" weight="medium" numberOfLines={1}>
                  {entry.name}
                </Text>
                {entry.state === "failed" && entry.error ? (
                  <Text variant="caption" tone="destructive">
                    {entry.error}
                  </Text>
                ) : null}
                {entry.state === "uploading" ? (
                  <ProgressBar value={entry.progress} />
                ) : null}
              </View>
              <EntryState entry={entry} />
            </View>
          ))}
          {!running && failed ? (
            <Button
              label="Coba ulang unggahan gagal"
              variant="outline"
              size="sm"
              onPress={() => retryFailedUploads(queryClient)}
            />
          ) : null}
        </View>
      )}
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  titles: { flex: 1, gap: 2 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  list: { gap: spacing.md },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  entryTexts: { flex: 1, gap: spacing.xs },
});
