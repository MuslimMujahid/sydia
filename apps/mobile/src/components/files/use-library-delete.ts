import { useState } from "react";
import { Alert } from "react-native";
import { useToast } from "@/components/ui/toast";
import {
  libraryRef,
  previewLibraryDeletion,
  type LibraryItem,
} from "@/lib/services/api/file-library/file-library.api";
import { useStartLibraryDeletion } from "@/lib/services/api/file-library/file-library.queries";
import { createId } from "@/lib/utils/id";
import { deletionCountLabel } from "./file-format";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Permanent deletion as on the web: the server previews the recursive counts,
 * the user confirms them, then a durable deletion operation starts. One
 * idempotency key covers the whole attempt, so a retried start is safe.
 */
export function useLibraryDelete() {
  const toast = useToast();
  const start = useStartLibraryDeletion();
  const [checking, setChecking] = useState(false);

  async function begin(
    previewId: string,
    idempotencyKey: string,
    onStarted?: () => void
  ) {
    try {
      await start.mutateAsync({ previewId, idempotencyKey });
      toast("Penghapusan dimulai. Progres tersimpan.");
      onStarted?.();
    } catch (error) {
      Alert.alert(
        "Penghapusan belum dikonfirmasi",
        messageOf(error, "Periksa status penghapusan sebelum mencoba lagi."),
        [
          { text: "Tutup", style: "cancel" },
          {
            text: "Coba lagi",
            onPress: () => void begin(previewId, idempotencyKey, onStarted),
          },
        ]
      );
    }
  }

  async function confirmDelete(items: LibraryItem[], onStarted?: () => void) {
    const targets = items.filter((item) => !item.deletingOperationId);
    if (!targets.length || checking) return;
    setChecking(true);

    let preview;
    try {
      preview = (await previewLibraryDeletion(targets.map(libraryRef))).data;
    } catch (error) {
      Alert.alert(
        "Pilihan tidak dapat diperiksa",
        messageOf(error, "Pilihan hapus tidak dapat diperiksa."),
        [
          { text: "Tutup", style: "cancel" },
          {
            text: "Periksa lagi",
            onPress: () => void confirmDelete(targets, onStarted),
          },
        ]
      );

      return;
    } finally {
      setChecking(false);
    }

    const idempotencyKey = createId();
    const single = targets.length === 1 ? targets[0] : undefined;
    const subject =
      single && !preview.folders.total
        ? "File ini"
        : deletionCountLabel(preview.files.total, preview.folders.total);

    Alert.alert(
      single ? `Hapus “${single.name}”?` : `Hapus ${targets.length} item?`,
      `${subject} akan dihapus permanen, termasuk semua isi folder. Tindakan ini tidak dapat dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus permanen",
          style: "destructive",
          onPress: () => void begin(preview.id, idempotencyKey, onStarted),
        },
      ]
    );
  }

  return { confirmDelete, checking: checking || start.isPending };
}
