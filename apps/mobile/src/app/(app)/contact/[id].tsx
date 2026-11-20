import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Ellipsis,
  Mail,
  MessageCircle,
  Phone,
  Trash2,
} from "lucide-react-native";
import { Alert, StyleSheet, View } from "react-native";
import {
  dialableNumber,
  whatsappNumber,
} from "@/components/contacts/contact-format";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/controls";
import { FormScroll, HeaderTextButton } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import {
  contactQueryOptions,
  useDeleteContact,
} from "@/lib/services/api/contacts/contacts.queries";
import { spacing } from "@/lib/theme";

export default function ContactScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery(contactQueryOptions(id));
  const remove = useDeleteContact();
  const toast = useToast();
  const showActions = useActionSheet();

  if (query.isPending) return <LoadingState />;
  if (query.isError && !query.data)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const contact = query.data;
  const dial = contact.phone ? dialableNumber(contact.phone) : null;
  const whatsapp = contact.phone ? whatsappNumber(contact.phone) : null;

  function confirmDelete() {
    Alert.alert(localized("Hapus kontak?", "Delete contact?"), contact.name, [
      { text: localized("Batal", "Cancel"), style: "cancel" },
      {
        text: localized("Hapus", "Delete"),
        style: "destructive",
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              toast(localized("Kontak dihapus.", "Contact deleted."));
              if (router.canGoBack()) router.back();
              else router.replace("/contacts");
            },
            onError: (error) => {
              console.warn("Contact deletion failed", { name: error.name });
              Alert.alert(
                localized(
                  "Kontak tidak dapat dihapus",
                  "Couldn't delete the contact"
                ),
                error.message
              );
            },
          }),
      },
    ]);
  }

  async function openLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("Contact action unavailable", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      toast(
        localized(
          "Tidak ada aplikasi yang dapat membuka tindakan ini.",
          "No app can open this action."
        )
      );
    }
  }

  async function copy(value: string) {
    try {
      if (!(await Clipboard.setStringAsync(value))) {
        throw new Error("Clipboard rejected contact value");
      }
      toast(localized("Disalin.", "Copied."));
    } catch (error) {
      console.warn("Could not copy contact field", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      toast(localized("Teks tidak dapat disalin.", "Couldn't copy the text."));
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderTextButton
                label={localized("Ubah", "Edit")}
                onPress={() =>
                  router.push({
                    pathname: "/contact/edit/[id]",
                    params: { id },
                  })
                }
                disabled={remove.isPending}
              />
              <IconButton
                icon={Ellipsis}
                accessibilityLabel={localized("Opsi kontak", "Contact options")}
                disabled={remove.isPending}
                onPress={() =>
                  showActions({
                    options: [
                      {
                        label: localized("Hapus kontak", "Delete contact"),
                        icon: Trash2,
                        destructive: true,
                        onPress: confirmDelete,
                      },
                    ],
                  })
                }
              />
            </View>
          ),
        }}
      />
      <FormScroll>
        <View style={styles.identity}>
          <Avatar name={contact.name} size={68} />
          <Text
            variant="title"
            weight="bold"
            accessibilityRole="header"
            style={styles.name}
          >
            {contact.name}
          </Text>
          {contact.aliases.length > 0 ? (
            <Text variant="callout" tone="muted" style={styles.name}>
              {contact.aliases.join(" · ")}
            </Text>
          ) : null}
        </View>
        {contact.phone || contact.email ? (
          <ListSection>
            {contact.phone ? (
              <ListRow
                title={contact.phone}
                subtitle={localized("Telepon", "Call")}
                icon={Phone}
                chevron={false}
                onPress={
                  dial && dial !== "+"
                    ? () => void openLink(`tel:${dial}`)
                    : undefined
                }
                onLongPress={() => void copy(contact.phone!)}
              />
            ) : null}
            {whatsapp ? (
              <ListRow
                title="WhatsApp"
                icon={MessageCircle}
                onPress={() => void openLink(`https://wa.me/${whatsapp}`)}
              />
            ) : null}
            {contact.email ? (
              <ListRow
                title={contact.email}
                subtitle="Email"
                icon={Mail}
                chevron={false}
                onPress={() =>
                  void openLink(
                    `mailto:${encodeURIComponent(contact.email!).replace("%40", "@")}`
                  )
                }
                onLongPress={() => void copy(contact.email!)}
              />
            ) : null}
          </ListSection>
        ) : null}
        {contact.groups.length > 0 ? (
          <View style={styles.section}>
            <Text variant="callout" weight="semibold">
              {localized("Grup", "Groups")}
            </Text>
            <Text>{contact.groups.map((group) => group.name).join(" · ")}</Text>
          </View>
        ) : null}
        {contact.notes ? (
          <View style={styles.section}>
            <Text variant="callout" weight="semibold">
              {localized("Catatan", "Notes")}
            </Text>
            <Text selectable>{contact.notes}</Text>
          </View>
        ) : null}
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  identity: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  name: { textAlign: "center" },
  section: { gap: spacing.sm },
});
