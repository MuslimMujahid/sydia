/**
 * WhatsApp ban safeguards.
 *
 * These rules are the operational contract for the shared Sydia companion
 * number. The constants and helpers below encode the rate ceilings and
 * eligibility checks; the gateway/service layers enforce the behavioral DO's
 * and DON'Ts. Never relax these without explicit operator approval — an
 * enforcement action (see `WhatsAppGatewayService.enforce`) pauses sending and
 * pairing until an operator recovers the number.
 *
 * Part 1 — DO's
 * ---------------------------------------------------------------------------
 * Replying to users (core loop):
 *   1. DO reply to anyone who messages you first — replying inside an existing
 *      conversation is the lowest-risk activity on the platform.
 *   2. DO mark the incoming message as read before replying, then send a typing
 *      indicator, wait proportionally to reply length (~50 ms per character,
 *      min 0.5 s, max 3 s), then send.
 *   3. DO add a random delay of 1.5–3 seconds before every reply, even simple
 *      ones. Instant replies are a statistical fingerprint.
 *   4. DO identify yourself in your first message to any new contact:
 *      "Hi, this is [Name]'s AI assistant."
 *   5. DO mention "Reply STOP to opt out" in your first message, and
 *      occasionally thereafter.
 *   6. DO vary your phrasing — never send the identical string to multiple
 *      recipients. LLM-generated replies naturally satisfy this; canned
 *      templates do not.
 *   7. DO match the user's format — if they send voice notes or short texts,
 *      keep replies short. Occasional varied formats (short voice note, image)
 *      look more human than wall-of-text every time.
 *
 * Proactive messages (reminders, briefings, nudges):
 *   8. DO only message a user proactively if they replied to your last
 *      proactive message — unanswered proactive messages are tracked by
 *      WhatsApp over a rolling 30-day window.
 *   9. DO keep proactive messages under 10% of total traffic. The safe pattern
 *      is: user talks → you answer.
 *  10. DO stop nudging after 2 unanswered proactive messages. Go silent until
 *      the user writes again.
 *  11. DO frame proactive messages to invite a reply (question, choice,
 *      confirmation) — a user reply resets your risk metrics.
 *
 * Handling opt-outs and strangers:
 *  12. DO treat STOP, UNSUBSCRIBE, "stop", "leave me alone" as immediate hard
 *      opt-outs: confirm once ("Understood, I won't message you again"), add
 *      the number to the do-not-contact list, never message again unless they
 *      write to you first.
 *  13. DO respect quiet hours: no proactive messages between 22:00 and 08:00
 *      local time; defer to the next day.
 *
 * Session hygiene (gateway level):
 *  14. DO keep the session connected and stable — long-lived connections look
 *      like a normal companion device.
 *  15. DO watch for protocol-level warnings (e.g. `reachout_timelock`,
 *      `enforcement_type: BULK_MESSAGING` notifications, stream error 401) and
 *      escalate immediately — see Part 3.
 *  16. DO wait at least 24 hours after number registration before the first
 *      QR/linking, and complete the account profile (name, photo, bio) before
 *      going live.
 *
 * Part 2 — DON'Ts
 * ---------------------------------------------------------------------------
 * Hard prohibitions (any of these can kill the number fast):
 *   1. DON'T initiate a conversation with anyone who has never messaged this
 *      number. No cold outreach, ever. This is the #1 ban cause.
 *   2. DON'T send the same message text to multiple recipients — identical
 *      content at scale is a spam fingerprint.
 *   3. DON'T send link shorteners (bit.ly, tinyurl, etc.) or any URL in a first
 *      message to a new contact. Established-domain links inside ongoing
 *      conversations are lower risk.
 *   4. DON'T bulk-send to groups, add users to groups automatically, or
 *      broadcast to lists.
 *   5. DON'T send more than ~30 messages per hour or 1 per minute, across all
 *      conversations combined.
 *   6. DON'T send at fixed intervals. A message every exactly-10.00-seconds is
 *      a bot signature. Always randomize.
 *   7. DON'T reply to every group message. Only respond when directly
 *      mentioned/addressed; stay silent otherwise.
 *   8. DON'T argue, insist, or re-approach a user who ignored, blocked, or told
 *      you to stop.
 *   9. DON'T reconnect in a loop — if the session drops repeatedly, stop
 *      retrying and alert the operator. Reconnect loops are a detection trigger.
 *  10. DON'T retry logins or relink QR codes if a ban or restriction appears —
 *      fresh login attempts during enforcement can convert a temporary
 *      restriction into a permanent ban.
 *
 * Rate ceilings (hard caps — the gateway should enforce these server-side):
 *   | Limit                                          | Cap             | Notes                                  |
 *   | ---------------------------------------------- | --------------- | -------------------------------------- |
 *   | Replies per minute                             | 1               | With 1.5–3 s randomized gaps           |
 *   | Messages per hour (total)                      | 30              | All conversations combined             |
 *   | First-contact messages per day (steady state)  | ~200            | Only reachable after full warm-up      |
 *   | Proactive share of daily traffic               | ≤ 10%           | Rest must be user-initiated            |
 *   | Consecutive unanswered proactive messages      | 2               | Then silence until user writes         |
 *   | Proactive quiet hours                          | 22:00–08:00     | Hard block (local time)                |
 */
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
    !inQuietHours(input.now, input.timezone),
  );
}
