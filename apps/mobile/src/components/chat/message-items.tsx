import { useRouter, type Href } from "expo-router";
import {
  FileText,
  Folder,
  NotebookPen,
  RotateCcw,
  TriangleAlert,
} from "lucide-react-native";
import { Fragment } from "react";
import { Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import { Markdown } from "@/components/markdown/markdown";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import type {
  AssistantActivity,
  AssistantRun,
  ChatSegment,
  ChatSource,
  ConversationMessage,
} from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { colors, radius, spacing } from "@/lib/theme";
import { formatFileSize } from "@/lib/utils/format";
import { AuroraOrb } from "./aurora-orb";
import type { ChatEntity, EntityCollection } from "./chat-entities";
import type { DocumentSource } from "./chat-timeline";
import { EntityPill } from "./entity-pill";

export function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.day} accessibilityRole="header">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function sourceHref(source: ChatSource): Href {
  if (source.kind === "file")
    return { pathname: "/document/[id]", params: { id: source.id } };
  if (source.kind === "folder")
    return { pathname: "/files/[folderId]", params: { folderId: source.id } };

  return { pathname: "/note/[ref]", params: { ref: source.id } };
}

const SOURCE_ICONS = {
  file: FileText,
  folder: Folder,
  note: NotebookPen,
} as const;

function SegmentText({ segments }: { segments: ChatSegment[] }) {
  const router = useRouter();

  return (
    <NativeText style={styles.userText}>
      {segments.map((segment, index) => {
        if (segment.type === "text")
          return <Fragment key={index}>{segment.text}</Fragment>;
        const Icon = SOURCE_ICONS[segment.source.kind];

        return (
          <NativeText
            key={index}
            accessibilityRole="button"
            onPress={() => router.push(sourceHref(segment.source))}
            style={styles.sourceChip}
          >
            {" "}
            <View style={styles.sourceIcon}>
              <Icon size={13} color={colors.foreground} strokeWidth={2} />
            </View>
            {` ${segment.source.label} `}
          </NativeText>
        );
      })}
    </NativeText>
  );
}

interface UserMessageProps {
  content: string;
  segments?: ChatSegment[] | null;
  attachments?: ConversationMessage["attachments"];
  attachmentCount?: number;
  createdAt?: string;
  pending?: boolean;
  locale: SupportedLocale;
  onLongPress?: () => void;
}

export function UserMessage({
  content,
  segments,
  attachments = [],
  attachmentCount = 0,
  createdAt,
  pending = false,
  locale,
  onLongPress,
}: UserMessageProps) {
  return (
    <View style={styles.userRow}>
      <Pressable
        accessibilityLabel={
          pending
            ? locale === "en"
              ? "Your message is being sent"
              : "Pesan Anda sedang dikirim"
            : locale === "en"
              ? "Your message"
              : "Pesan Anda"
        }
        onLongPress={onLongPress}
        delayLongPress={350}
        style={[styles.userBubble, pending && styles.pending]}
      >
        {segments?.length ? (
          <SegmentText segments={segments} />
        ) : (
          <NativeText style={styles.userText}>{content}</NativeText>
        )}
        {attachments.length ? (
          <View style={styles.attachments}>
            {attachments.map(({ fileAsset }) => {
              const name = fileAsset.document?.title ?? fileAsset.originalName;

              return (
                <View key={fileAsset.id} style={styles.attachmentRow}>
                  {fileAsset.document?.id ? (
                    <EntityPill
                      entity={{
                        kind: "file",
                        id: fileAsset.document.id,
                        title: name,
                        mimeType: fileAsset.mimeType,
                        size: fileAsset.size,
                        mutation: false,
                        observedAt: createdAt ?? "",
                      }}
                      locale={locale}
                    />
                  ) : (
                    <View style={styles.plainAttachment}>
                      <FileText
                        size={15}
                        color={colors.mutedForeground}
                        strokeWidth={1.75}
                      />
                      <Text
                        variant="footnote"
                        weight="medium"
                        numberOfLines={1}
                        style={styles.flexShrink}
                      >
                        {name}
                      </Text>
                    </View>
                  )}
                  <Text variant="mono" tone="muted" style={styles.size}>
                    {formatFileSize(fileAsset.size)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : attachmentCount ? (
          <View style={styles.attachmentCount}>
            <FileText
              size={14}
              color={colors.mutedForeground}
              strokeWidth={1.75}
            />
            <Text variant="footnote" tone="muted">
              {attachmentCount} {locale === "en" ? "attachments" : "lampiran"}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

interface AssistantMessageProps {
  content: string;
  collection?: EntityCollection;
  sources: DocumentSource[];
  locale: SupportedLocale;
  createdAt: string;
  onLongPress?: () => void;
}

export function AssistantMessage({
  content,
  collection,
  sources,
  locale,
  createdAt,
  onLongPress,
}: AssistantMessageProps) {
  return (
    <Pressable
      accessibilityLabel={locale === "en" ? "Sydia answer" : "Jawaban Sydia"}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={styles.assistant}
    >
      <Markdown
        content={content}
        entities={collection?.entities}
        locale={locale}
      />
      {sources.length ? (
        <View
          style={styles.sources}
          accessibilityLabel={
            locale === "en" ? "Answer sources" : "Sumber jawaban"
          }
        >
          <Text variant="footnote" weight="bold">
            {locale === "en" ? "Sources" : "Sumber"}
          </Text>
          {sources.map((source) => (
            <View key={source.documentId} style={styles.source}>
              <View style={styles.sourceLine}>
                <EntityPill
                  entity={{
                    kind: "file",
                    id: source.documentId,
                    title: source.documentName,
                    mutation: false,
                    observedAt: createdAt,
                  }}
                  locale={locale}
                />
                {source.locations.length ? (
                  <Text
                    variant="footnote"
                    tone="muted"
                    style={styles.flexShrink}
                  >
                    {source.locations.join(", ")}
                  </Text>
                ) : null}
              </View>
              {source.excerpts[0] ? (
                <Text variant="footnote" tone="muted" numberOfLines={2}>
                  {source.excerpts[0]}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {collection?.diagnostics.length ? (
        <Text variant="footnote" tone="destructive" accessibilityRole="text">
          {locale === "en"
            ? "Some item references could not be displayed. Open the relevant page to check them."
            : "Sebagian referensi item tidak dapat ditampilkan. Buka halaman terkait untuk memeriksanya."}
        </Text>
      ) : null}
    </Pressable>
  );
}

interface PendingAnswerProps {
  activity?: AssistantActivity;
  streamedText?: string;
  entities?: ChatEntity[];
  locale: SupportedLocale;
}

export function PendingAnswer({
  activity,
  streamedText,
  entities,
  locale,
}: PendingAnswerProps) {
  if (streamedText)
    return (
      <View
        style={styles.assistant}
        accessibilityLabel={locale === "en" ? "Sydia answer" : "Jawaban Sydia"}
      >
        <Markdown
          content={streamedText}
          entities={entities}
          appendUnmentioned={false}
          locale={locale}
        />
      </View>
    );

  return (
    <View
      style={styles.activity}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
    >
      <AuroraOrb />
      <Text variant="callout" tone="muted" style={styles.flexShrink}>
        {activity?.label ??
          (locale === "en"
            ? "Sydia is preparing an answer…"
            : "Sydia sedang menyiapkan jawaban…")}
      </Text>
    </View>
  );
}

interface FailedRunProps {
  run: AssistantRun;
  isRetrying: boolean;
  retryErrorMessage?: string;
  onRetry: (runId: string) => void;
  locale: SupportedLocale;
}

export function FailedRun({
  run,
  isRetrying,
  retryErrorMessage,
  onRetry,
  locale,
}: FailedRunProps) {
  const copy =
    locale === "en"
      ? {
          title: "The answer could not be created",
          body: "Your message was saved. Try the answer again without sending the same message.",
          retrying: "Trying again…",
          retry: "Try the answer again",
        }
      : {
          title: "Jawaban belum berhasil dibuat",
          body: "Pesan Anda sudah tersimpan. Coba ulangi jawaban tanpa mengirim pesan yang sama lagi.",
          retrying: "Mencoba lagi…",
          retry: "Coba jawaban lagi",
        };

  return (
    <View style={styles.failed} accessibilityRole="alert">
      <TriangleAlert size={20} color={colors.destructive} strokeWidth={1.75} />
      <View style={styles.failedBody}>
        <Text variant="callout" weight="bold">
          {copy.title}
        </Text>
        <Text variant="footnote" tone="muted">
          {copy.body}
        </Text>
        {retryErrorMessage ? (
          <Text variant="footnote" tone="destructive">
            {retryErrorMessage}
          </Text>
        ) : null}
        <Button
          label={isRetrying ? copy.retrying : copy.retry}
          icon={RotateCcw}
          variant="outline"
          size="sm"
          loading={isRetrying}
          onPress={() => onRetry(run.id)}
          style={styles.retry}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  day: { alignItems: "center", paddingVertical: spacing.md },
  userRow: { alignItems: "flex-end" },
  userBubble: {
    maxWidth: "86%",
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pending: { opacity: 0.7 },
  userText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.foreground,
  },
  sourceChip: {
    fontFamily: fonts.medium,
    fontSize: 15,
    backgroundColor: colors.card,
    color: colors.foreground,
  },
  sourceIcon: { width: 13, height: 13, marginBottom: -1 },
  attachments: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.input,
    gap: spacing.sm,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  plainAttachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  size: { fontSize: 11 },
  attachmentCount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  flexShrink: { flexShrink: 1 },
  assistant: { gap: spacing.md, paddingRight: spacing.lg },
  sources: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.muted,
    gap: spacing.sm,
  },
  source: { gap: spacing.xs },
  sourceLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  failed: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.3)",
  },
  failedBody: { flex: 1, gap: spacing.xs },
  retry: { marginTop: spacing.sm },
});
