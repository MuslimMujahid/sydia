import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { ContactForm } from "@/components/contacts/contact-form";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import { useCreateContact } from "@/lib/services/api/contacts/contacts.queries";

export default function NewContactScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const create = useCreateContact();
  const toast = useToast();

  return (
    <ContactForm
      initialGroupId={groupId}
      onCancel={() => router.back()}
      onSave={async (values) => {
        await create.mutateAsync(values);
        toast(localized("Kontak disimpan.", "Contact saved."));
        if (navigation.isFocused()) router.back();
      }}
    />
  );
}
