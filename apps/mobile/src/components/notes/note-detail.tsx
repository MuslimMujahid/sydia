import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, usePreventRemove, useRouter } from "expo-router";
import { Ellipsis, Link2, Unlink } from "lucide-react-native";
import { useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NamePrompt } from "@/components/files/name-prompt";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { HeaderTextButton } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { readableText } from "@/lib/editor/document";
import type { EditorLinkQuery, EditorLinkRange } from "@/lib/editor/protocol";
import { useProfile } from "@/lib/profile";
import { ApiClientError } from "@/lib/services/api/api";
import { dailyNoteQueryKeys } from "@/lib/services/api/daily-notes/daily-notes.queries";
import {
  getNoteBacklinks,
  getWorkspaceNote,
  notesKeys,
  saveWorkspaceNote,
  workspaceQueryOptions,
  type NoteDraft,
  type NoteEntry,
  type WorkspaceNote,
} from "@/lib/services/api/notes/notes.api";
import { colors, spacing } from "@/lib/theme";
import { formatDayInZone } from "@/lib/utils/date-time";
import { NativeNoteEditor, type NoteEditorBridge } from "./native-note-editor";
import { copyWorkspaceNoteLink } from "./note-share";
import { useNoteLease } from "./use-note-lease";
import { validNoteRef } from "./workspace-model";

const emptyEntries: NoteEntry[] = [];
const emptyRefs: string[] = [];

type PickNote = { range: EditorLinkRange | null; query: string };
type NotePanel =
  | { type: "link"; selection: PickNote }
  | { type: "backlinks" }
  | { type: "conflict"; latest: WorkspaceNote };

function noteDraft(note: WorkspaceNote): NoteDraft {
  return { title: note.title, content: note.content };
}

export function NoteDetail({ note }: { note: WorkspaceNote }) {
  const router = useRouter();
  const profile = useProfile();
  const client = useQueryClient();
  const sheet = useActionSheet();
  const toast = useToast();
  const workspace = useQuery({
    ...workspaceQueryOptions(),
    select: (result) => ({
      entries: result.notes,
      refs: result.notes.map((entry) => entry.ref),
    }),
  });
  const lease = useNoteLease(note.ref);
  const [base, setBase] = useState(note);
  const [generation, setGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [editorFailure, setEditorFailure] = useState<string>();
  const [panel, setPanel] = useState<NotePanel | null>(null);
  const [webLink, setWebLink] = useState<{ url: string | null } | null>(null);
  const [draftView, setDraftView] = useState(() => noteDraft(note));
  const draft = useRef<NoteDraft>(draftView);
  const editor = useRef<NoteEditorBridge>(null);
  const attempt = useRef(false);
  const daily = note.ref.startsWith("daily:");
  const date = daily ? note.ref.slice(6) : "";
  const title = daily
    ? formatDayInZone(date, profile.timezone, profile.locale)
    : "Catatan";
  const remoteChanged = note.version !== base.version;

  usePreventRemove(dirty || saving, ({ repeat }) => {
    if (attempt.current) return;
    Alert.alert(
      "Keluar tanpa menyimpan?",
      "Perubahan pada catatan ini akan hilang.",
      [
        { text: "Lanjut menulis", style: "cancel" },
        {
          text: "Buang perubahan",
          style: "destructive",
          onPress: () => {
            setDirty(false);
            repeat();
          },
        },
      ]
    );
  });

  function openNote(ref: string) {
    if (ref !== note.ref && validNoteRef(ref))
      router.push({ pathname: "/note/[ref]", params: { ref } });
  }

  function showLinkPicker(query?: EditorLinkQuery) {
    Keyboard.dismiss();
    setPanel({
      type: "link",
      selection: {
        range: query ? { kind: "range", from: query.from, to: query.to } : null,
        query: query?.query ?? "",
      },
    });
  }

  function linkTap(target: string | null, label: string, position: number) {
    const edit = {
      label: "Ubah tujuan tautan",
      onPress: () =>
        setPanel({
          type: "link",
          selection: { range: { kind: "node", position }, query: label },
        }),
    };
    const options =
      target && validNoteRef(target)
        ? [{ label: "Buka catatan", onPress: () => openNote(target) }, edit]
        : [edit];
    sheet({ title: label, options });
  }

  function openWebLink(url: string) {
    if (!/^https?:\/\//i.test(url)) return;
    void Linking.openURL(url).catch((caught: unknown) => {
      console.warn("Could not open note external link", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      toast("Tautan tidak dapat dibuka.", { tone: "error" });
    });
  }

  function replaceDraft(next: WorkspaceNote) {
    draft.current = noteDraft(next);
    setDraftView(draft.current);
    setBase(next);
    setDirty(false);
    setError(undefined);
    setEditorFailure(undefined);
    setGeneration((current) => current + 1);
  }

  async function save(comparison?: WorkspaceNote) {
    const bridge = editor.current;
    if (attempt.current || !bridge) return;
    attempt.current = true;
    setSaving(true);
    setError(undefined);

    try {
      await bridge.flush();
      const captured = draft.current;
      if (!daily && !captured.title.trim())
        throw new Error("Isi judul catatan sebelum menyimpan.");
      await lease.ensure();
      let expected = base;
      if (comparison) {
        const latest = await getWorkspaceNote(note.ref);
        if (latest.version !== comparison.version) {
          setPanel({ type: "conflict", latest });
          setError(
            "Catatan kembali berubah. Periksa versi terbaru sebelum menyimpan draf."
          );
          return;
        }
        expected = latest;
      }
      const updated = await saveWorkspaceNote(expected, captured);
      client.setQueryData(notesKeys.detail(note.ref), updated);
      void client.invalidateQueries({ queryKey: notesKeys.workspace });
      if (daily)
        void client.invalidateQueries({ queryKey: dailyNoteQueryKeys.all });
      setBase(updated);
      setDirty(draft.current !== captured);
      setPanel(null);
      toast("Catatan disimpan");
    } catch (caught) {
      console.warn("Note save failed; draft retained", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      if (
        caught instanceof ApiClientError &&
        caught.status === 409 &&
        caught.details?.reason === "REVISION"
      ) {
        try {
          setPanel({
            type: "conflict",
            latest: await getWorkspaceNote(note.ref),
          });
        } catch (readFailure) {
          console.warn("Conflict version could not be loaded", {
            name:
              readFailure instanceof Error ? readFailure.name : "UnknownError",
          });
          setError(
            "Versi terbaru belum dapat dimuat. Draf Anda tetap tersedia."
          );
        }
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "Catatan belum dapat disimpan."
        );
      }
    } finally {
      attempt.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.fill}>
      <Stack.Screen
        options={{
          title: daily ? "Catatan harian" : "Catatan",
          headerRight: () => (
            <View style={styles.header}>
              <HeaderTextButton
                label="Simpan"
                emphasis
                loading={saving}
                disabled={!dirty || !!editorFailure}
                onPress={() => void save()}
              />
              <IconButton
                size={44}
                icon={Ellipsis}
                accessibilityLabel="Pilihan catatan"
                onPress={() =>
                  sheet({
                    title: base.title,
                    options: [
                      {
                        label: "Tautan balik",
                        icon: Link2,
                        onPress: () => setPanel({ type: "backlinks" }),
                      },
                      {
                        label: "Salin tautan",
                        onPress: () => {
                          void copyWorkspaceNoteLink(note.ref).then(
                            () => toast("Tautan catatan disalin"),
                            (caught: unknown) => {
                              console.warn("Could not copy note link", {
                                name:
                                  caught instanceof Error
                                    ? caught.name
                                    : "UnknownError",
                              });
                              toast("Tautan tidak dapat disalin.", {
                                tone: "error",
                              });
                            }
                          );
                        },
                      },
                      ...(remoteChanged
                        ? [
                            {
                              label: "Lihat versi terbaru",
                              onPress: () =>
                                setPanel({ type: "conflict", latest: note }),
                            },
                          ]
                        : []),
                    ],
                  })
                }
              />
            </View>
          ),
        }}
      />
      {remoteChanged ? (
        <View style={styles.message}>
          <Button
            size="sm"
            variant="ghost"
            label="Lihat versi terbaru"
            onPress={() => setPanel({ type: "conflict", latest: note })}
          />
        </View>
      ) : null}
      {error || lease.error ? (
        <View style={styles.message}>
          <InlineError message={error || lease.error} />
        </View>
      ) : null}
      {editorFailure ? (
        <ScrollView contentContainerStyle={styles.content}>
          <InlineError message={editorFailure} />
          <Text variant="title">{draftView.title}</Text>
          <Text selectable>{readableText(draftView.content)}</Text>
          <Button
            label="Buka ulang editor"
            variant="outline"
            onPress={() => {
              setEditorFailure(undefined);
              setGeneration((current) => current + 1);
            }}
          />
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
        >
          <NativeNoteEditor
            key={generation}
            ref={editor}
            editable={!saving}
            init={{
              type: "init",
              content: draftView.content,
              title: daily ? null : draftView.title,
              titlePlaceholder: "Judul",
              heading: daily ? { title } : null,
              placeholder: "Mulai menulis…",
              editable: true,
              knownRefs: [],
              focus: null,
            }}
            knownRefs={workspace.data?.refs ?? emptyRefs}
            onDirty={() => setDirty(true)}
            onContent={(content) => {
              draft.current = { ...draft.current, content };
              setDraftView(draft.current);
              setDirty(true);
            }}
            onTitle={(title) => {
              draft.current = { ...draft.current, title };
              setDraftView(draft.current);
              setDirty(true);
            }}
            onError={setEditorFailure}
            onLink={linkTap}
            onExternalLink={openWebLink}
            onPickLink={showLinkPicker}
            onSetWebLink={(url) => {
              const options = [
                {
                  label: url ? "Ubah tautan web" : "Tambahkan tautan web",
                  icon: Link2,
                  onPress: () => setWebLink({ url }),
                },
              ];
              if (url)
                options.push(
                  {
                    label: "Buka tautan",
                    icon: Link2,
                    onPress: () => openWebLink(url),
                  },
                  {
                    label: "Lepas tautan",
                    icon: Unlink,
                    onPress: () =>
                      editor.current?.send({ type: "setLink", href: null }),
                  }
                );
              sheet({ options });
            }}
          />
        </KeyboardAvoidingView>
      )}
      {panel?.type === "link" ? (
        <NotePicker
          selection={panel.selection}
          entries={workspace.data?.entries ?? emptyEntries}
          loading={workspace.isPending}
          error={workspace.error?.message}
          onClose={() => setPanel(null)}
          onPick={(entry) => {
            editor.current?.send({
              type: "insertNoteLink",
              target: entry.ref,
              label: entry.title,
              range: panel.selection.range,
            });
            setPanel(null);
          }}
        />
      ) : null}
      {panel?.type === "backlinks" ? (
        <Backlinks
          refId={note.ref}
          onClose={() => setPanel(null)}
          onOpen={(ref) => {
            setPanel(null);
            openNote(ref);
          }}
        />
      ) : null}
      {panel?.type === "conflict" ? (
        <Panel title="Bandingkan versi" onClose={() => setPanel(null)}>
          {error ? <InlineError message={error} /> : null}
          {dirty ? <Version label="Draf Anda" note={draftView} /> : null}
          <Version label="Versi tersimpan" note={panel.latest} />
          <Button
            label="Gunakan versi tersimpan"
            variant={dirty ? "outline" : "primary"}
            disabled={saving}
            onPress={() => {
              client.setQueryData(notesKeys.detail(note.ref), panel.latest);
              replaceDraft(panel.latest);
              setPanel(null);
            }}
          />
          {dirty && !editorFailure ? (
            <Button
              label="Simpan draf saya"
              loading={saving}
              onPress={() => void save(panel.latest)}
            />
          ) : null}
        </Panel>
      ) : null}
      {webLink ? (
        <NamePrompt
          visible
          title="Tautan web"
          label="URL"
          initialValue={webLink.url ?? ""}
          submitLabel="Tautkan"
          onClose={() => setWebLink(null)}
          onSubmit={async (url) => {
            if (!/^https?:\/\/[^\s]+$/i.test(url))
              throw new Error(
                "Masukkan URL lengkap yang diawali https:// atau http://."
              );
            editor.current?.send({ type: "setLink", href: url });
            setWebLink(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text variant="headline" accessibilityRole="header">
            {title}
          </Text>
          <HeaderTextButton label="Tutup" onPress={onClose} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function NotePicker({
  selection,
  entries,
  loading,
  error,
  onClose,
  onPick,
}: {
  selection: PickNote;
  entries: NoteEntry[];
  loading: boolean;
  error?: string;
  onClose: () => void;
  onPick: (entry: NoteEntry) => void;
}) {
  const [filter, setFilter] = useState(selection.query);
  const term = filter.trim().toLocaleLowerCase();
  const matches = entries
    .filter((entry) =>
      `${entry.title} ${entry.path}`.toLocaleLowerCase().includes(term)
    )
    .slice(0, 40);
  return (
    <Panel title="Tautkan catatan" onClose={onClose}>
      <TextField
        accessibilityLabel="Cari catatan"
        placeholder="Cari judul atau folder"
        value={filter}
        onChangeText={setFilter}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : matches.length ? (
        <ListSection>
          {matches.map((entry) => (
            <ListRow
              key={entry.ref}
              title={entry.title}
              subtitle={entry.path}
              onPress={() => onPick(entry)}
            />
          ))}
        </ListSection>
      ) : (
        <EmptyState title="Catatan tidak ditemukan" />
      )}
    </Panel>
  );
}

function Backlinks({
  refId,
  onClose,
  onOpen,
}: {
  refId: string;
  onClose: () => void;
  onOpen: (ref: string) => void;
}) {
  const links = useQuery({
    queryKey: [...notesKeys.all, "backlinks", refId],
    queryFn: () => getNoteBacklinks(refId),
  });
  return (
    <Panel title="Tautan balik" onClose={onClose}>
      {links.isPending ? (
        <LoadingState />
      ) : links.isError ? (
        <ErrorState
          message={links.error.message}
          onRetry={() => void links.refetch()}
        />
      ) : links.data.length ? (
        <ListSection>
          {links.data.map((entry) => (
            <ListRow
              key={entry.ref}
              title={entry.title}
              subtitle={entry.path}
              onPress={() => onOpen(entry.ref)}
            />
          ))}
        </ListSection>
      ) : (
        <EmptyState
          title="Belum ada tautan balik"
          message="Catatan yang menautkan ke sini akan muncul di daftar ini."
        />
      )}
    </Panel>
  );
}

function Version({ label, note }: { label: string; note: NoteDraft }) {
  return (
    <View style={styles.version}>
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      <Text variant="headline">{note.title}</Text>
      <Text selectable>{readableText(note.content) || "Catatan kosong"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  message: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  panel: { flex: 1, backgroundColor: colors.background },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  content: { padding: spacing.lg, gap: spacing.lg },
  version: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
});
