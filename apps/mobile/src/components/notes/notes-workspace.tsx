import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Stack, useRouter } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  Ellipsis,
  FileText,
  Folder,
  FolderInput,
  Pencil,
  Plus,
  RotateCcw,
  Table2,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { NamePrompt } from "@/components/files/name-prompt";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useDebouncedValue } from "@/components/tasks/use-debounced-value";
import { useProfile } from "@/lib/profile";
import {
  createWorkspaceItem,
  mutateWorkspaceItem,
  notesKeys,
  searchWorkspaceNotes,
  workspaceQueryOptions,
  type NoteEntry,
  type WorkspaceItem,
} from "@/lib/services/api/notes/notes.api";
import { createRecordNote } from "@/lib/services/api/record-notes/record-notes.api";
import { colors, radius, spacing } from "@/lib/theme";
import { formatShortDayKey, todayKey } from "@/lib/utils/date-time";
import { folderChildren, moveTargets, trashRoots } from "./workspace-model";
import { WorkspaceDestination } from "./workspace-destination";

type Prompt =
  | { kind: "folder" | "note" | "record" }
  | { kind: "rename"; item: WorkspaceItem };

export function NotesWorkspace({
  folderId = null,
}: {
  folderId?: string | null;
}) {
  const router = useRouter();
  const sheet = useActionSheet();
  const toast = useToast();
  const profile = useProfile();
  const today = todayKey(profile.timezone);
  const [filter, setFilter] = useState("");
  const [trash, setTrash] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [destination, setDestination] = useState<{
    item: WorkspaceItem;
    action: "update" | "restore";
  } | null>(null);
  const query = useDebouncedValue(filter.trim(), 300);
  const workspace = useQuery(workspaceQueryOptions());
  const search = useQuery({
    queryKey: [...notesKeys.all, "search", query, folderId],
    queryFn: () =>
      searchWorkspaceNotes(query, undefined, folderId ?? undefined),
    enabled: query.length > 0 && !trash,
  });
  const write = useMutation({
    mutationFn: mutateWorkspaceItem,
    meta: { invalidateQueries: [notesKeys.all] },
  });
  const create = useMutation({
    mutationFn: async ({
      input,
      title,
      requestKey,
    }: {
      input: Prompt;
      title: string;
      requestKey: string;
    }) => {
      if (input.kind === "rename") {
        await mutateWorkspaceItem({
          id: input.item.id,
          revision: input.item.revision,
          action: "update",
          title,
        });
        return null;
      }
      if (input.kind === "record") {
        const record = await createRecordNote({
          parentId: folderId,
          requestKey,
          title,
          columns: [
            { id: "name", name: "Nama", type: "text", required: false },
          ],
        });
        return { id: record.id, kind: "record" } as const;
      }
      const item = await createWorkspaceItem({
        parentId: folderId,
        requestKey,
        title,
        kind: input.kind,
      });
      return { id: item.id, kind: item.kind };
    },
    meta: { invalidateQueries: [notesKeys.all] },
  });

  function openItem(id: string, kind: "folder" | "note" | "record") {
    if (kind === "folder")
      router.push({ pathname: "/notes/folder/[id]", params: { id } });
    else if (kind === "record")
      router.push({ pathname: "/record/[id]", params: { id } });
    else
      router.push({ pathname: "/note/[ref]", params: { ref: `custom:${id}` } });
  }

  function openEntry(entry: NoteEntry) {
    router.push({ pathname: "/note/[ref]", params: { ref: entry.ref } });
  }

  const items = workspace.data?.items ?? [];
  const folder = items.find((item) => item.id === folderId && !item.trashedAt);
  const children = trash ? trashRoots(items) : folderChildren(items, folderId);
  const folderAvailable = folderId === null || folder?.kind === "folder";

  function newMenu() {
    sheet({
      title: "Buat baru",
      options: [
        {
          label: "Catatan",
          icon: FileText,
          onPress: () => setPrompt({ kind: "note" }),
        },
        {
          label: "Folder",
          icon: Folder,
          onPress: () => setPrompt({ kind: "folder" }),
        },
        {
          label: "Tabel",
          icon: Table2,
          onPress: () => setPrompt({ kind: "record" }),
        },
      ],
    });
  }

  function changeItem(item: WorkspaceItem, action: "trash" | "delete") {
    write.mutate(
      { id: item.id, revision: item.revision, action },
      {
        onSuccess: () => {
          if (action === "trash") toast("Dipindahkan ke sampah");
          if (action === "delete") toast("Dihapus permanen");
        },
      }
    );
  }

  function itemMenu(item: WorkspaceItem) {
    if (trash) {
      sheet({
        title: item.title,
        options: [
          {
            label: "Pulihkan",
            icon: RotateCcw,
            onPress: () => setDestination({ item, action: "restore" }),
          },
          {
            label: "Hapus permanen",
            icon: Trash2,
            destructive: true,
            onPress: () =>
              Alert.alert("Hapus permanen?", `“${item.title}” akan dihapus.`, [
                { text: "Batal", style: "cancel" },
                {
                  text: "Hapus",
                  style: "destructive",
                  onPress: () => changeItem(item, "delete"),
                },
              ]),
          },
        ],
      });
      return;
    }
    sheet({
      title: item.title,
      options: [
        {
          label: "Ubah nama",
          icon: Pencil,
          onPress: () => setPrompt({ kind: "rename", item }),
        },
        {
          label: "Pindahkan",
          icon: FolderInput,
          onPress: () => setDestination({ item, action: "update" }),
        },
        {
          label: "Pindahkan ke sampah",
          icon: Trash2,
          destructive: true,
          onPress: () => changeItem(item, "trash"),
        },
      ],
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: trash ? "Sampah" : (folder?.title ?? "Catatan"),
          headerRight: () => (
            <View style={styles.header}>
              {!folderId ? (
                <IconButton
                  size={44}
                  icon={trash ? BookOpen : Trash2}
                  accessibilityLabel={trash ? "Lihat catatan" : "Lihat sampah"}
                  onPress={() => setTrash(!trash)}
                />
              ) : null}
              {!trash && folderAvailable ? (
                <IconButton
                  size={44}
                  icon={Plus}
                  accessibilityLabel="Buat catatan, folder, atau tabel"
                  onPress={newMenu}
                />
              ) : null}
            </View>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {!trash && folderAvailable ? (
          <>
            {!folderId ? (
              <ListSection>
                <ListRow
                  icon={CalendarDays}
                  title="Catatan harian"
                  subtitle={formatShortDayKey(today, profile.locale)}
                  onPress={() => router.push("/daily-notes")}
                />
              </ListSection>
            ) : null}
            <TextField
              accessibilityLabel="Cari catatan"
              placeholder="Cari catatan"
              maxLength={400}
              value={filter}
              onChangeText={setFilter}
              returnKeyType="search"
              autoCorrect={false}
            />
          </>
        ) : null}
        <InlineError message={write.error?.message} />
        {workspace.isPending ? (
          <ListSkeleton />
        ) : workspace.isError ? (
          <ErrorState
            message={workspace.error.message}
            onRetry={() => void workspace.refetch()}
          />
        ) : !folderAvailable ? (
          <EmptyState
            title="Folder tidak ditemukan"
            message="Folder mungkin dipindahkan ke sampah."
          />
        ) : filter.trim() && !trash ? (
          query !== filter.trim() || search.isPending ? (
            <ListSkeleton rows={3} />
          ) : search.isError ? (
            <ErrorState
              message={search.error.message}
              onRetry={() => void search.refetch()}
            />
          ) : !search.data.length ? (
            <EmptyState title="Catatan tidak ditemukan" />
          ) : (
            <ListSection>
              {search.data.map((entry) => (
                <ListRow
                  key={entry.ref}
                  title={entry.title}
                  subtitle={entry.excerpt || entry.path}
                  icon={entry.kind === "daily" ? CalendarDays : FileText}
                  onPress={() => openEntry(entry)}
                />
              ))}
            </ListSection>
          )
        ) : children.length ? (
          <View style={styles.rows}>
            {children.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowContent}>
                  <ListRow
                    icon={
                      item.kind === "folder"
                        ? Folder
                        : item.format === "record"
                          ? Table2
                          : FileText
                    }
                    title={item.title}
                    onPress={() =>
                      trash
                        ? itemMenu(item)
                        : openItem(
                            item.id,
                            item.format === "record" ? "record" : item.kind
                          )
                    }
                  />
                </View>
                <IconButton
                  size={44}
                  icon={Ellipsis}
                  accessibilityLabel={`Pilihan untuk ${item.title}`}
                  disabled={write.isPending}
                  onPress={() => itemMenu(item)}
                />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState title={trash ? "Sampah kosong" : "Belum ada catatan"} />
        )}
      </ScrollView>
      {destination ? (
        <WorkspaceDestination
          item={destination.item}
          restore={destination.action === "restore"}
          targets={moveTargets(
            items,
            destination.item,
            destination.action === "restore"
          )}
          onClose={() => setDestination(null)}
          onSubmit={async (parentId, title) => {
            await write.mutateAsync({
              id: destination.item.id,
              revision: destination.item.revision,
              action: destination.action,
              parentId,
              title,
            });
            toast(
              destination.action === "restore" ? "Dipulihkan" : "Dipindahkan"
            );
            setDestination(null);
          }}
        />
      ) : null}
      {prompt ? (
        <ItemPrompt
          prompt={prompt}
          onClose={() => setPrompt(null)}
          onSubmit={async (title, requestKey) => {
            const item = await create.mutateAsync({
              input: prompt,
              title,
              requestKey,
            });
            setPrompt(null);
            if (item) openItem(item.id, item.kind);
          }}
        />
      ) : null}
    </>
  );
}

function ItemPrompt({
  prompt,
  onClose,
  onSubmit,
}: {
  prompt: Prompt;
  onClose: () => void;
  onSubmit: (title: string, requestKey: string) => Promise<void>;
}) {
  const [attempt, setAttempt] = useState<{ title: string; key: string }>();
  const labels = {
    folder: "Folder baru",
    note: "Catatan baru",
    record: "Tabel baru",
    rename: "Ubah nama",
  };

  return (
    <NamePrompt
      visible
      title={labels[prompt.kind]}
      label="Nama"
      maxLength={240}
      initialValue={prompt.kind === "rename" ? prompt.item.title : undefined}
      submitLabel={prompt.kind === "rename" ? "Simpan" : "Buat"}
      onClose={onClose}
      onSubmit={(title) => {
        const key =
          attempt?.title === title ? attempt.key : Crypto.randomUUID();
        setAttempt({ title, key });
        return onSubmit(title, key);
      }}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row" },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  rows: {
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  rowContent: { flex: 1 },
});
