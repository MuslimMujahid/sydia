import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import {
  Copy,
  EllipsisVertical,
  History,
  LayoutGrid,
  Share2,
  SquarePen,
  TextSelect,
  Trash2,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatComposer } from "@/components/chat/chat-composer";
import {
  collectChatEntities,
  type EntityCollection,
} from "@/components/chat/chat-entities";
import {
  buildTimeline,
  currentActivity,
  documentSources,
  invocationsByRun,
  queuedActivity,
  type TimelineEntry,
} from "@/components/chat/chat-timeline";
import {
  AssistantMessage,
  DaySeparator,
  FailedRun,
  PendingAnswer,
  UserMessage,
} from "@/components/chat/message-items";
import { SelectableTextModal } from "@/components/chat/selectable-text-modal";
import { useKeyboardVisible } from "@/components/chat/use-keyboard-visible";
import { markdownToPlainText } from "@/components/markdown/markdown-model";
import { useActionSheet } from "@/components/ui/action-sheet";
import { IconButton } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { ChatSparkGlyph } from "@/components/ui/glyphs";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import type {
  AssistantActivity,
  ConversationMessage,
  SendMessageResult,
  SendMessageVariables,
} from "@/lib/services/api/conversations/conversations.api";
import {
  conversationQueryOptions,
  useDeleteConversation,
  useRetryAssistantRun,
  useSendConversationMessage,
} from "@/lib/services/api/conversations/conversations.queries";
import { colors, radius, spacing } from "@/lib/theme";
import { dayKeyInZone, formatConversationDay } from "@/lib/utils/date-time";

type Row =
  | TimelineEntry
  | {
      type: "optimistic";
      key: string;
      values: SendMessageVariables;
    }
  | { type: "pending"; key: string };

type Params = { id: string; draft?: string; attachment?: string };

function ThreadSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Memuat percakapan">
      <Skeleton width={96} height={14} />
      <Skeleton width="82%" height={14} />
      <Skeleton width="64%" height={14} />
      <View style={styles.skeletonBubble}>
        <Skeleton width="100%" height={14} />
        <Skeleton width="60%" height={14} />
      </View>
    </View>
  );
}

interface ConversationScreenProps {
  /**
   * The app's root screen: it owns the feature menu button and starts each
   * new conversation in place instead of stacking another screen.
   */
  home?: boolean;
}

/** One conversation thread; `id: "new"` (or no id) starts an empty one. */
export function ConversationScreen({ home = false }: ConversationScreenProps) {
  const params = useLocalSearchParams<Params>();
  const conversationId =
    params.id && params.id !== "new" ? params.id : undefined;
  const router = useRouter();
  const navigation = useNavigation();
  const { timezone, locale } = useProfile();
  const showActions = useActionSheet();
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  const conversationQuery = useQuery({
    ...conversationQueryOptions(conversationId ?? ""),
    enabled: Boolean(conversationId),
  });

  const [streamedActivity, setStreamedActivity] = useState<AssistantActivity>();
  const [streamedText, setStreamedText] = useState("");
  const [streamCompleted, setStreamCompleted] = useState(false);
  const [turnReceived, setTurnReceived] = useState(false);
  const [selectableText, setSelectableText] = useState<string | null>(null);
  const acceptedTurn = useRef<SendMessageResult | undefined>(undefined);
  const lastSendKey = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const pendingDelta = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  const sendMutation = useSendConversationMessage({
    onActivity: (activity) => {
      if (mounted.current) setStreamedActivity(activity);
    },
    onTextDelta: (delta) => {
      // Batch token deltas so long answers do not re-render per token.
      pendingDelta.current += delta;
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = undefined;
        const chunk = pendingDelta.current;
        pendingDelta.current = "";
        if (mounted.current) setStreamedText((text) => text + chunk);
      }, 50);
    },
    onTurn: (result) => {
      acceptedTurn.current = result;
      // The request keeps running after the user leaves; only this screen's
      // own state and route params stop updating.
      if (!mounted.current) return;
      setTurnReceived(true);
      // A new conversation takes its real id without remounting the thread.
      navigation.setParams({
        id: result.conversation.id,
        draft: undefined,
        attachment: undefined,
      } as never);
      if (
        result.assistantRun.status === "completed" ||
        result.assistantRun.status === "failed"
      )
        setStreamCompleted(true);
    },
  });
  const retryMutation = useRetryAssistantRun();
  const deleteMutation = useDeleteConversation();

  const detail = conversationQuery.data;
  const messages = useMemo(() => detail?.messages ?? [], [detail]);
  const assistantRuns = useMemo(() => detail?.assistantRuns ?? [], [detail]);
  const toolInvocations = useMemo(
    () => detail?.toolInvocations ?? [],
    [detail]
  );

  const toolsByRun = useMemo(
    () => invocationsByRun(toolInvocations),
    [toolInvocations]
  );
  const entitiesByRun = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(toolsByRun).map(([runId, invocations]) => [
          runId,
          collectChatEntities(invocations),
        ])
      ) as Record<string, EntityCollection>,
    [toolsByRun]
  );
  const runsByMessageId = useMemo(
    () =>
      Object.fromEntries(
        assistantRuns.flatMap((run) =>
          run.assistantMessageId ? [[run.assistantMessageId, run] as const] : []
        )
      ),
    [assistantRuns]
  );

  useEffect(() => {
    for (const collection of Object.values(entitiesByRun))
      for (const diagnostic of collection.diagnostics)
        console.warn("Chat entity reference could not be rendered", diagnostic);
  }, [entitiesByRun]);

  const { entries, lastDayKey } = useMemo(
    () => buildTimeline(messages, assistantRuns, timezone, locale),
    [messages, assistantRuns, timezone, locale]
  );

  const hasActiveRun = assistantRuns.some(
    (run) => run.status === "queued" || run.status === "running"
  );
  const isSending = sendMutation.isPending;
  const streaming = isSending && !streamCompleted;
  const optimisticValues =
    isSending && !turnReceived ? sendMutation.variables?.values : undefined;

  const rows = useMemo(() => {
    const list: Row[] = [...entries];

    if (optimisticValues) {
      // A message still sending belongs to today, which may be a new day.
      const now = new Date();
      const today = dayKeyInZone(now, timezone);
      if (today && today !== lastDayKey)
        list.push({
          type: "day",
          key: `day-${today}`,
          dayKey: today,
          label: formatConversationDay(now, timezone, locale, now),
        });
      list.push({
        type: "optimistic",
        key: "optimistic",
        values: optimisticValues,
      });
      list.push({ type: "pending", key: "pending" });
    }

    return list.reverse();
  }, [entries, optimisticValues, lastDayKey, timezone, locale]);

  async function handleSend(values: SendMessageVariables) {
    setStreamedText("");
    pendingDelta.current = "";
    setStreamCompleted(false);
    setTurnReceived(false);
    setStreamedActivity(queuedActivity(locale));
    const previous = acceptedTurn.current;
    // Resending a draft whose answer failed retries that answer instead of
    // saving the same message twice.
    const retryAccepted =
      lastSendKey.current === values.idempotencyKey &&
      previous?.assistantRun.status === "failed";

    lastSendKey.current = values.idempotencyKey;
    if (!retryAccepted) acceptedTurn.current = undefined;
    const result =
      retryAccepted && previous
        ? await retryMutation.mutateAsync({
            conversationId: previous.conversation.id,
            runId: previous.assistantRun.id,
          })
        : await sendMutation.mutateAsync({ values });

    if (result.assistantRun.status === "failed")
      throw new Error(
        result.assistantRun.errorMessage ||
          (locale === "en"
            ? "The response failed. Your draft is kept."
            : "Jawaban gagal. Draf Anda tetap tersimpan.")
      );
  }

  function handleRetry(runId: string) {
    if (!conversationId) return;
    retryMutation.reset();
    retryMutation.mutate({ conversationId, runId });
  }

  function messageActions(text: string) {
    showActions({
      options: [
        {
          label: locale === "en" ? "Copy" : "Salin",
          icon: Copy,
          onPress: () => {
            void Clipboard.setStringAsync(text).then(() =>
              toast(locale === "en" ? "Copied" : "Disalin")
            );
          },
        },
        {
          label: locale === "en" ? "Select text" : "Pilih teks",
          icon: TextSelect,
          onPress: () => setSelectableText(text),
        },
        {
          label: locale === "en" ? "Share" : "Bagikan",
          icon: Share2,
          onPress: () => {
            Share.share({ message: text }).catch((error: unknown) =>
              console.warn("Message could not be shared", error)
            );
          },
        },
      ],
      cancelLabel: locale === "en" ? "Cancel" : "Batal",
    });
  }

  function confirmDelete() {
    if (!conversationId) return;
    Alert.alert(
      locale === "en" ? "Delete this conversation?" : "Hapus percakapan ini?",
      locale === "en"
        ? "Messages in it will be removed. Tasks, reminders, and notes Sydia made stay."
        : "Pesan di dalamnya akan dihapus. Tugas, pengingat, dan catatan yang dibuat Sydia tetap ada.",
      [
        { text: locale === "en" ? "Cancel" : "Batal", style: "cancel" },
        {
          text: locale === "en" ? "Delete" : "Hapus",
          style: "destructive",
          onPress: () => {
            deleteMutation
              .mutateAsync(conversationId)
              .then(() => {
                toast(
                  locale === "en"
                    ? "Conversation deleted"
                    : "Percakapan dihapus"
                );
                if (router.canGoBack()) router.back();
                else router.replace("/");
              })
              .catch((error: unknown) =>
                toast(
                  error instanceof Error
                    ? error.message
                    : locale === "en"
                      ? "Conversation could not be deleted."
                      : "Percakapan tidak dapat dihapus.",
                  { tone: "error" }
                )
              );
          },
        },
      ]
    );
  }

  function startNewConversation() {
    if (home) router.replace("/");
    else router.replace({ pathname: "/chat/[id]", params: { id: "new" } });
  }

  const historyLabel =
    locale === "en" ? "Conversation history" : "Riwayat percakapan";
  const menuItems = [
    {
      label: locale === "en" ? "History" : "Riwayat",
      icon: History,
      onPress: () => router.push("/history"),
    },
    ...(conversationId
      ? [
          {
            label: locale === "en" ? "Delete" : "Hapus",
            icon: Trash2,
            destructive: true,
            onPress: confirmDelete,
          },
        ]
      : []),
  ];

  // A new, empty conversation shows no title.
  const title =
    detail?.conversation.title?.trim() ||
    (conversationId ? (locale === "en" ? "Conversation" : "Percakapan") : "");

  const composerDisabled =
    hasActiveRun ||
    Boolean(
      conversationId &&
      (conversationQuery.isPending || conversationQuery.isError)
    );
  const disabledReason = hasActiveRun
    ? locale === "en"
      ? "Wait for Sydia to finish this answer."
      : "Tunggu hingga Sydia menyelesaikan jawaban ini."
    : conversationId && conversationQuery.isPending
      ? locale === "en"
        ? "Wait for the conversation to finish loading."
        : "Tunggu hingga percakapan selesai dimuat."
      : conversationId && conversationQuery.isError
        ? locale === "en"
          ? "Reload the conversation before sending a message."
          : "Muat ulang percakapan sebelum mengirim pesan."
        : undefined;

  function renderRow(row: Row) {
    switch (row.type) {
      case "day":
        return <DaySeparator label={row.label} />;
      case "optimistic":
        return (
          <UserMessage
            content={row.values.content}
            segments={row.values.sourceSegments}
            attachmentCount={row.values.attachmentIds?.length ?? 0}
            pending
            locale={locale}
          />
        );
      case "pending":
        return (
          <PendingAnswer
            activity={streamedActivity}
            streamedText={streamedText}
            locale={locale}
          />
        );
      case "run": {
        const { run } = row;

        if (run.status === "failed")
          return (
            <FailedRun
              run={run}
              isRetrying={
                retryMutation.isPending &&
                retryMutation.variables?.runId === run.id
              }
              retryErrorMessage={
                retryMutation.isError &&
                retryMutation.variables?.runId === run.id
                  ? retryMutation.error.message
                  : undefined
              }
              onRetry={handleRetry}
              locale={locale}
            />
          );

        if (run.status === "queued" || run.status === "running")
          return (
            <PendingAnswer
              activity={
                (streaming ? streamedActivity : undefined) ??
                currentActivity(run, toolsByRun[run.id] ?? [], locale)
              }
              streamedText={streaming ? streamedText : undefined}
              entities={entitiesByRun[run.id]?.entities}
              locale={locale}
            />
          );

        return null;
      }
      case "message":
        return renderMessage(row.message);
    }
  }

  function renderMessage(message: ConversationMessage) {
    if (message.role === "user") {
      const text = message.sourceSegments?.length
        ? message.sourceSegments
            .map((segment) =>
              segment.type === "text" ? segment.text : segment.source.label
            )
            .join("")
        : message.content;

      return (
        <UserMessage
          content={message.content}
          segments={message.sourceSegments}
          attachments={message.attachments}
          createdAt={message.createdAt}
          locale={locale}
          onLongPress={() => messageActions(text)}
        />
      );
    }

    const run = runsByMessageId[message.id];

    return (
      <AssistantMessage
        content={message.content}
        collection={run ? entitiesByRun[run.id] : undefined}
        sources={run ? documentSources(toolsByRun[run.id] ?? [], locale) : []}
        locale={locale}
        createdAt={message.createdAt}
        onLongPress={() => messageActions(markdownToPlainText(message.content))}
      />
    );
  }

  const isEmpty = !conversationId && !rows.length;

  let body;

  if (conversationId && conversationQuery.isPending) body = <ThreadSkeleton />;
  else if (conversationId && conversationQuery.isError)
    body = (
      <ErrorState
        title={
          locale === "en"
            ? "Conversation could not be loaded"
            : "Percakapan tidak dapat dimuat"
        }
        message={conversationQuery.error.message}
        retryLabel={locale === "en" ? "Try again" : "Coba lagi"}
        onRetry={() => void conversationQuery.refetch()}
      />
    );
  else if (!rows.length)
    body = (
      <View style={styles.empty}>
        <ChatSparkGlyph size={36} hue="coral" active />
        <Text variant="headline" align="center">
          {locale === "en"
            ? "What can Sydia take care of?"
            : "Apa yang bisa Sydia bantu?"}
        </Text>
        <Text variant="callout" tone="muted" align="center">
          {locale === "en"
            ? "Reminders, schedules, notes, expenses, or a photo of a document."
            : "Pengingat, jadwal, catatan, pengeluaran, atau foto dokumen."}
        </Text>
      </View>
    );
  else
    body = (
      <FlatList
        inverted
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => renderRow(item)}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={styles.list}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    );

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLeft: home
            ? () => (
                <IconButton
                  icon={LayoutGrid}
                  size={36}
                  accessibilityLabel="Menu"
                  onPress={() => router.push("/menu")}
                />
              )
            : undefined,
          headerRight: () =>
            isEmpty ? (
              <IconButton
                icon={History}
                size={36}
                accessibilityLabel={historyLabel}
                onPress={() => router.push("/history")}
              />
            ) : (
              <View style={styles.headerIsland}>
                <IconButton
                  icon={SquarePen}
                  size={36}
                  iconSize={18}
                  accessibilityLabel={
                    locale === "en" ? "New conversation" : "Percakapan baru"
                  }
                  onPress={startNewConversation}
                />
                <DropdownMenu
                  items={menuItems}
                  icon={EllipsisVertical}
                  size={36}
                  iconSize={18}
                  accessibilityLabel={
                    locale === "en"
                      ? "Conversation options"
                      : "Pilihan percakapan"
                  }
                />
              </View>
            ),
        }}
      />
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={styles.flex}
      >
        <View style={styles.flex}>{body}</View>
        <ChatComposer
          conversationId={conversationId}
          initialDraft={params.draft}
          initialAttachmentId={params.attachment}
          autoFocus={!conversationId}
          disabled={composerDisabled}
          disabledReason={disabledReason}
          isSending={isSending}
          errorMessage={
            sendMutation.isError ? sendMutation.error.message : undefined
          }
          locale={locale}
          bottomInset={keyboardVisible ? 0 : insets.bottom}
          onDraftChange={() => {
            if (sendMutation.isError) sendMutation.reset();
          }}
          onSend={handleSend}
        />
      </KeyboardAvoidingView>
      <SelectableTextModal
        text={selectableText}
        locale={locale}
        onClose={() => setSelectableText(null)}
      />
    </>
  );
}

function RowSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  headerIsland: {
    flexDirection: "row",
    alignItems: "center",
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  separator: { height: spacing.xl },
  skeleton: { flex: 1, padding: spacing.xl, gap: spacing.md },
  skeletonBubble: {
    alignSelf: "flex-end",
    width: "62%",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    marginTop: spacing.xl,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxxl,
  },
});
