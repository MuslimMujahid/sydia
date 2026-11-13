import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { createWorkspaceItem } from "@/lib/services/api/notes/notes.api";
import type { NoteRecovery } from "./note-recovery-store";

interface NoteRecoveryPanelProps {
  recovery: NoteRecovery;
  onSaved: (ref: string) => Promise<void>;
  onDiscard: () => void;
}

export function NoteRecoveryPanel({
  recovery,
  onSaved,
  onDiscard,
}: NoteRecoveryPanelProps) {
  const copy = useMutation({
    mutationFn: async () => {
      try {
        await navigator.clipboard.writeText(recovery.text);
      } catch (error) {
        console.warn("Recovery draft could not be copied.", error);
        throw new Error(
          "Draf belum dapat disalin. Pilih teks draf untuk menyalinnya secara manual."
        );
      }
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const item = await createWorkspaceItem({
        kind: "note",
        parentId: null,
        title: recovery.draft.title,
        content: recovery.draft.content,
        requestKey: recovery.requestKey,
      });

      await onSaved(`custom:${item.id}`);
    },
  });

  return (
    <section
      aria-label="Pemulihan draf"
      className="mx-auto w-full max-w-[824px] space-y-5 p-6 sm:p-12"
    >
      <div role="status" className="space-y-2">
        <h2 className="text-xl font-semibold">Catatan ini sudah dihapus</h2>
        <p className="text-sm text-ink-muted">
          Perubahan Anda belum tersimpan. Draf tetap tersedia saat Anda membuka
          catatan lain.
        </p>
      </div>
      <h3 className="break-words font-semibold">{recovery.draft.title}</h3>
      {recovery.format === "record" ? (
        <p className="text-sm text-ink-muted">
          Draf tabel berisi baris yang sedang dibuka dan perubahan lokal. Simpan
          sebagai catatan teks; pulihkan tabel lengkap dari Sampah.
        </p>
      ) : null}
      <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words font-sans text-base leading-relaxed">
        {recovery.text}
      </pre>
      {save.error || copy.error ? (
        <p role="alert" className="text-sm text-destructive">
          {(save.error ?? copy.error)?.message}
        </p>
      ) : null}
      {copy.isSuccess ? (
        <p role="status" className="text-sm">
          Draf disalin.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Simpan sebagai catatan baru
        </Button>
        <Button
          variant="dark-outline"
          disabled={save.isPending || copy.isPending}
          onClick={() => copy.mutate()}
        >
          Salin draf
        </Button>
        <Button variant="ghost" disabled={save.isPending} onClick={onDiscard}>
          Buang draf
        </Button>
      </div>
    </section>
  );
}
