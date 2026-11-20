import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronUp,
  FolderClosed,
  FolderInput,
  FolderPlus,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  isUnavailableDestination,
  libraryPathLabel,
} from "@/components/files/file-format";
import { readMoveSelection } from "@/components/files/move-selection";
import { NamePrompt } from "@/components/files/name-prompt";
import { Button, IconButton } from "@/components/ui/button";
import { Divider } from "@/components/ui/controls";
import { HeaderTextButton } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import {
  libraryFolderOptions,
  libraryInfiniteQueryOptions,
  useCreateLibraryFolder,
  useMoveLibraryItems,
} from "@/lib/services/api/file-library/file-library.queries";
import type { LibraryRef } from "@/lib/services/api/file-library/file-library.api";
import { colors, spacing } from "@/lib/theme";

export default function MoveItemsScreen() {
  const router = useRouter();
  const { items, from, fromRoot } = useLocalSearchParams<{
    items?: string;
    from?: string;
    fromRoot?: string;
  }>();
  const selection = useMemo(() => readMoveSelection(items), [items]);

  if (!selection.ok) {
    return (
      <ErrorState
        message={localized(
          "Pilih file atau folder dari daftar file untuk memindahkannya.",
          "Select files or folders in your library to move them."
        )}
        onRetry={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/files");
        }}
        retryLabel={localized("Kembali", "Go back")}
      />
    );
  }

  return (
    <DestinationPicker
      selection={selection.items}
      source={fromRoot === "1" ? "" : from}
    />
  );
}

function DestinationPicker({
  selection,
  source,
}: {
  selection: LibraryRef[];
  source?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [destinationId, setDestinationId] = useState<string>();
  const [showNewFolder, setShowNewFolder] = useState(false);
  const selectedFolderIds = new Set(
    selection.filter((item) => item.kind === "folder").map(({ id }) => id)
  );
  const folder = useQuery(libraryFolderOptions(destinationId));
  const children = useInfiniteQuery(
    libraryInfiniteQueryOptions({
      folderId: destinationId,
      sort: "name",
      direction: "asc",
      foldersOnly: "true",
    })
  );
  const move = useMoveLibraryItems();
  const create = useCreateLibraryFolder();
  const title = libraryPathLabel(folder.data?.data.path ?? []);
  const items = children.data?.pages.flatMap((page) => page.data) ?? [];
  const unavailable = Boolean(
    destinationId &&
    (!folder.data ||
      folder.data.data.folder.deletingOperationId ||
      isUnavailableDestination(
        selectedFolderIds,
        destinationId,
        folder.data.data.path
      ))
  );
  const sameDestination =
    source !== undefined && source === (destinationId ?? "");

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <HeaderTextButton
          label={localized("Batal", "Cancel")}
          disabled={move.isPending}
          onPress={() => router.back()}
        />
        <Text variant="headline" weight="semibold" accessibilityRole="header">
          {localized("Pindahkan ke", "Move to")}
        </Text>
        <IconButton
          icon={FolderPlus}
          accessibilityLabel={localized("Folder baru", "New folder")}
          disabled={unavailable || move.isPending}
          onPress={() => setShowNewFolder(true)}
        />
      </View>
      <View style={styles.path}>
        <Text variant="footnote" tone="muted" style={styles.location}>
          {title}
        </Text>
        {destinationId && folder.data ? (
          <IconButton
            icon={ChevronUp}
            accessibilityLabel={localized(
              "Buka folder induk",
              "Go to parent folder"
            )}
            disabled={move.isPending}
            onPress={() => {
              move.reset();
              setDestinationId(folder.data.data.folder.parentId ?? undefined);
            }}
          />
        ) : null}
      </View>
      {folder.isError ? (
        <ErrorState
          message={folder.error.message}
          onRetry={() => setDestinationId(undefined)}
          retryLabel={localized("Kembali ke File saya", "Back to My files")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (children.hasNextPage && !children.isFetching)
              void children.fetchNextPage();
          }}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={
            children.isPending ? (
              <ListSkeleton rows={3} />
            ) : children.isError ? (
              <ErrorState
                message={children.error.message}
                onRetry={() => void children.refetch()}
              />
            ) : (
              <EmptyState
                icon={<FolderClosed />}
                title={localized("Tidak ada subfolder", "No subfolders")}
              />
            )
          }
          ListFooterComponent={
            children.isFetchingNextPage ? (
              <ActivityIndicator color={colors.mutedForeground} />
            ) : undefined
          }
          renderItem={({ item }) => (
            <ListRow
              icon={FolderClosed}
              title={item.name}
              disabled={
                move.isPending ||
                Boolean(item.deletingOperationId) ||
                isUnavailableDestination(selectedFolderIds, item.id, item.path)
              }
              onPress={() => {
                move.reset();
                setDestinationId(item.id);
              }}
            />
          )}
        />
      )}
      <View style={styles.footer}>
        {children.isError && children.data ? (
          <InlineError message={children.error.message} />
        ) : null}
        <InlineError message={move.error?.message} />
        <Button
          label={localized("Pindahkan ke sini", "Move here")}
          icon={FolderInput}
          variant="secondary"
          fullWidth
          disabled={unavailable || sameDestination}
          loading={move.isPending}
          onPress={() => {
            move.mutate(
              { items: selection, destinationId: destinationId ?? null },
              {
                onSuccess: () => {
                  toast(localized("Item dipindahkan.", "Items moved."));
                  router.back();
                },
              }
            );
          }}
        />
      </View>
      <NamePrompt
        visible={showNewFolder}
        title={localized("Folder baru", "New folder")}
        label={localized("Nama folder", "Folder name")}
        submitLabel={localized("Buat folder", "Create folder")}
        maxLength={1024}
        onSubmit={async (name) => {
          const { data } = await create.mutateAsync({
            name,
            parentId: destinationId ?? null,
          });
          setShowNewFolder(false);
          setDestinationId(data.id);
        }}
        onClose={() => setShowNewFolder(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: spacing.md, backgroundColor: colors.card },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  path: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  location: { flex: 1 },
  list: { flexGrow: 1 },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
