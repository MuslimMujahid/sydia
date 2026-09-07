export const WHATSAPP_CLOCK = Symbol('WHATSAPP_CLOCK');
export const WHATSAPP_RANDOM = Symbol('WHATSAPP_RANDOM');
export const WHATSAPP_SLEEP = Symbol('WHATSAPP_SLEEP');

export type Clock = () => Date;
export type Random = () => number;
export type Sleep = (milliseconds: number) => Promise<void>;

export const STOP_WORDS = /^(?:stop|unsubscribe|leave\s+me\s+alone)$/iu;
export const MIN_OUTBOUND_INTERVAL_MS = 60_000;
export const HOUR_OUTBOUND_LIMIT = 30;
export const PROACTIVE_DAILY_SHARE = 0.1;
export const MAX_UNANSWERED_PROACTIVE = 2;

export function isOptOut(content: string): boolean {
  return STOP_WORDS.test(content.trim());
}

export function delayForReply(
  random: Random,
  content: string,
): { initial: number; typing: number } {
  const boundedRandom = Math.max(0, Math.min(1, random()));
  const initial = Math.min(3_000, 1_500 + Math.ceil(boundedRandom * 1_501));
  const typing = Math.max(500, Math.min(3_000, content.length * 50));

  return { initial, typing };
}

export function inQuietHours(date: Date, timezone: string): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      }).format(date),
    );

    return hour >= 22 || hour < 8;
  } catch {
    const hour = date.getUTCHours();

    return hour >= 22 || hour < 8;
  }
}

export function proactiveShareAllowed(
  inboundCount: number,
  proactiveCount: number,
): boolean {
  if (inboundCount <= 0) return false;

  return proactiveCount / inboundCount <= PROACTIVE_DAILY_SHARE;
}

export function senderCanReceiveProactive(input: {
  firstInboundAt: Date | null;
  optedOutAt: Date | null;
  lastProactiveSentAt: Date | null;
  lastProactiveReplyAt: Date | null;
  unansweredProactiveCount: number;
  now: Date;
  timezone: string;
  proactivePaused: boolean;
}): boolean {
  const repliedToLatestProactive =
    input.lastProactiveSentAt === null ||
    (input.lastProactiveReplyAt !== null &&
      input.lastProactiveReplyAt.getTime() >
        input.lastProactiveSentAt.getTime());

  return Boolean(
    input.firstInboundAt &&
    !input.optedOutAt &&
    repliedToLatestProactive &&
    input.unansweredProactiveCount < MAX_UNANSWERED_PROACTIVE &&
    !input.proactivePaused &&
    !inQuietHours(input.now, input.timezone),
  );
}
