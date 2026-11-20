import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { NamePrompt } from "@/components/files/name-prompt";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { FormScroll } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import type { ContactGroup } from "@/lib/services/api/contact-groups/contact-groups.api";
import {
  contactGroupsQueryOptions,
  useCreateContactGroup,
  useDeleteContactGroup,
  useUpdateContactGroup,
} from "@/lib/services/api/contact-groups/contact-groups.queries";

export default function ContactGroupsScreen() {
  const query = useQuery(contactGroupsQueryOptions());
  const create = useCreateContactGroup();
  const update = useUpdateContactGroup();
  const remove = useDeleteContactGroup();
  const showActions = useActionSheet();
  const toast = useToast();
  // Undefined closes the prompt, null creates a group, and a value edits it.
  const [groupToEdit, setGroupToEdit] = useState<ContactGroup | null>();
  const groups = query.data ?? [];

  function deleteGroup(group: ContactGroup) {
    Alert.alert(
      localized(`Hapus “${group.name}”?`, `Delete “${group.name}”?`),
      localized(
        "Semua kontak di grup ini tetap tersimpan.",
        "Contacts in this group will stay in your address book."
      ),
      [
        { text: localized("Batal", "Cancel"), style: "cancel" },
        {
          text: localized("Hapus grup", "Delete group"),
          style: "destructive",
          onPress: () =>
            remove.mutate(group.id, {
              onSuccess: () =>
                toast(localized("Grup dihapus.", "Group deleted.")),
              onError: (error) => {
                console.warn("Contact group deletion failed", {
                  name: error.name,
                });
                Alert.alert(
                  localized(
                    "Grup tidak dapat dihapus",
                    "Couldn't delete the group"
                  ),
                  error.message
                );
              },
            }),
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: localized("Grup kontak", "Contact groups"),
          headerRight: () => (
            <IconButton
              icon={Plus}
              accessibilityLabel={localized("Grup baru", "New group")}
              onPress={() => setGroupToEdit(null)}
            />
          ),
        }}
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && !query.data ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<UsersRound />}
          title={localized("Belum ada grup", "No groups yet")}
          message={localized(
            "Buat grup untuk mengelompokkan kontak.",
            "Create a group to organize contacts."
          )}
        />
      ) : (
        <FormScroll>
          {query.isError ? <InlineError message={query.error.message} /> : null}
          <ListSection>
            {groups.map((group) => (
              <ListRow
                key={group.id}
                icon={UsersRound}
                title={group.name}
                subtitle={localized(
                  `${group.contactCount} kontak`,
                  `${group.contactCount} ${group.contactCount === 1 ? "contact" : "contacts"}`
                )}
                onPress={() =>
                  showActions({
                    title: group.name,
                    options: [
                      {
                        label: localized("Ubah nama", "Rename"),
                        icon: Pencil,
                        onPress: () => setGroupToEdit(group),
                      },
                      {
                        label: localized("Hapus grup", "Delete group"),
                        icon: Trash2,
                        destructive: true,
                        onPress: () => deleteGroup(group),
                      },
                    ],
                  })
                }
                disabled={remove.isPending}
              />
            ))}
          </ListSection>
        </FormScroll>
      )}
      <NamePrompt
        visible={groupToEdit !== undefined}
        title={
          groupToEdit
            ? localized("Ubah nama grup", "Rename group")
            : localized("Grup baru", "New group")
        }
        label={localized("Nama grup", "Group name")}
        submitLabel={localized("Simpan", "Save")}
        initialValue={groupToEdit?.name}
        maxLength={40}
        onSubmit={async (name) => {
          if (groupToEdit)
            await update.mutateAsync({
              contactGroupId: groupToEdit.id,
              values: { name },
            });
          else await create.mutateAsync({ name });
          setGroupToEdit(undefined);
        }}
        onClose={() => setGroupToEdit(undefined)}
      />
    </View>
  );
}
