import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Ellipsis,
  ExternalLink,
  FileText,
  Pencil,
  RotateCcw,
  Share,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { openDocument, shareDocument } from "@/components/files/document-file";
import {
  fileKindLabel,
  formatSkippedImages,
  itemStatusLabel,
  visibleStructuredData,
} from "@/components/files/file-format";
import { FileThumbnail } from "@/components/files/file-thumbnail";
import { useAuthHeaders } from "@/components/files/use-auth-headers";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { FormHeader, FormScroll } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { localized } from "@/lib/i18n";
import type {
  Document,
  UpdateDocumentInput,
} from "@/lib/services/api/documents/documents.api";
import {
  documentQueryOptions,
  useDeleteDocument,
  useRetryDocument,
  useUpdateDocument,
} from "@/lib/services/api/documents/documents.queries";
import { spacing } from "@/lib/theme";
import { formatFileSize } from "@/lib/utils/format";

export default function DocumentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery(documentQueryOptions(id));
  const headers = useAuthHeaders();
  const showActions = useActionSheet();
  const toast = useToast();
  const retry = useRetryDocument();
  const remove = useDeleteDocument();
  const update = useUpdateDocument();
  const [editing, setEditing] = useState(false);
  const [fileAction, setFileAction] = useState<"open" | "share" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  if (query.isPending) return <LoadingState />;
  if (query.isError && !query.data)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );

  const document = query.data;
  const file = {
    id: document.id,
    title: document.title,
    mimeType: document.file.mimeType,
    size: document.file.size,
    originalName: document.file.originalName,
  };
  const skipped = document.structuredData?.skippedImageCount;
  const status = itemStatusLabel({ status: document.status, deleting: false });
  const details = visibleStructuredData(document.structuredData);

  async function handleFile(action: "open" | "share") {
    if (fileAction) return;
    setFileAction(action);
    setCopyError(null);
    try {
      if (action === "open") await openDocument(file);
      else await shareDocument(file);
    } catch (error) {
      console.warn("Native file action failed", {
        action,
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setCopyError(
        action === "open"
          ? localized(
              "File tidak dapat dibuka. Coba lagi atau gunakan Bagikan.",
              "Couldn't open the file. Try again or use Share."
            )
          : localized(
              "File tidak dapat dibagikan. Coba lagi.",
              "Couldn't share the file. Try again."
            )
      );
    } finally {
      setFileAction(null);
    }
  }

  function confirmDelete() {
    Alert.alert(
      localized("Hapus file ini permanen?", "Permanently delete this file?"),
      document.title,
      [
        { text: localized("Batal", "Cancel"), style: "cancel" },
        {
          text: localized("Hapus permanen", "Delete permanently"),
          style: "destructive",
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => {
                toast(localized("File dihapus.", "File deleted."));
                if (router.canGoBack()) router.back();
                else router.replace("/files");
              },
              onError: (error) => {
                console.warn("Document deletion failed", { name: error.name });
                Alert.alert(
                  localized(
                    "File tidak dapat dihapus",
                    "Couldn't delete the file"
                  ),
                  error.message
                );
              },
            }),
        },
      ]
    );
  }

  if (editing) {
    return (
      <DocumentEditor
        document={document}
        saving={update.isPending}
        error={update.error?.message}
        onCancel={() => setEditing(false)}
        onSave={(values) =>
          update.mutate(
            { documentId: id, values },
            {
              onSuccess: () => {
                setEditing(false);
                toast(localized("File diperbarui.", "File updated."));
              },
              onError: (error) =>
                console.warn("Document edit failed", { name: error.name }),
            }
          )
        }
      />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: localized("File", "File"),
          headerLeft: undefined,
          headerRight: () => (
            <IconButton
              icon={Ellipsis}
              accessibilityLabel={localized("Opsi file", "File options")}
              disabled={remove.isPending}
              onPress={() =>
                showActions({
                  options: [
                    {
                      label: localized("Ubah rincian", "Edit details"),
                      icon: Pencil,
                      onPress: () => {
                        update.reset();
                        setEditing(true);
                      },
                    },
                    {
                      label: localized("Hapus permanen", "Delete permanently"),
                      icon: Trash2,
                      destructive: true,
                      onPress: confirmDelete,
                    },
                  ],
                })
              }
            />
          ),
        }}
      />
      <FormScroll>
        {query.isError ? <InlineError message={query.error.message} /> : null}
        <View style={styles.identity}>
          <FileThumbnail
            kind="file"
            id={id}
            name={document.file.originalName}
            fileKind={document.file.kind}
            size={94}
            headers={headers}
          />
          <Text
            variant="title"
            accessibilityRole="header"
            style={styles.centered}
          >
            {document.title}
          </Text>
          <Text variant="footnote" tone="muted" style={styles.centered}>
            {fileKindLabel(document.file.kind)} ·{" "}
            {formatFileSize(document.file.size)}
          </Text>
          {document.status !== "ready" && status ? (
            <Badge label={status} />
          ) : null}
          <View style={styles.actions}>
            <Button
              icon={ExternalLink}
              label={localized("Buka", "Open")}
              loading={fileAction === "open"}
              disabled={fileAction === "share"}
              onPress={() => void handleFile("open")}
            />
            <Button
              icon={Share}
              variant="outline"
              label={localized("Bagikan", "Share")}
              loading={fileAction === "share"}
              disabled={fileAction === "open"}
              onPress={() => void handleFile("share")}
            />
          </View>
        </View>
        <InlineError message={copyError} />
        {document.status === "failed" ? (
          <View style={styles.section}>
            <InlineError
              message={
                retry.error?.message ??
                document.errorMessage ??
                localized(
                  "File gagal dianalisis.",
                  "The file couldn't be analyzed."
                )
              }
            />
            <Button
              label={localized("Coba proses lagi", "Retry analysis")}
              variant="outline"
              icon={RotateCcw}
              loading={retry.isPending}
              onPress={() =>
                retry.mutate(id, {
                  onError: (error) =>
                    console.warn("Document processing retry failed", {
                      name: error.name,
                    }),
                })
              }
            />
          </View>
        ) : null}
        <ContentSection
          title={localized("Deskripsi", "Description")}
          body={document.description}
        />
        {document.status === "ready" &&
        typeof skipped === "number" &&
        skipped > 0 ? (
          <Text variant="footnote" tone="muted">
            {localized(
              formatSkippedImages(skipped),
              `${skipped} images weren't analyzed`
            )}
          </Text>
        ) : null}
        <ContentSection
          title={localized("Transkrip", "Transcript")}
          body={document.transcript}
        />
        <ContentSection
          title={localized("Analisis gambar", "Image analysis")}
          body={document.imageDescription}
        />
        <ContentSection
          title={localized("Teks file", "Extracted text")}
          body={document.textContent}
        />
        {details.length > 0 ? (
          <ListSection
            title={localized("Rincian terdeteksi", "Detected details")}
          >
            {details.map(([label, value], index) => (
              <ListRow
                key={`${label}-${index}`}
                title={label}
                subtitle={value}
                titleLines={2}
              />
            ))}
          </ListSection>
        ) : null}
        {document.status === "ready" &&
        !document.description &&
        !document.transcript &&
        !document.imageDescription &&
        !document.textContent &&
        !details.length ? (
          <EmptyState
            icon={<FileText />}
            title={localized(
              "Tidak ada teks yang diekstrak",
              "No text was extracted"
            )}
          />
        ) : null}
      </FormScroll>
    </>
  );
}

function ContentSection({
  title,
  body,
}: {
  title: string;
  body: string | null;
}) {
  if (!body) return null;

  return (
    <View style={styles.section}>
      <Text variant="callout" weight="semibold" accessibilityRole="header">
        {title}
      </Text>
      <Text selectable>{body}</Text>
    </View>
  );
}

function DocumentEditor({
  document,
  saving,
  error,
  onCancel,
  onSave,
}: {
  document: Document;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (values: UpdateDocumentInput) => void;
}) {
  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description ?? "");
  const canSave =
    Boolean(title.trim()) &&
    (title.trim() !== document.title ||
      description.trim() !== (document.description ?? "")) &&
    !saving;

  return (
    <>
      <FormHeader
        title={localized("Ubah file", "Edit file")}
        onCancel={onCancel}
        saveLabel={localized("Simpan", "Save")}
        onSave={() =>
          onSave({
            title: title.trim(),
            description: description.trim() || null,
          })
        }
        canSave={canSave}
        saving={saving}
      />
      <FormScroll>
        <InlineError message={error} />
        <TextField
          label={localized("Nama file", "File name")}
          value={title}
          onChangeText={setTitle}
          editable={!saving}
          maxLength={120}
        />
        <TextField
          label={localized("Deskripsi", "Description")}
          value={description}
          onChangeText={setDescription}
          editable={!saving}
          maxLength={1000}
          multiline
        />
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  centered: { textAlign: "center" },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  section: { gap: spacing.sm },
});
