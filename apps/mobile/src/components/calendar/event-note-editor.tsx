import { usePreventRemove } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import {
  NativeNoteEditor,
  type NoteEditorBridge,
} from "@/components/notes/native-note-editor";
import { Button } from "@/components/ui/button";
import { FormHeader } from "@/components/ui/form";
import { InlineError } from "@/components/ui/states";
import { TextField } from "@/components/ui/text-field";
import { spacing } from "@/lib/theme";
import { isEventNoteLink } from "./event-note-editor-content";

const KNOWN_REFS: string[] = [];
const EVENT_DESCRIPTION_LIMIT = 4000;

export function EventNoteEditor({
  html,
  onCancel,
  onApply,
}: {
  html: string;
  onCancel: () => void;
  onApply: (html: string) => void;
}) {
  const editor = useRef<NoteEditorBridge>(null);
  const value = useRef(html);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fatalError, setFatalError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [link, setLink] = useState<string | null>(null);

  usePreventRemove(true, () => cancel());

  function cancel() {
    if (applying) return;
    if (link !== null) {
      setLink(null);
      return;
    }
    if (!dirty) return onCancel();
    Alert.alert("Buang perubahan catatan?", undefined, [
      { text: "Lanjut mengedit", style: "cancel" },
      { text: "Buang", style: "destructive", onPress: onCancel },
    ]);
  }

  async function apply() {
    const current = editor.current;
    if (!current || !ready || applying || fatalError) return;
    if (!dirty) return onCancel();
    setApplying(true);
    setSubmitError(undefined);
    try {
      await current.flush();
      if (value.current.length > EVENT_DESCRIPTION_LIMIT) {
        setSubmitError(
          "Catatan terlalu panjang. Persingkat teks atau format untuk menyimpan."
        );
        return;
      }
      onApply(value.current);
    } catch (error) {
      console.warn(
        "Could not read calendar description from editor",
        error instanceof Error ? error.name : "Unknown error"
      );
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Isi catatan tidak dapat disimpan."
      );
    } finally {
      setApplying(false);
    }
  }

  function applyLink(href: string | null) {
    if (href && !isEventNoteLink(href)) return;
    editor.current?.send({ type: "setLink", href });
    setLink(null);
  }

  return (
    <>
      <FormHeader
        title="Catatan acara"
        onCancel={cancel}
        onSave={() => void apply()}
        saveLabel="Terapkan"
        canSave={ready && !applying && !fatalError && link === null}
        saving={applying}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        {link !== null ? (
          <View style={styles.linkForm}>
            <TextField
              label="Alamat tautan"
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              value={link}
              onChangeText={setLink}
            />
            <View style={styles.linkActions}>
              <Button
                label="Batal"
                variant="ghost"
                onPress={() => setLink(null)}
              />
              <Button
                label="Hapus tautan"
                variant="ghost"
                onPress={() => applyLink(null)}
              />
              <Button
                label="Terapkan tautan"
                variant="secondary"
                disabled={!isEventNoteLink(link.trim())}
                onPress={() => applyLink(link.trim())}
              />
            </View>
          </View>
        ) : null}
        {fatalError || submitError ? (
          <View style={styles.notice}>
            <InlineError message={fatalError ?? submitError} />
          </View>
        ) : null}
        {!fatalError ? (
          <NativeNoteEditor
            ref={editor}
            init={{
              type: "init",
              content: null,
              html,
              editable: true,
              placeholder: "Tambahkan catatan acara",
              title: null,
              titlePlaceholder: "",
              heading: null,
              knownRefs: KNOWN_REFS,
              focus: null,
            }}
            knownRefs={KNOWN_REFS}
            editable
            onReady={() => setReady(true)}
            onDirty={() => setDirty(true)}
            onHtmlContent={(next) => {
              value.current = next;
            }}
            onError={setFatalError}
            onSetWebLink={(href) => setLink(href ?? "")}
          />
        ) : null}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  linkForm: { gap: spacing.sm, padding: spacing.md },
  linkActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  notice: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
