import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowUp,
  Camera,
  FileAudio,
  FileImage,
  FileText,
  Folder,
  NotebookPen,
  Image as ImageIcon,
  Paperclip,
  RotateCcw,
  X,
} from "lucide-react-native";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import type {
  ChatSource,
  SendMessageVariables,
} from "@/lib/services/api/conversations/conversations.api";
import type { LocalUploadFile } from "@/lib/services/api/documents/documents.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { colors, radius, shadows, spacing } from "@/lib/theme";
import { createId } from "@/lib/utils/id";
import { ChatSourcePicker } from "./chat-source-picker";
import { composerSourceSegments } from "./composer-sources";
import {
  useChatAttachments,
  type ComposerAttachment,
} from "./use-chat-attachments";

const MAX_INPUT_HEIGHT = 6 * 24 + 20;

interface ChatComposerProps {
  conversationId?: string;
  initialDraft?: string;
  initialAttachmentId?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  isSending: boolean;
  errorMessage?: string;
  locale: SupportedLocale;
  /** Safe-area space under the composer when the keyboard is closed. */
  bottomInset: number;
  onDraftChange?: () => void;
  /** Resolves when the message is accepted; rejects to keep the draft. */
  onSend: (values: SendMessageVariables) => Promise<void>;
}

function AttachmentChip({
  attachment,
  locale,
  onRemove,
  onRetry,
}: {
  attachment: ComposerAttachment;
  locale: SupportedLocale;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const Icon =
    attachment.kind === "image"
      ? FileImage
      : attachment.kind === "audio"
        ? FileAudio
        : FileText;
  const status =
    attachment.status === "uploading"
      ? `${locale === "en" ? "Uploading" : "Mengunggah"}${
          attachment.progress !== undefined
            ? ` ${Math.round(attachment.progress * 100)}%`
            : "…"
        }`
      : attachment.status === "queued"
        ? locale === "en"
          ? "Waiting…"
          : "Menunggu…"
        : attachment.status === "processing"
          ? locale === "en"
            ? "Processing…"
            : "Memproses…"
          : attachment.status === "error"
            ? (attachment.errorMessage ??
              (locale === "en" ? "Upload failed" : "Gagal diunggah"))
            : attachment.skippedImageCount
              ? locale === "en"
                ? `${attachment.skippedImageCount} images skipped`
                : `${attachment.skippedImageCount} gambar tidak dianalisis`
              : locale === "en"
                ? "Ready"
                : "Siap";
  const busy =
    attachment.status === "uploading" ||
    attachment.status === "processing" ||
    attachment.status === "queued";

  return (
    <View
      style={[styles.chip, attachment.status === "error" && styles.chipError]}
      accessibilityLabel={`${attachment.name}, ${status}`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Icon
          size={16}
          color={
            attachment.status === "error"
              ? colors.destructive
              : colors.foreground
          }
          strokeWidth={1.75}
        />
      )}
      <View style={styles.chipText}>
        <Text variant="footnote" weight="medium" numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text
          variant="caption"
          tone={attachment.status === "error" ? "destructive" : "muted"}
          numberOfLines={1}
        >
          {status}
        </Text>
      </View>
      {attachment.status === "error" && attachment.file ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            locale === "en" ? "Retry upload" : "Coba unggah lagi"
          }
          hitSlop={8}
          onPress={onRetry}
        >
          <RotateCcw size={16} color={colors.foreground} strokeWidth={2} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          locale === "en"
            ? `Remove ${attachment.name}`
            : `Hapus ${attachment.name}`
        }
        hitSlop={8}
        onPress={onRemove}
      >
        <X size={16} color={colors.mutedForeground} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function fromPickerAsset(asset: ImagePicker.ImagePickerAsset): LocalUploadFile {
  const extension = asset.mimeType?.split("/")[1] ?? "jpg";

  return {
    uri: asset.uri,
    name:
      asset.fileName ??
      `foto-${Date.now()}.${extension === "jpeg" ? "jpg" : extension}`,
    mimeType: asset.mimeType ?? "image/jpeg",
    size: asset.fileSize ?? null,
  };
}

export function ChatComposer({
  conversationId,
  initialDraft,
  initialAttachmentId,
  autoFocus = false,
  disabled = false,
  disabledReason,
  isSending,
  errorMessage,
  locale,
  bottomInset,
  onDraftChange,
  onSend,
}: ChatComposerProps) {
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [sourcePicker, setSourcePicker] = useState<"files" | "notes">();
  const [content, setContent] = useState(initialDraft ?? "");
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const inputRef = useRef<TextInputInstance>(null);
  const submittingRef = useRef(false);
  const lastSubmission = useRef<
    { signature: string; idempotencyKey: string } | undefined
  >(undefined);
  const showActions = useActionSheet();
  const attachmentState = useChatAttachments({
    conversationId,
    initialAttachmentId,
    locale,
  });
  const { attachments, readyIds, hasPending } = attachmentState;

  const normalized = content.trim();
  const busy = disabled || isSending || submitting;
  const canSend =
    Boolean(normalized || readyIds.length || sources.length) &&
    !hasPending &&
    !busy;

  function permissionAlert(kind: "camera" | "photos") {
    Alert.alert(
      kind === "camera"
        ? locale === "en"
          ? "Camera access needed"
          : "Izin kamera diperlukan"
        : locale === "en"
          ? "Photo access needed"
          : "Izin foto diperlukan",
      locale === "en"
        ? "Allow access in Settings to attach it to your message."
        : "Izinkan akses di Pengaturan agar bisa dilampirkan ke pesan.",
      [
        { text: locale === "en" ? "Cancel" : "Batal", style: "cancel" },
        {
          text: locale === "en" ? "Open Settings" : "Buka Pengaturan",
          onPress: () => void Linking.openSettings(),
        },
      ]
    );
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      permissionAlert("camera");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled)
      void attachmentState.addFiles(result.assets.map(fromPickerAsset));
  }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.85,
    });
    if (!result.canceled)
      void attachmentState.addFiles(result.assets.map(fromPickerAsset));
  }

  async function pickDocuments() {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    void attachmentState.addFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        size: asset.size ?? null,
      }))
    );
  }

  function run(task: () => Promise<void>, label: string) {
    task().catch((error: unknown) => {
      console.warn(`Attachment picker failed: ${label}`, error);
      setSubmissionError(
        locale === "en"
          ? "Could not open the attachment picker."
          : "Pemilih lampiran tidak dapat dibuka."
      );
    });
  }

  function chooseAttachment() {
    showActions({
      title: locale === "en" ? "Add to message" : "Tambahkan ke pesan",
      options: [
        {
          label: locale === "en" ? "Camera" : "Kamera",
          icon: Camera,
          onPress: () => run(takePhoto, "camera"),
        },
        {
          label: locale === "en" ? "Photos" : "Foto",
          icon: ImageIcon,
          onPress: () => run(pickPhotos, "photos"),
        },
        {
          label: locale === "en" ? "Document" : "Dokumen",
          icon: FileText,
          onPress: () => run(pickDocuments, "documents"),
        },
        {
          label:
            locale === "en"
              ? "Saved files and folders"
              : "File dan folder tersimpan",
          icon: Folder,
          onPress: () => setSourcePicker("files"),
        },
        {
          label: locale === "en" ? "Saved notes" : "Catatan tersimpan",
          icon: NotebookPen,
          onPress: () => setSourcePicker("notes"),
        },
      ],
      cancelLabel: locale === "en" ? "Cancel" : "Batal",
    });
  }

  async function submit() {
    if (!canSend || submittingRef.current) return;
    const submittedContent =
      normalized ||
      (sources.length
        ? locale === "en"
          ? "Use these sources for this conversation."
          : "Gunakan sumber ini untuk percakapan."
        : locale === "en"
          ? `Use the ${readyIds.length === 1 ? "attached file" : `${readyIds.length} attached files`} for this.`
          : `Gunakan ${readyIds.length === 1 ? "file terlampir" : `${readyIds.length} file terlampir`} ini.`);
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError(undefined);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Resending the same draft reuses its key, so a retry never duplicates it.
    const sourceSegments = composerSourceSegments(submittedContent, sources);
    const signature = JSON.stringify([
      submittedContent,
      readyIds,
      sourceSegments,
    ]);
    const idempotencyKey =
      lastSubmission.current?.signature === signature
        ? lastSubmission.current.idempotencyKey
        : createId();
    lastSubmission.current = { signature, idempotencyKey };

    try {
      await onSend({
        conversationId,
        content: submittedContent,
        idempotencyKey,
        attachmentIds: readyIds,
        sourceSegments,
      });
      setContent("");
      setSources([]);
      attachmentState.clearSent();
      lastSubmission.current = undefined;
    } catch (error) {
      console.warn("Chat submission failed; composer draft retained", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setSubmissionError(
        error instanceof Error && error.message
          ? error.message
          : locale === "en"
            ? "Message could not be sent. Your draft is kept."
            : "Pesan belum terkirim. Draf Anda tetap tersimpan."
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const notice =
    submissionError ??
    errorMessage ??
    attachmentState.discardError ??
    disabledReason;
  const noticeIsError = Boolean(
    submissionError ?? errorMessage ?? attachmentState.discardError
  );

  return (
    <View style={[styles.area, { paddingBottom: bottomInset + spacing.sm }]}>
      {attachments.length || sources.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
        >
          {sources.map((source) => (
            <View key={`${source.kind}:${source.id}`} style={styles.chip}>
              <Text
                variant="footnote"
                numberOfLines={1}
                style={styles.chipText}
              >
                {source.label}
              </Text>
              <IconButton
                icon={X}
                size={32}
                accessibilityLabel={`${locale === "en" ? "Remove" : "Hapus"} ${source.label}`}
                disabled={busy}
                onPress={() =>
                  setSources((items) => items.filter((item) => item !== source))
                }
              />
            </View>
          ))}
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.localId}
              attachment={attachment}
              locale={locale}
              onRemove={() => attachmentState.remove(attachment.localId)}
              onRetry={() => attachmentState.retry(attachment.localId)}
            />
          ))}
        </ScrollView>
      ) : null}
      {notice ? (
        <Text
          variant="footnote"
          tone={noticeIsError ? "destructive" : "muted"}
          accessibilityRole={noticeIsError ? "alert" : "text"}
          style={styles.notice}
        >
          {notice}
        </Text>
      ) : null}
      <View style={[styles.shell, focused && styles.shellFocused]}>
        <IconButton
          icon={Paperclip}
          accessibilityLabel={
            locale === "en" ? "Attach a file" : "Lampirkan file"
          }
          size={40}
          iconSize={20}
          color={colors.mutedForeground}
          disabled={busy}
          onPress={chooseAttachment}
        />
        <TextInput
          ref={inputRef}
          value={content}
          onChangeText={(text) => {
            setContent(text);
            setSubmissionError(undefined);
            onDraftChange?.();
          }}
          autoFocus={autoFocus}
          multiline
          editable={!disabled}
          placeholder={locale === "en" ? "Ask Sydia…" : "Tanya Sydia…"}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          accessibilityLabel={locale === "en" ? "Message" : "Pesan"}
          accessibilityHint={disabledReason}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { maxHeight: MAX_INPUT_HEIGHT }]}
        />
        <IconButton
          icon={ArrowUp}
          variant="primary"
          size={40}
          iconSize={20}
          accessibilityLabel={locale === "en" ? "Send message" : "Kirim pesan"}
          disabled={!canSend}
          onPress={() => void submit()}
        />
      </View>
      {sourcePicker ? (
        <ChatSourcePicker
          kind={sourcePicker}
          selected={sources}
          locale={locale}
          onSelect={(source) => {
            setSources((items) => [...items, source]);
            setSubmissionError(undefined);
            onDraftChange?.();
          }}
          onClose={() => setSourcePicker(undefined)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 260,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipError: { borderColor: "rgba(220, 38, 38, 0.3)" },
  chipText: { flexShrink: 1, minWidth: 80 },
  notice: { paddingHorizontal: spacing.sm },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    boxShadow: shadows.card,
  },
  shellFocused: { borderColor: colors.accent, boxShadow: shadows.button },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.xs,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.foreground,
  },
});
