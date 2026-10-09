import { ArrowUp, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import { cn } from "@/lib/utils/cn";
import type { ChatPreviewChannel } from "@/lib/services/api/conversations/conversations.api";
import {
  webChatPreview,
  telegramChatPreview,
  whatsAppChatPreview,
} from "@/lib/services/api/conversations/chat-preview";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { AssistantMarkdown } from "./assistant-markdown";
import { collectChatEntities } from "./chat-entities";
import { NativeChatText } from "./native-chat-text";
import { useChatPreview } from "./use-chat-preview";

interface ChatPreviewsPageProps {
  locale: SupportedLocale;
  timezone: string;
}
const CHANNEL_NAMES = {
  web: "Web chat",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
} as const;

// Channel chrome is scoped to these previews; the underlying renderers stay shared.
const CHANNEL_STYLES = {
  web: {
    history: "bg-canvas",
    header: "bg-canvas",
    user: "bg-surface-1 text-ink",
    assistant: "text-ink",
  },
  telegram: {
    history: "bg-[#dce6ef]",
    header: "bg-white text-[#17212b]",
    user: "rounded-br-sm bg-[#effdde] text-[#17212b]",
    assistant: "rounded-tl-sm bg-white px-4 py-3 text-[#17212b]",
  },
  whatsapp: {
    history: "bg-[#efeae2]",
    header: "bg-[#f0f2f5] text-[#111b21]",
    user: "rounded-tr-sm bg-[#d9fdd3] text-[#111b21]",
    assistant: "rounded-tl-sm bg-white px-4 py-3 text-[#111b21]",
  },
} as const;

function PreviewPane({
  channel,
  preview,
  locale,
  timezone,
}: ChatPreviewsPageProps & {
  channel: ChatPreviewChannel;
  preview: ReturnType<typeof useChatPreview>;
}) {
  const style = CHANNEL_STYLES[channel];
  const history = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const inbox = history.current;
    if (inbox) inbox.scrollTop = inbox.scrollHeight;
  }, [preview.turns, preview.text, preview.isPending]);
  const streamed =
    preview.isPending &&
    preview.turns.at(-1)?.assistantRun.status !== "completed";

  return (
    <section
      aria-label={CHANNEL_NAMES[channel]}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-hairline"
    >
      <header
        className={cn(
          "flex min-h-16 items-center justify-between gap-3 border-b border-hairline px-4",
          style.header
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {channel === "web" ? (
            <SydiaLogo className="size-8" />
          ) : (
            <img
              src={`/images/brands/${channel}.svg`}
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="size-8 shrink-0"
            />
          )}
          <h2 className="font-display text-base font-semibold">
            {CHANNEL_NAMES[channel]}
          </h2>
        </div>
        {preview.isPending ? (
          <span role="status" className="text-xs text-ink-muted">
            {locale === "en" ? "Responding…" : "Menjawab…"}
          </span>
        ) : null}
      </header>
      <div
        ref={history}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-color:var(--color-hairline)_transparent]",
          style.history
        )}
        tabIndex={0}
        aria-label={
          locale === "en"
            ? `${CHANNEL_NAMES[channel]} history`
            : `Riwayat ${CHANNEL_NAMES[channel]}`
        }
      >
        {!preview.turns.length && !preview.isPending ? (
          <p className="text-sm text-ink-muted">
            {locale === "en"
              ? "Send a message below to compare responses."
              : "Kirim pesan di bawah untuk membandingkan respons."}
          </p>
        ) : null}
        <div className="space-y-6">
          {preview.turns.map((turn) => {
            const { entities, diagnostics } = collectChatEntities(
              turn.toolInvocations
            );

            return (
              <div key={turn.assistantRun.id} className="space-y-3">
                <p
                  className={cn(
                    "ml-auto w-fit max-w-[94%] rounded-[12px] px-4 py-3 text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
                    style.user
                  )}
                >
                  {turn.userMessage.content}
                </p>
                {turn.assistantMessage ? (
                  <article
                    aria-label={
                      locale === "en" ? "Sydia response" : "Respons Sydia"
                    }
                    className={cn(
                      "w-fit max-w-full rounded-[12px] text-base leading-6",
                      style.assistant
                    )}
                  >
                    {channel === "web" ? (
                      <AssistantMarkdown
                        content={turn.assistantMessage.content}
                        entities={entities}
                        locale={locale}
                        timezone={timezone}
                        snapshotOnly
                      />
                    ) : (
                      <NativeChatText
                        channel={channel}
                        content={turn.assistantMessage.content}
                      />
                    )}
                    <details className="mt-4 text-xs text-ink-muted">
                      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-brand">
                        {locale === "en" ? "Raw response" : "Respons mentah"}
                      </summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {turn.assistantMessage.content}
                      </pre>
                    </details>
                    {diagnostics.length ? (
                      <p role="alert" className="mt-2 text-xs text-destructive">
                        {locale === "en"
                          ? "Some entity references could not be rendered."
                          : "Beberapa referensi entitas tidak dapat ditampilkan."}
                      </p>
                    ) : null}
                  </article>
                ) : null}
              </div>
            );
          })}
          {streamed ? (
            <div
              role="status"
              className={cn(
                "w-fit max-w-full rounded-[12px] text-sm leading-6",
                style.assistant
              )}
            >
              {preview.text ? (
                channel === "web" ? (
                  <AssistantMarkdown
                    content={preview.text}
                    locale={locale}
                    timezone={timezone}
                    appendUnmentioned={false}
                    snapshotOnly
                  />
                ) : (
                  <NativeChatText content={preview.text} channel={channel} />
                )
              ) : (
                <p className="text-ink-muted">
                  {preview.activity?.label ??
                    (locale === "en"
                      ? "Preparing a response…"
                      : "Menyiapkan respons…")}
                </p>
              )}
            </div>
          ) : null}
          {preview.files.map((file, index) => (
            <a
              key={index}
              download={file.filename}
              href={`data:application/octet-stream;base64,${file.base64}`}
              className="block break-words text-sm text-ink underline underline-offset-2"
            >
              {locale === "en" ? "Download" : "Unduh"} {file.filename}
            </a>
          ))}
          {preview.error ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {preview.error.message}
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={preview.isPending}
                onClick={preview.retry}
              >
                <RotateCcw />
                {locale === "en" ? "Retry this channel" : "Ulangi kanal ini"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ChatPreviewSession({
  sessionId,
  onNewSession,
  locale,
  timezone,
}: ChatPreviewsPageProps & { sessionId: string; onNewSession: () => void }) {
  const web = useChatPreview(webChatPreview(sessionId));
  const telegram = useChatPreview(telegramChatPreview(sessionId));
  const whatsapp = useChatPreview(whatsAppChatPreview(sessionId));
  const previews = [web, telegram, whatsapp];
  const [draft, setDraft] = useState("");
  const submitting = useRef(false);
  const pending = previews.some((preview) => preview.isPending);

  async function submit() {
    const content = draft.trim();
    if (!content || pending || submitting.current) return;
    submitting.current = true;
    setDraft("");
    // One UUID can be shared: message idempotency is scoped by the sandbox user.
    const idempotencyKey = crypto.randomUUID();
    await Promise.allSettled(
      previews.map((preview) => preview.send(content, idempotencyKey))
    );
    submitting.current = false;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <main
      className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col gap-4 p-4 sm:p-6"
      aria-label={locale === "en" ? "Chat previews" : "Pratinjau chat"}
    >
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="grid h-full min-w-[900px] grid-cols-3 gap-4">
          <PreviewPane
            channel="web"
            preview={web}
            locale={locale}
            timezone={timezone}
          />
          <PreviewPane
            channel="telegram"
            preview={telegram}
            locale={locale}
            timezone={timezone}
          />
          <PreviewPane
            channel="whatsapp"
            preview={whatsapp}
            locale={locale}
            timezone={timezone}
          />
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="rounded-md border border-hairline bg-canvas p-3 sm:p-4"
      >
        <div className="flex items-stretch gap-3">
          <Textarea
            id="preview-message"
            aria-label={
              locale === "en"
                ? "Message all three chats"
                : "Pesan untuk ketiga chat"
            }
            value={draft}
            maxLength={20_000}
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              locale === "en"
                ? "Type a test message…"
                : "Tulis pesan pengujian…"
            }
            className="min-h-24 min-w-0 flex-1 resize-none"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex w-28 shrink-0 flex-col gap-2 sm:w-32">
            <Button
              className="h-11 w-full"
              type="submit"
              disabled={!draft.trim() || pending}
              aria-label={
                locale === "en"
                  ? "Send to all three chats"
                  : "Kirim ke ketiga chat"
              }
            >
              <ArrowUp />
              <span>{locale === "en" ? "Send" : "Kirim"}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-full text-ink-soft"
              disabled={pending}
              onClick={onNewSession}
            >
              <RotateCcw />
              {locale === "en" ? "New session" : "Sesi baru"}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}

export function ChatPreviewsPage(props: ChatPreviewsPageProps) {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

  return (
    <ChatPreviewSession
      key={sessionId}
      sessionId={sessionId}
      onNewSession={() => setSessionId(crypto.randomUUID())}
      {...props}
    />
  );
}
