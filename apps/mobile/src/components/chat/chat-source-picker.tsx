import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FileText, Folder } from "lucide-react-native";
import { useDeferredValue, useState } from "react";
import { FlatList, Modal, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderTextButton } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import type { ChatSource } from "@/lib/services/api/conversations/conversations.api";
import {
  getLibraryItems,
  type LibraryCrumb,
} from "@/lib/services/api/file-library/file-library.api";
import { workspaceQueryOptions } from "@/lib/services/api/notes/notes.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { colors, spacing } from "@/lib/theme";

const pageSize = 40;

type SourceRow = {
  source: ChatSource;
  disabled?: boolean;
  subtitle?: string;
};

export function ChatSourcePicker({
  kind,
  locale,
  selected,
  onSelect,
  onClose,
}: {
  kind: "files" | "notes";
  locale: SupportedLocale;
  selected: ChatSource[];
  onSelect: (source: ChatSource) => void;
  onClose: () => void;
}) {
  const en = locale === "en";
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<LibraryCrumb>();
  const term = useDeferredValue(search.trim());
  const files = useInfiniteQuery({
    queryKey: ["file-library", "chat-sources", folder?.id, term],
    queryFn: ({ pageParam }) =>
      getLibraryItems({
        folderId: term ? undefined : folder?.id,
        q: term || undefined,
        offset: pageParam,
        limit: pageSize,
        sort: "name",
        direction: "asc",
      }),
    initialPageParam: 0,
    getNextPageParam: (page) => {
      const next = page.pagination.offset + page.pagination.limit;
      return next < page.pagination.total ? next : undefined;
    },
    enabled: kind === "files",
  });
  const notes = useQuery({
    ...workspaceQueryOptions(),
    enabled: kind === "notes",
  });
  const query = kind === "files" ? files : notes;
  const rows: SourceRow[] =
    kind === "files"
      ? (files.data?.pages.flatMap(({ data }) =>
          data.map((item) => ({
            source: {
              id: item.id,
              kind: item.kind,
              label: item.name,
              path: item.path.map(({ name }) => name).join(" / "),
            },
            disabled: Boolean(
              item.deletingOperationId ||
              (item.kind === "file" && item.status !== "ready")
            ),
          }))
        ) ?? [])
      : (notes.data?.notes
          .filter((item) =>
            `${item.title} ${item.path} ${item.ref}`
              .toLocaleLowerCase(locale)
              .includes(term.toLocaleLowerCase(locale))
          )
          .map((item) => ({
            source: {
              kind: "note",
              id: item.ref,
              label: item.title,
              path: item.path,
            },
            subtitle: item.excerpt,
          })) ?? []);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text variant="headline" accessibilityRole="header">
            {kind === "files"
              ? en
                ? "Files and folders"
                : "File dan folder"
              : en
                ? "Notes"
                : "Catatan"}
          </Text>
          <HeaderTextButton label={en ? "Cancel" : "Batal"} onPress={onClose} />
        </View>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder={en ? "Search sources" : "Cari sumber"}
          accessibilityLabel={en ? "Search sources" : "Cari sumber"}
        />
        {folder ? (
          <ListRow
            title={en ? "All folders" : "Semua folder"}
            value={folder.name}
            onPress={() => setFolder(undefined)}
          />
        ) : null}
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            title={en ? "Could not load sources" : "Sumber tidak dapat dimuat"}
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={rows}
            keyExtractor={({ source }) => `${source.kind}:${source.id}`}
            onEndReached={() => {
              if (
                kind === "files" &&
                files.hasNextPage &&
                !files.isFetchingNextPage
              )
                void files.fetchNextPage();
            }}
            renderItem={({ item }) => {
              const { source } = item;
              const added = selected.some(
                (value) => value.kind === source.kind && value.id === source.id
              );
              return (
                <View style={styles.row}>
                  <View style={styles.item}>
                    <ListRow
                      title={source.label}
                      subtitle={source.path || item.subtitle}
                      icon={source.kind === "folder" ? Folder : FileText}
                      disabled={added || item.disabled}
                      chevron={false}
                      onPress={() => {
                        onSelect(source);
                        onClose();
                      }}
                    />
                  </View>
                  {source.kind === "folder" && !item.disabled ? (
                    <HeaderTextButton
                      label={en ? "Open" : "Buka"}
                      onPress={() => {
                        setSearch("");
                        setFolder({ id: source.id, name: source.label });
                      }}
                    />
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={
              <EmptyState title={en ? "No sources here" : "Belum ada sumber"} />
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    gap: spacing.md,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  item: { flex: 1 },
});
