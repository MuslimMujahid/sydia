import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Stack, useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from "lucide-react-native";
import { useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { safeFileName } from "@/components/files/file-format";
import { NamePrompt } from "@/components/files/name-prompt";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { FormScroll } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { API_URL } from "@/lib/env";
import { ApiClientError } from "@/lib/services/api/api";
import { notesKeys } from "@/lib/services/api/notes/notes.api";
import {
  exportRecordNote,
  getRecordSavedView,
  mutateRecordNote,
  type RecordChange,
  type RecordColumn,
  type RecordMetadata,
  type RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";
import { colors, spacing } from "@/lib/theme";
import {
  RecordColumnForm,
  RecordContextForm,
  RecordPasteForm,
  RecordRowForm,
} from "./record-forms";
import { columnTypeLabel, recordCellText } from "./record-model";
import { copyWorkspaceNoteLink } from "./note-share";
import { useNoteLease } from "./use-note-lease";
import { validNoteRef } from "./workspace-model";

type Form = { baseline: RecordMetadata } & (
  | { type: "row"; row: RecordRow | null; beforeId?: string; afterId?: string }
  | { type: "column"; column: RecordColumn | null }
  | { type: "title" }
  | { type: "context" }
  | { type: "paste" }
);

export function RecordDetail({ id }: { id: string }) {
  const lease = useNoteLease(`custom:${id}`);
  const router = useRouter();
  const toast = useToast();
  const sheet = useActionSheet();
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string>();
  const [undo, setUndo] = useState<string>();
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const query = useQuery({
    queryKey: ["records", id, "view", offset],
    queryFn: () => getRecordSavedView(id, offset),
  });
  const write = useMutation({
    mutationFn: async ({
      change,
      revision,
    }: {
      change: RecordChange;
      revision: number;
    }) => {
      const fingerprint = JSON.stringify({ revision, change });
      const key =
        attempt.current?.fingerprint === fingerprint
          ? attempt.current.key
          : Crypto.randomUUID();
      attempt.current = { fingerprint, key };
      const sessionId = await lease.ensure();
      const result = await mutateRecordNote(id, {
        change,
        revision,
        sessionId,
        requestKey: key,
      });
      attempt.current = null;
      return result;
    },
    meta: { invalidateQueries: [["records", id], notesKeys.workspace] },
  });
  const exportCsv = useMutation({ mutationFn: () => shareRecordCsv(id) });

  async function save(revision: number, change: RecordChange) {
    setError(undefined);
    try {
      const result = await write.mutateAsync({ revision, change });
      setUndo(result.undoKey);
      setForm(null);
    } catch (caught) {
      if (
        caught instanceof ApiClientError &&
        caught.details?.reason === "REVISION"
      ) {
        throw new Error(
          "Tabel berubah. Tutup formulir dan lihat data terbaru sebelum mengulangi perubahan."
        );
      }
      throw caught;
    }
  }

  function run(revision: number, change: RecordChange) {
    void save(revision, change).catch((caught: unknown) => {
      console.warn("Record action failed", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error ? caught.message : "Tabel belum dapat disimpan."
      );
    });
  }

  function sort(meta: RecordMetadata, column: RecordColumn) {
    sheet({
      title: column.name,
      options: [
        {
          label: "Urutkan menaik",
          onPress: () =>
            run(meta.revision, {
              action: "sort_rows",
              columnId: column.id,
              direction: "asc",
            }),
        },
        {
          label: "Urutkan menurun",
          onPress: () =>
            run(meta.revision, {
              action: "sort_rows",
              columnId: column.id,
              direction: "desc",
            }),
        },
      ],
    });
  }

  function columnMenu(meta: RecordMetadata, column: RecordColumn) {
    sheet({
      title: column.name,
      options: [
        {
          label: "Ubah kolom",
          icon: Pencil,
          onPress: () => setForm({ type: "column", column, baseline: meta }),
        },
        { label: "Urutkan baris", onPress: () => sort(meta, column) },
        {
          label: "Hapus kolom",
          icon: Trash2,
          destructive: true,
          onPress: () =>
            Alert.alert(
              "Hapus kolom?",
              `Semua nilai di kolom “${column.name}” akan dihapus.`,
              [
                { text: "Batal", style: "cancel" },
                {
                  text: "Hapus",
                  style: "destructive",
                  onPress: () =>
                    run(meta.revision, {
                      action: "schema",
                      columns: meta.columns.filter(
                        (other) => other.id !== column.id
                      ),
                      confirmed: true,
                    }),
                },
              ]
            ),
        },
      ],
    });
  }

  function rowMenu(meta: RecordMetadata, row: RecordRow) {
    const sources = row.sources.filter((source) => validNoteRef(source.ref));
    sheet({
      title: "Pilihan baris",
      options: [
        {
          label: "Ubah baris",
          icon: Pencil,
          onPress: () => setForm({ type: "row", row, baseline: meta }),
        },
        {
          label: "Sisipkan baris di atas",
          icon: Plus,
          onPress: () =>
            setForm({
              type: "row",
              row: null,
              beforeId: row.id,
              baseline: meta,
            }),
        },
        {
          label: "Sisipkan baris di bawah",
          icon: Plus,
          onPress: () =>
            setForm({
              type: "row",
              row: null,
              afterId: row.id,
              baseline: meta,
            }),
        },
        ...sources.map(({ ref }, index) => ({
          label:
            sources.length === 1
              ? "Buka catatan sumber"
              : `Buka catatan sumber ${index + 1}`,
          onPress: () =>
            router.push({ pathname: "/note/[ref]", params: { ref } }),
        })),
        {
          label: "Hapus baris",
          icon: Trash2,
          destructive: true,
          onPress: () =>
            Alert.alert(
              "Hapus baris?",
              "Semua nilai dalam baris ini akan dihapus.",
              [
                { text: "Batal", style: "cancel" },
                {
                  text: "Hapus",
                  style: "destructive",
                  onPress: () =>
                    run(meta.revision, {
                      action: "delete_rows",
                      ids: [row.id],
                    }),
                },
              ]
            ),
        },
      ],
    });
  }

  if (query.isPending) return <LoadingState label="Memuat tabel…" />;
  if (!query.data && query.isError)
    return (
      <ErrorState
        title="Tabel tidak dapat dibuka"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const { metadata: meta, content } = query.data;
  const editing = form !== null;

  function options() {
    sheet({
      title: meta.title,
      options: [
        {
          label: "Ubah nama",
          icon: Pencil,
          onPress: () => setForm({ type: "title", baseline: meta }),
        },
        {
          label: "Ubah deskripsi",
          onPress: () => setForm({ type: "context", baseline: meta }),
        },
        ...(meta.columns.length
          ? [
              {
                label: "Tempel baris",
                onPress: () => setForm({ type: "paste", baseline: meta }),
              },
            ]
          : []),
        {
          label: "Salin tautan",
          onPress: () => {
            void copyWorkspaceNoteLink(`custom:${id}`).then(
              () => toast("Tautan tabel disalin"),
              (caught: unknown) => {
                console.warn("Could not copy record link", {
                  name: caught instanceof Error ? caught.name : "UnknownError",
                });
                toast("Tautan tidak dapat disalin.", { tone: "error" });
              }
            );
          },
        },
        {
          label: "Bagikan CSV",
          icon: Download,
          onPress: () =>
            exportCsv.mutate(undefined, {
              onError: (caught) => {
                console.warn("Record CSV sharing failed", {
                  name: caught.name,
                });
                toast(caught.message, { tone: "error" });
              },
            }),
        },
      ],
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Tabel",
          headerRight: () => (
            <IconButton
              size={44}
              icon={Ellipsis}
              accessibilityLabel="Pilihan tabel"
              disabled={write.isPending || exportCsv.isPending || editing}
              onPress={options}
            />
          ),
        }}
      />
      <FormScroll>
        <View style={styles.title}>
          <Text variant="title" accessibilityRole="header">
            {meta.title}
          </Text>
          {meta.description ? (
            <Text tone="muted">{meta.description}</Text>
          ) : null}
        </View>
        <InlineError message={error || lease.error || query.error?.message} />
        {undo ? (
          <Button
            label="Urungkan perubahan kolom"
            variant="outline"
            disabled={write.isPending}
            onPress={() =>
              run(meta.revision, { action: "restore_columns", undoKey: undo })
            }
          />
        ) : null}
        <ListSection title="Kolom">
          {meta.columns.map((column) => (
            <ListRow
              key={column.id}
              title={column.name}
              subtitle={`${columnTypeLabel(column.type)}${column.unit ? ` · ${column.unit}` : ""}`}
              value={
                meta.mismatched[column.id]
                  ? `${meta.mismatched[column.id]} tidak cocok`
                  : undefined
              }
              disabled={write.isPending}
              onPress={() => columnMenu(meta, column)}
            />
          ))}
          <ListRow
            icon={Plus}
            title="Tambah kolom"
            disabled={write.isPending || meta.columns.length >= 64}
            onPress={() =>
              setForm({ type: "column", column: null, baseline: meta })
            }
          />
        </ListSection>
        <View style={styles.rowsHeader}>
          <Text variant="headline" accessibilityRole="header">
            Baris
          </Text>
          <Button
            icon={Plus}
            label="Tambah baris"
            size="sm"
            variant="outline"
            disabled={!meta.columns.length || write.isPending}
            onPress={() => setForm({ type: "row", row: null, baseline: meta })}
          />
        </View>
        {content.rows.length ? (
          <ListSection>
            {content.rows.map((row, index) => {
              const values = meta.columns
                .map((column) => recordCellText(row.cells[column.id]))
                .filter(Boolean);
              return (
                <ListRow
                  key={row.id}
                  icon={Table2}
                  title={
                    values[0] || `Baris ${content.page.offset + index + 1}`
                  }
                  subtitle={values.slice(1).join(" · ")}
                  disabled={write.isPending}
                  onPress={() => setForm({ type: "row", row, baseline: meta })}
                  onLongPress={() => rowMenu(meta, row)}
                  trailing={
                    <IconButton
                      size={44}
                      icon={Ellipsis}
                      accessibilityLabel={`Pilihan baris ${content.page.offset + index + 1}`}
                      onPress={() => rowMenu(meta, row)}
                    />
                  }
                  chevron={false}
                />
              );
            })}
          </ListSection>
        ) : (
          <EmptyState
            title="Belum ada baris"
            message={
              meta.columns.length
                ? undefined
                : "Tambahkan kolom untuk mulai mengisi tabel."
            }
          />
        )}
        {content.page.previous || content.page.next ? (
          <View style={styles.pager}>
            <IconButton
              size={44}
              icon={ChevronLeft}
              accessibilityLabel="Baris sebelumnya"
              disabled={!content.page.previous}
              onPress={() =>
                setOffset(Math.max(0, content.page.offset - content.page.limit))
              }
            />
            <Text variant="footnote" tone="muted">
              {content.page.offset + 1}–
              {content.page.offset + content.rows.length} dari{" "}
              {content.rowCount}
            </Text>
            <IconButton
              size={44}
              icon={ChevronRight}
              accessibilityLabel="Baris selanjutnya"
              disabled={!content.page.next}
              onPress={() =>
                setOffset(content.page.offset + content.page.limit)
              }
            />
          </View>
        ) : null}
      </FormScroll>
      {form?.type === "row" ? (
        <RecordRowForm
          row={form.row}
          columns={form.baseline.columns}
          onClose={() => setForm(null)}
          onSubmit={(values) =>
            save(
              form.baseline.revision,
              form.row
                ? { action: "update_rows", rows: [{ id: form.row.id, values }] }
                : {
                    action: "add_rows",
                    beforeId: form.beforeId,
                    afterId: form.afterId,
                    rows: [{ values }],
                  }
            )
          }
        />
      ) : null}
      {form?.type === "column" ? (
        <RecordColumnForm
          column={form.column}
          onClose={() => setForm(null)}
          onSubmit={(column) =>
            save(form.baseline.revision, {
              action: "schema",
              columns: form.column
                ? form.baseline.columns.map((item) =>
                    item.id === column.id ? column : item
                  )
                : [...form.baseline.columns, column],
            })
          }
        />
      ) : null}
      {form?.type === "paste" ? (
        <RecordPasteForm
          columns={form.baseline.columns}
          onClose={() => setForm(null)}
          onSubmit={(additions) =>
            save(form.baseline.revision, {
              action: "paste_rows",
              updates: [],
              additions,
            })
          }
        />
      ) : null}
      {form?.type === "title" ? (
        <NamePrompt
          visible
          title="Ubah nama tabel"
          initialValue={form.baseline.title}
          label="Nama"
          maxLength={240}
          submitLabel="Simpan"
          onClose={() => setForm(null)}
          onSubmit={(title) =>
            save(form.baseline.revision, { action: "title", title })
          }
        />
      ) : null}
      {form?.type === "context" ? (
        <RecordContextForm
          initial={form.baseline.description}
          onClose={() => setForm(null)}
          onSubmit={(description) =>
            save(form.baseline.revision, { action: "context", description })
          }
        />
      ) : null}
    </>
  );
}

async function shareRecordCsv(id: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Berbagi file tidak tersedia di perangkat ini.");
  const link = await exportRecordNote(id);
  const signedUrl = new URL(link.url);
  // The public URL can be localhost in development, which is unreachable from a phone.
  const url = new URL(`${signedUrl.pathname}${signedUrl.search}`, API_URL);
  const directory = new Directory(Paths.cache, "record-exports", id);
  directory.create({ intermediates: true, idempotent: true });
  const target = new File(directory, safeFileName(link.filename));
  const file = await File.downloadFileAsync(url.toString(), target, {
    idempotent: true,
  });
  await Sharing.shareAsync(file.uri, {
    dialogTitle: "Bagikan tabel",
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}

const styles = StyleSheet.create({
  title: { gap: spacing.xs },
  rowsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
});
