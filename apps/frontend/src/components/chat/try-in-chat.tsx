import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { type ExampleTopic, pageExample } from "@/lib/personalization/examples";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/preferences.queries";
import { cn } from "@/lib/utils/cn";

interface TryInChatProps {
  /** The page this example fills; the message matches how the user described themselves. */
  topic: ExampleTopic;
  className?: string;
}

/**
 * The example message drawn as a small copy of the chat composer: a field
 * holding the text and the gradient send button. It reads as a message ready
 * to send; choosing it opens a new chat with the message already typed.
 */
export function TryInChat({ topic, className }: TryInChatProps) {
  // Until preferences load, or if they fail, the household example shows.
  const preferences = useQuery(userPreferencesQueryOptions());
  const example = pageExample(topic, preferences.data?.occupation);

  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-col items-center gap-2.5",
        className
      )}
    >
      <Link
        to="/"
        search={{ draft: example }}
        className="composer-shell composer-shell-action group flex w-full max-w-md cursor-pointer items-center gap-3 rounded-lg py-2 pr-2 pl-4 text-left text-[15px] leading-6 text-ink outline-none"
      >
        <span className="sr-only">Buka di chat: </span>
        <span className="min-w-0 flex-1 text-balance">{example}</span>
        <span
          aria-hidden="true"
          className="aurora-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-canvas shadow-button transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-active:scale-90"
        >
          <ArrowUp className="size-4" />
        </span>
      </Link>
      <p aria-hidden="true" className="text-xs text-ink-muted">
        Ketuk untuk mencobanya di chat
      </p>
    </div>
  );
}
