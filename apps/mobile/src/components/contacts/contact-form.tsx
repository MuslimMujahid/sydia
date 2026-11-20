import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Chip } from "@/components/ui/controls";
import { FormHeader, FormScroll } from "@/components/ui/form";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { localized } from "@/lib/i18n";
import { contactGroupsQueryOptions } from "@/lib/services/api/contact-groups/contact-groups.queries";
import type {
  Contact,
  ContactWriteInput,
} from "@/lib/services/api/contacts/contacts.api";
import { spacing } from "@/lib/theme";
import { isValidEmail, parseAliases } from "./contact-format";

interface ContactFormProps {
  contact?: Contact;
  initialGroupId?: string;
  onSave: (values: ContactWriteInput) => Promise<void>;
  onCancel: () => void;
}

export function ContactForm({
  contact,
  initialGroupId,
  onSave,
  onCancel,
}: ContactFormProps) {
  const navigation = useNavigation();
  const groups = useQuery(contactGroupsQueryOptions());
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [aliases, setAliases] = useState(contact?.aliases.join(", ") ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [groupIds, setGroupIds] = useState(
    contact?.groups.map(({ id }) => id) ??
      (initialGroupId ? [initialGroupId] : [])
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const invalidEmail = Boolean(email.trim()) && !isValidEmail(email);
  const canSave = Boolean(name.trim()) && !invalidEmail && !saving;
  const choices = groups.data ?? contact?.groups ?? [];

  function toggleGroup(id: string) {
    setGroupIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    );
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    navigation.setOptions({ gestureEnabled: false });

    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        aliases: parseAliases(aliases),
        notes: notes.trim() || null,
        groupIds: groups.data
          ? groupIds.filter((id) => choices.some((group) => group.id === id))
          : groupIds,
      });
    } catch (error) {
      console.warn("Contact save failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setSaveError(
        error instanceof Error
          ? error.message
          : localized(
              "Kontak tidak dapat disimpan.",
              "Couldn't save the contact."
            )
      );
      navigation.setOptions({ gestureEnabled: true });
      setSaving(false);
    }
  }

  return (
    <>
      <FormHeader
        title={
          contact
            ? localized("Ubah kontak", "Edit contact")
            : localized("Kontak baru", "New contact")
        }
        onCancel={onCancel}
        onSave={() => void save()}
        saveLabel={localized("Simpan", "Save")}
        canSave={canSave}
        saving={saving}
      />
      <FormScroll>
        <InlineError message={saveError} />
        <TextField
          label={localized("Nama", "Name")}
          value={name}
          onChangeText={setName}
          maxLength={200}
          autoComplete="name"
          editable={!saving}
        />
        <TextField
          label={localized("Nomor telepon", "Phone number")}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={50}
          autoComplete="tel"
          editable={!saving}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!saving}
          error={
            invalidEmail
              ? localized(
                  "Masukkan alamat email yang valid.",
                  "Enter a valid email address."
                )
              : undefined
          }
        />
        <TextField
          label={localized("Panggilan", "Aliases")}
          hint={localized("Pisahkan dengan koma.", "Separate with commas.")}
          value={aliases}
          onChangeText={setAliases}
          editable={!saving}
        />
        {groups.isError ? <InlineError message={groups.error.message} /> : null}
        {choices.length > 0 ? (
          <View style={styles.groupSection}>
            <Text variant="callout" weight="semibold">
              {localized("Grup", "Groups")}
            </Text>
            <View style={styles.chips}>
              {choices.map((group) => (
                <Chip
                  key={group.id}
                  label={group.name}
                  selected={groupIds.includes(group.id)}
                  onPress={saving ? undefined : () => toggleGroup(group.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <TextField
          label={localized("Catatan", "Notes")}
          value={notes}
          onChangeText={setNotes}
          maxLength={2000}
          multiline
          editable={!saving}
        />
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  groupSection: { gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
