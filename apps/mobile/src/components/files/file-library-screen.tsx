import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Stack, useIsFocused, useRouter } from "expo-router";
import {
  ArrowDownUp,
  Camera,
  CheckSquare,
  Ellipsis,
  File,
  FileUp,
  FolderClosed,
  FolderInput,
  FolderPlus,
  ImagePlus,
  Pencil,
  Search,
  Trash2,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  StyleSheet,
  View,
} from "react-native";
import { useDebouncedValue } from "@/components/tasks/use-debounced-value";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { Chip, Divider, Fab } from "@/components/ui/controls";
import { HeaderTextButton } from "@/components/ui/form";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import { useProfile } from "@/lib/profile";
import { ApiClientError } from "@/lib/services/api/api";
import type { LocalUploadFile } from "@/lib/services/api/documents/documents.api";
import { useUpdateDocument } from "@/lib/services/api/documents/documents.queries";
import {
  libraryItemKey,
  libraryRef,
  type LibraryItem,
} from "@/lib/services/api/file-library/file-library.api";
import {
  libraryFolderOptions,
  libraryInfiniteQueryOptions,
  useCreateLibraryFolder,
  useRenameLibraryFolder,
} from "@/lib/services/api/file-library/file-library.queries";
import { colors, spacing } from "@/lib/theme";
import { DeletionProgress } from "./deletion-progress";
import { FileLibraryRow } from "./file-library-row";
import {
  SORT_OPTIONS,
  libraryPathLabel,
  sortLabel,
  type LibrarySort,
} from "./file-format";
import { NamePrompt } from "./name-prompt";
import { pickDocuments, pickPhotos, takePhoto } from "./pick-files";
import { TryInChat } from "./try-in-chat";
import { libraryUploadSessionSignal, startUploads } from "./upload-store";
import { UploadTray } from "./upload-tray";
import { useAuthHeaders } from "./use-auth-headers";
import { useLibraryDelete } from "./use-library-delete";

type LibraryNameAction =
  { type: "create" } | { type: "rename"; item: LibraryItem };

export function FileLibraryScreen({ folderId }: { folderId?: string }) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const showActions = useActionSheet();
  const toast = useToast();
  const { timezone } = useProfile();
  const queryClient = useQueryClient();
  const headers = useAuthHeaders();
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<LibrarySort>({
    sort: "name",
    direction: "asc",
  });
  const [nameAction, setNameAction] = useState<LibraryNameAction | null>(null);
  const [selection, setSelection] = useState<Map<string, LibraryItem> | null>(
    null
  );
  const [picking, setPicking] = useState(false);
  const queryText = useDebouncedValue(search.trim());
  const folder = useQuery(libraryFolderOptions(folderId));
  const library = useInfiniteQuery(
    libraryInfiniteQueryOptions({
      folderId: queryText ? undefined : folderId,
      q: queryText || undefined,
      ...sorting,
    })
  );
  const create = useCreateLibraryFolder();
  const rename = useRenameLibraryFolder();
  const updateDocument = useUpdateDocument();
  const remove = useLibraryDelete();
  const items = library.data?.pages.flatMap((page) => page.data) ?? [];
  const currentFolder = folder.data?.data;
  const destination = libraryPathLabel(currentFolder?.path ?? []);
  const canManage =
    !folderId ||
    Boolean(currentFolder && !currentFolder.folder.deletingOperationId);
  const selectedItems = Array.from(selection?.values() ?? []);
  const renameItem =
    nameAction?.type === "rename" ? nameAction.item : undefined;

  useEffect(() => {
    const error = folder.error;
    if (
      !folderId ||
      !isFocused ||
      !(error instanceof ApiClientError) ||
      error.details?.deleted !== true
    )
      return;
    const parent = error.details.destinationId;
    if (typeof parent === "string" && parent) {
      router.dismissTo({
        pathname: "/files/[folderId]",
        params: { folderId: parent },
      });
    } else if (parent === null) {
      router.dismissTo("/files");
    } else {
      return;
    }
    toast(localized("Folder telah dihapus.", "The folder was deleted."));
  }, [folder.error, folderId, isFocused, router, toast]);

  async function upload(pick: () => Promise<LocalUploadFile[]>) {
    if (picking || !canManage) return;
    setPicking(true);
    const session = libraryUploadSessionSignal();
    try {
      const files = await pick();
      startUploads(files, { folderId, destination, queryClient, session });
    } catch (error) {
      console.warn("Native file picker failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      Alert.alert(
        localized("File tidak dapat dipilih", "Couldn't select files"),
        error instanceof Error
          ? error.message
          : localized("Coba pilih lagi.", "Try selecting the files again.")
      );
    } finally {
      setPicking(false);
    }
  }

  function showAddOptions() {
    Keyboard.dismiss();
    showActions({
      title: localized("Tambah ke sini", "Add here"),
      message: destination,
      options: [
        {
          label: localized("Pilih file", "Choose files"),
          icon: FileUp,
          onPress: () => void upload(pickDocuments),
        },
        {
          label: localized("Pilih foto", "Choose photos"),
          icon: ImagePlus,
          onPress: () => void upload(pickPhotos),
        },
        {
          label: localized("Ambil foto", "Take a photo"),
          icon: Camera,
          onPress: () => void upload(takePhoto),
        },
        {
          label: localized("Folder baru", "New folder"),
          icon: FolderPlus,
          onPress: () => setNameAction({ type: "create" }),
        },
      ],
    });
  }

  function moveItems(targets: LibraryItem[]) {
    const selected = targets.filter((item) => !item.deletingOperationId);
    if (!selected.length) return;
    const [first] = selected;
    const from = selected.every((item) => item.parentId === first.parentId)
      ? first.parentId
      : undefined;
    router.push({
      pathname: "/move-items",
      params: {
        items: JSON.stringify(selected.map(libraryRef)),
        from: from ?? undefined,
        fromRoot: from === null ? "1" : undefined,
      },
    });
  }

  function toggle(item: LibraryItem) {
    if (item.deletingOperationId) return;
    const key = libraryItemKey(item);
    setSelection((previous) => {
      const next = new Map(previous);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);

      return next;
    });
  }

  function open(item: LibraryItem) {
    if (selection) {
      toggle(item);
      return;
    }
    if (item.kind === "folder") {
      router.push({
        pathname: "/files/[folderId]",
        params: { folderId: item.id },
      });
    } else {
      router.push({ pathname: "/document/[id]", params: { id: item.id } });
    }
  }

  function showItemOptions(item: LibraryItem) {
    if (selection || item.deletingOperationId) return;
    Keyboard.dismiss();
    showActions({
      title: item.name,
      options: [
        {
          label: localized("Pilih", "Select"),
          icon: CheckSquare,
          onPress: () => toggle(item),
        },
        {
          label: localized("Ubah nama", "Rename"),
          icon: Pencil,
          onPress: () => setNameAction({ type: "rename", item }),
        },
        {
          label: localized("Pindahkan", "Move"),
          icon: FolderInput,
          onPress: () => moveItems([item]),
        },
        {
          label: localized("Hapus permanen", "Delete permanently"),
          icon: Trash2,
          destructive: true,
          onPress: () => void remove.confirmDelete([item]),
        },
      ],
    });
  }

  async function saveName(name: string) {
    if (renameItem?.kind === "folder") {
      await rename.mutateAsync({
        id: renameItem.id,
        revision: renameItem.revision,
        name,
      });
    } else if (renameItem) {
      await updateDocument.mutateAsync({
        documentId: renameItem.id,
        values: { title: name },
      });
    } else {
      await create.mutateAsync({ name, parentId: folderId ?? null });
    }
    setNameAction(null);
    toast(
      renameItem
        ? localized("Nama diperbarui.", "Name updated.")
        : localized("Folder dibuat.", "Folder created.")
    );
  }

  const title =
    currentFolder?.folder.name ?? localized("File saya", "My files");

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: selection
            ? localized(
                `${selection.size} dipilih`,
                `${selection.size} selected`
              )
            : title,
          headerRight: () =>
            selection ? (
              <HeaderTextButton
                label={localized("Selesai", "Done")}
                onPress={() => setSelection(null)}
              />
            ) : (
              <IconButton
                icon={Ellipsis}
                accessibilityLabel={localized(
                  "Opsi daftar file",
                  "File list options"
                )}
                onPress={() =>
                  showActions({
                    options: [
                      {
                        label: localized(
                          "Pilih beberapa item",
                          "Select multiple items"
                        ),
                        icon: CheckSquare,
                        onPress: () => setSelection(new Map()),
                      },
                      ...(!canManage
                        ? []
                        : [
                            {
                              label: localized("Folder baru", "New folder"),
                              icon: FolderPlus,
                              onPress: () =>
                                setNameAction({ type: "create" as const }),
                            },
                          ]),
                    ],
                  })
                }
              />
            ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={libraryItemKey}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={library.isRefetching}
        onRefresh={() => {
          void library.refetch();
          if (folderId) void folder.refetch();
        }}
        onEndReached={() => {
          if (library.hasNextPage && !library.isFetching)
            void library.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={
          <View style={styles.controls}>
            {folderId && currentFolder?.path.length ? (
              <Text variant="footnote" tone="muted">
                {destination}
              </Text>
            ) : null}
            <View style={styles.searchRow}>
              <TextField
                accessibilityLabel={localized(
                  "Cari semua file",
                  "Search all files"
                )}
                placeholder={localized("Cari semua file", "Search all files")}
                value={search}
                onChangeText={(value) => {
                  setSelection(null);
                  setSearch(value);
                }}
                maxLength={255}
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                containerStyle={styles.search}
              />
              <IconButton
                icon={ArrowDownUp}
                accessibilityLabel={localized(
                  `Urutkan: ${sortLabel(sorting)}`,
                  "Sort files"
                )}
                variant="filled"
                onPress={() =>
                  showActions({
                    title: localized("Urutkan", "Sort"),
                    options: SORT_OPTIONS.map(({ label, ...sort }) => ({
                      label,
                      onPress: () => setSorting(sort),
                    })),
                  })
                }
              />
            </View>
            <UploadTray />
            <DeletionProgress />
            {folder.isError ? (
              <InlineError message={folder.error.message} />
            ) : null}
            {library.isError && library.data ? (
              <InlineError message={library.error.message} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          library.isPending ? (
            <ListSkeleton />
          ) : library.isError ? (
            <ErrorState
              message={library.error.message}
              onRetry={() => void library.refetch()}
            />
          ) : (
            <EmptyState
              icon={
                queryText ? <Search /> : folderId ? <FolderClosed /> : <File />
              }
              title={
                queryText
                  ? localized("File tidak ditemukan", "No files found")
                  : folderId
                    ? localized("Folder kosong", "Folder is empty")
                    : localized("Belum ada file", "No files yet")
              }
              message={
                queryText
                  ? localized(
                      "Coba kata kunci lain.",
                      "Try a different search."
                    )
                  : localized(
                      "Gunakan tombol tambah untuk mengunggah file atau membuat folder.",
                      "Use the add button to upload a file or create a folder."
                    )
              }
              action={
                !queryText && !folderId ? <TryInChat topic="file" /> : undefined
              }
            />
          )
        }
        ListFooterComponent={
          library.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors.mutedForeground}
              style={styles.loadingMore}
            />
          ) : undefined
        }
        renderItem={({ item }) => (
          <FileLibraryRow
            item={item}
            headers={headers}
            timeZone={timezone}
            selectionMode={Boolean(selection)}
            selected={selection?.has(libraryItemKey(item)) ?? false}
            showPath={Boolean(queryText)}
            onPress={open}
            onLongPress={showItemOptions}
          />
        )}
      />
      {selection ? (
        <View style={styles.selectionActions}>
          <Chip
            label={localized(
              "Pilih semua yang ditampilkan",
              "Select all visible"
            )}
            onPress={() => {
              setSelection(
                new Map(
                  items
                    .filter((item) => !item.deletingOperationId)
                    .map((item) => [libraryItemKey(item), item])
                )
              );
            }}
          />
          <View style={styles.actions}>
            <Button
              variant="outline"
              icon={FolderInput}
              label={localized("Pindahkan", "Move")}
              onPress={() => {
                moveItems(selectedItems);
                setSelection(null);
              }}
              disabled={!selection.size}
            />
            <Button
              variant="destructive"
              icon={Trash2}
              label={localized("Hapus", "Delete")}
              onPress={() =>
                void remove.confirmDelete(selectedItems, () =>
                  setSelection(null)
                )
              }
              disabled={!selection.size || remove.checking}
            />
          </View>
        </View>
      ) : canManage && !picking ? (
        <Fab
          onPress={showAddOptions}
          accessibilityLabel={localized(
            "Tambah file atau folder",
            "Add files or a folder"
          )}
        />
      ) : null}
      <NamePrompt
        visible={nameAction !== null}
        title={
          renameItem
            ? localized("Ubah nama", "Rename")
            : localized("Folder baru", "New folder")
        }
        label={
          renameItem?.kind === "file"
            ? localized("Nama file", "File name")
            : localized("Nama folder", "Folder name")
        }
        initialValue={renameItem?.name}
        submitLabel={localized("Simpan", "Save")}
        maxLength={renameItem?.kind === "file" ? 120 : 1024}
        onSubmit={saveName}
        onClose={() => setNameAction(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 115 },
  controls: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  search: { flex: 1 },
  loadingMore: { padding: spacing.lg },
  selectionActions: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
});
