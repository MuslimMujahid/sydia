import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ContactRound, Search, UsersRound } from "lucide-react-native";
import { useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import {
  contactSections,
  contactSubtitle,
} from "@/components/contacts/contact-format";
import { TryInChat } from "@/components/files/try-in-chat";
import { useDebouncedValue } from "@/components/tasks/use-debounced-value";
import { IconButton } from "@/components/ui/button";
import { Avatar, Chip, ChipRow, Divider, Fab } from "@/components/ui/controls";
import { ListRow } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { localized } from "@/lib/i18n";
import { contactGroupsQueryOptions } from "@/lib/services/api/contact-groups/contact-groups.queries";
import { contactsQueryOptions } from "@/lib/services/api/contacts/contacts.queries";
import { colors, spacing } from "@/lib/theme";

export default function ContactsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const debouncedSearch = useDebouncedValue(search.trim());
  const groups = useQuery(contactGroupsQueryOptions());
  const groupId = groups.data?.some(({ id }) => id === selectedGroupId)
    ? selectedGroupId
    : undefined;
  const contacts = useQuery(contactsQueryOptions(debouncedSearch, groupId));
  const isFiltered = Boolean(debouncedSearch || groupId);
  const sections = contactSections(contacts.data ?? []);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: localized("Kontak", "Contacts"),
          headerRight: () => (
            <IconButton
              icon={UsersRound}
              accessibilityLabel={localized("Kelola grup", "Manage groups")}
              onPress={() => router.push("/contact-groups")}
            />
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(contact) => contact.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={contacts.isRefetching && !contacts.isPending}
        onRefresh={() => {
          void contacts.refetch();
          void groups.refetch();
        }}
        ListHeaderComponent={
          <View style={styles.filters}>
            <TextField
              accessibilityLabel={localized("Cari kontak", "Search contacts")}
              placeholder={localized(
                "Cari nama, email, atau nomor telepon",
                "Search name, email, or phone"
              )}
              value={search}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setSearch}
              containerStyle={styles.search}
            />
            {groups.isError ? (
              <View style={styles.search}>
                <InlineError message={groups.error.message} />
              </View>
            ) : null}
            {contacts.isError && contacts.data ? (
              <View style={styles.search}>
                <InlineError message={contacts.error.message} />
              </View>
            ) : null}
            {Boolean(groups.data?.length) && (
              <ChipRow>
                <Chip
                  label={localized("Semua", "All")}
                  selected={!groupId}
                  onPress={() => setSelectedGroupId(undefined)}
                />
                {groups.data?.map((group) => (
                  <Chip
                    key={group.id}
                    label={group.name}
                    selected={group.id === groupId}
                    onPress={() => setSelectedGroupId(group.id)}
                  />
                ))}
              </ChipRow>
            )}
          </View>
        }
        ListEmptyComponent={
          contacts.isPending ? (
            <ListSkeleton />
          ) : contacts.isError ? (
            <ErrorState
              message={contacts.error.message}
              onRetry={() => void contacts.refetch()}
            />
          ) : (
            <EmptyState
              icon={isFiltered ? <Search /> : <ContactRound />}
              title={
                isFiltered
                  ? localized("Kontak tidak ditemukan", "No contacts found")
                  : localized("Belum ada kontak", "No contacts yet")
              }
              message={
                isFiltered
                  ? localized(
                      "Coba kata kunci atau grup lain.",
                      "Try a different search or group."
                    )
                  : localized(
                      "Tambahkan kontak dengan tombol tambah atau simpan lewat chat.",
                      "Use the add button or save a contact in chat."
                    )
              }
              action={isFiltered ? undefined : <TryInChat topic="contact" />}
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text
              variant="footnote"
              weight="semibold"
              tone="muted"
              accessibilityRole="header"
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={contactSubtitle(item)}
            leading={<Avatar name={item.name} />}
            onPress={() =>
              router.push({
                pathname: "/contact/[id]",
                params: { id: item.id },
              })
            }
          />
        )}
        ItemSeparatorComponent={Divider}
      />
      <Fab
        accessibilityLabel={localized("Tambah kontak", "Add contact")}
        onPress={() =>
          router.push({ pathname: "/contact/new", params: { groupId } })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 120 },
  filters: { paddingVertical: spacing.sm, gap: spacing.md },
  search: { marginHorizontal: spacing.lg },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
});
