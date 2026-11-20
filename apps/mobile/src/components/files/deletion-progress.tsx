import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileText, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { DeletionOperation } from "@/lib/services/api/file-library/file-library.api";
import {
  libraryDeletionFailuresOptions,
  libraryDeletionOptions,
  libraryQueryKeys,
  usePreviewLibraryDeletionRetry,
  useRetryLibraryDeletion,
} from "@/lib/services/api/file-library/file-library.queries";
import { colors, radius, shadows, spacing } from "@/lib/theme";
import { deletedSummary } from "./file-format";
import { ProgressBar } from "./upload-tray";

const COMPLETED_NOTICE_MS = 5_000;

function RunningOrDone({
  operation,
  onDismiss,
}: {
  operation: DeletionOperation;
  onDismiss: () => void;
}) {
  const running = operation.status === "running";
  const done = operation.files.completed + operation.folders.completed;
  const total = operation.files.total + operation.folders.total;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        {running ? (
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : (
          <CircleCheck size={20} color={colors.foreground} strokeWidth={2} />
        )}
        <Text variant="callout" weight="semibold" style={styles.flex}>
          {running ? `Menghapus ${total} item…` : deletedSummary(operation)}
        </Text>
        {running ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            hitSlop={10}
            onPress={onDismiss}
          >
            <X size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {running ? <ProgressBar value={done / Math.max(total, 1)} /> : null}
    </View>
  );
}

/** A deletion that finished with failures: details, retry, and re-check. */
function PartialOperation({ operation }: { operation: DeletionOperation }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const failures = useQuery({
    ...libraryDeletionFailuresOptions(operation.id, offset),
    enabled: open,
  });
  const retry = useRetryLibraryDeletion();
  const preview = usePreviewLibraryDeletionRetry();

  function checkRemaining() {
    preview.mutate(operation.id, {
      onSuccess: ({ data }) =>
        Alert.alert(
          "Konfirmasi item tersisa",
          `Isi pilihan mungkin berubah. ${data.files.total} file dan ${data.folders.total} folder akan dihapus permanen, termasuk semua isi folder tersisa. Tindakan ini tidak dapat dibatalkan.`,
          [
            { text: "Batal", style: "cancel" },
            {
              text: "Hapus permanen",
              style: "destructive",
              onPress: () =>
                retry.mutate({ id: operation.id, previewId: data.id }),
            },
          ]
        ),
    });
  }

  const failedCount = operation.files.failed + operation.folders.failed;
  const error = retry.error ?? preview.error;
  const failurePage = failures.data;

  return (
    <View style={[styles.card, styles.partial]}>
      <View style={styles.row}>
        <CircleAlert size={20} color={colors.destructive} strokeWidth={2} />
        <View style={styles.flex}>
          <Text variant="callout" weight="semibold">
            Penghapusan belum selesai
          </Text>
          <Text variant="footnote" tone="muted">
            {`${operation.files.completed} file dihapus · ${failedCount} gagal`}
            {operation.folders.retained
              ? ` · ${operation.folders.retained} folder dipertahankan karena belum kosong`
              : ""}
          </Text>
        </View>
      </View>
      {open ? (
        <View style={styles.failures}>
          {failures.isPending ? (
            <ActivityIndicator color={colors.mutedForeground} />
          ) : null}
          {failures.error ? (
            <Text variant="footnote" tone="destructive">
              {failures.error.message}
            </Text>
          ) : null}
          {failurePage?.data.map((failure) => (
            <View
              key={`${failure.kind}:${failure.itemId}`}
              style={styles.failure}
            >
              <FileText size={16} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text variant="footnote" weight="medium">
                  {failure.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {failure.error}
                </Text>
              </View>
            </View>
          ))}
          {failurePage && failurePage.pagination.total > 10 ? (
            <View style={styles.actions}>
              <Button
                label="Sebelumnya"
                variant="ghost"
                size="sm"
                disabled={!offset}
                onPress={() => setOffset(offset - 10)}
              />
              <Button
                label="Berikutnya"
                variant="ghost"
                size="sm"
                disabled={offset + 10 >= failurePage.pagination.total}
                onPress={() => setOffset(offset + 10)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {error ? (
        <View style={styles.failures}>
          <Text variant="footnote" tone="destructive">
            {error.message}
          </Text>
          <Button
            label="Periksa item tersisa"
            variant="ghost"
            size="sm"
            loading={preview.isPending}
            onPress={checkRemaining}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={open ? "Tutup rincian" : "Lihat rincian"}
          variant="ghost"
          size="sm"
          onPress={() => setOpen((value) => !value)}
        />
        <Button
          label="Coba ulang item gagal"
          variant="secondary"
          size="sm"
          loading={retry.isPending}
          onPress={() => retry.mutate({ id: operation.id })}
        />
      </View>
    </View>
  );
}

/**
 * Durable deletion activity, ported from the web's file-deletion-progress:
 * running operations show progress, finished ones a brief confirmation, and
 * partial ones stay until retried.
 */
export function DeletionProgress() {
  const client = useQueryClient();
  const query = useQuery(libraryDeletionOptions(0));
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const completedIds = (query.data?.data ?? [])
    .filter((row) => row.status === "completed" && !dismissed.has(row.id))
    .map((row) => row.id)
    .join(",");

  // A finished deletion only needs a brief confirmation.
  useEffect(() => {
    if (!completedIds) return;
    const timer = setTimeout(() => {
      setDismissed((current) => {
        const next = new Set(current);
        for (const id of completedIds.split(",")) next.add(id);

        return next;
      });
    }, COMPLETED_NOTICE_MS);

    return () => clearTimeout(timer);
  }, [completedIds]);

  // Confirmed deletes change listings; refresh them as progress arrives.
  const progressKey = JSON.stringify(
    query.data?.data.map((row) => [
      row.id,
      row.status,
      row.files.completed,
      row.folders.completed,
    ])
  );

  useEffect(() => {
    if (progressKey)
      void client.invalidateQueries({
        predicate: (candidate) =>
          candidate.queryKey[0] === libraryQueryKeys.all[0] &&
          candidate.queryKey[1] !== "deletions" &&
          candidate.queryKey[1] !== "failures",
      });
  }, [progressKey, client]);

  const operations =
    query.data?.data.filter(
      (row) => row.status !== "preview" && !dismissed.has(row.id)
    ) ?? [];

  if (query.error)
    return (
      <View style={[styles.card, styles.row]}>
        <Text variant="footnote" tone="destructive" style={styles.flex}>
          {query.error.message}
        </Text>
        <Button
          label="Coba lagi"
          variant="ghost"
          size="sm"
          onPress={() => void query.refetch()}
        />
      </View>
    );

  if (!operations.length) return null;

  return (
    <View style={styles.stack} accessibilityLabel="Aktivitas penghapusan">
      {operations.map((operation) =>
        operation.status === "partial" ? (
          <PartialOperation key={operation.id} operation={operation} />
        ) : (
          <RunningOrDone
            key={operation.id}
            operation={operation}
            onDismiss={() =>
              setDismissed((current) => new Set(current).add(operation.id))
            }
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: shadows.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  partial: { borderColor: "rgba(220, 38, 38, 0.25)" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  failures: { gap: spacing.sm },
  failure: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
});
