import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { ContactForm } from "@/components/contacts/contact-form";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import {
  contactQueryOptions,
  useUpdateContact,
} from "@/lib/services/api/contacts/contacts.queries";

export default function EditContactScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contact = useQuery(contactQueryOptions(id));
  const update = useUpdateContact();
  const toast = useToast();

  if (contact.isPending) return <LoadingState />;
  if (contact.isError && !contact.data)
    return (
      <ErrorState
        message={contact.error.message}
        onRetry={() => void contact.refetch()}
      />
    );

  return (
    <ContactForm
      key={contact.data.id}
      contact={contact.data}
      onCancel={() => router.back()}
      onSave={async (values) => {
        await update.mutateAsync({ contactId: id, values });
        toast(localized("Kontak diperbarui.", "Contact updated."));
        if (navigation.isFocused()) router.back();
      }}
    />
  );
}
