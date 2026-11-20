import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { MessageSquareText, SquarePen } from "lucide-react-native";
import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { IconButton } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { TextField } from "@/components/ui/text-field";
import { useProfile } from "@/lib/profile";
import { conversationsQueryOptions } from "@/lib/services/api/conversations/conversations.queries";
import { colors, radius, spacing } from "@/lib/theme";
import { matchingConversations } from "@/components/chat/conversation-history";

export default function ConversationHistoryScreen() {
  const router = useRouter();
  const { locale } = useProfile();
  const english = locale === "en";
  const query = useQuery(conversationsQueryOptions());
  const [search, setSearch] = useState("");
  const data = matchingConversations(query.data ?? [], search, locale);
  const newLabel = english ? "New conversation" : "Percakapan baru";
  const searchLabel = english ? "Search conversations" : "Cari percakapan";
  const newConversation = () =>
    router.replace({ pathname: "/chat/[id]", params: { id: "new" } });

  return (
    <>
      <Stack.Screen
        options={{
          title: english ? "Chat history" : "Riwayat percakapan",
          headerRight: () => (
            <IconButton
              icon={SquarePen}
              accessibilityLabel={newLabel}
              onPress={newConversation}
            />
          ),
        }}
      />
      <View style={styles.screen}>
        <TextField
          accessibilityLabel={searchLabel}
          placeholder={searchLabel}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            title={
              english
                ? "Could not load chat history"
                : "Riwayat tidak dapat dimuat"
            }
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <ListRow
                  icon={MessageSquareText}
                  title={item.title?.trim() || newLabel}
                  subtitle={item.lastMessagePreview}
                  onPress={() =>
                    router.replace({
                      pathname: "/chat/[id]",
                      params: { id: item.id },
                    })
                  }
                />
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                title={
                  search.trim()
                    ? english
                      ? "No matching conversations"
                      : "Percakapan tidak ditemukan"
                    : english
                      ? "No conversations yet"
                      : "Belum ada percakapan"
                }
              />
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  list: { flexGrow: 1, gap: spacing.xs, paddingBottom: spacing.xxl },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: "hidden",
  },
});
