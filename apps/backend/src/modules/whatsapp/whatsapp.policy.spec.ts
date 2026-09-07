import { describe, expect, it } from '@jest/globals';
import {
  HOUR_OUTBOUND_LIMIT,
  MAX_UNANSWERED_PROACTIVE,
  MIN_OUTBOUND_INTERVAL_MS,
  delayForReply,
  inQuietHours,
  isOptOut,
  proactiveShareAllowed,
  senderCanReceiveProactive,
} from './whatsapp.policy';

describe('WhatsApp safety policy', () => {
  it('recognizes exact opt-out phrases but not embedded words', () => {
    expect(isOptOut('STOP')).toBe(true);
    expect(isOptOut('unsubscribe')).toBe(true);
    expect(isOptOut('please stop this')).toBe(false);
  });

  it('keeps reply timing in the required bounds', () => {
    expect(delayForReply(() => 0, 'x').initial).toBe(1_500);
    expect(delayForReply(() => 0.999, 'x').initial).toBe(3_000);
    expect(delayForReply(() => 0, 'x'.repeat(100)).typing).toBe(3_000);
    expect(delayForReply(() => 0, '').typing).toBe(500);
    expect(MIN_OUTBOUND_INTERVAL_MS).toBe(60_000);
    expect(HOUR_OUTBOUND_LIMIT).toBe(30);
  });

  it('allows the first proactive after inbound and requires a reply thereafter', () => {
    const now = new Date('2026-09-07T12:00:00.000Z');
    const base = {
      firstInboundAt: now,
      optedOutAt: null,
      lastProactiveSentAt: null,
      lastProactiveReplyAt: null,
      now,
      timezone: 'UTC',
      proactivePaused: false,
    };

    expect(
      senderCanReceiveProactive({ ...base, unansweredProactiveCount: 0 }),
    ).toBe(true);
    const sentAt = new Date('2026-09-07T12:01:00.000Z');
    expect(
      senderCanReceiveProactive({
        ...base,
        lastProactiveSentAt: sentAt,
        unansweredProactiveCount: 0,
      }),
    ).toBe(false);
    expect(
      senderCanReceiveProactive({
        ...base,
        lastProactiveSentAt: sentAt,
        lastProactiveReplyAt: sentAt,
        unansweredProactiveCount: 0,
      }),
    ).toBe(false);
    expect(
      senderCanReceiveProactive({
        ...base,
        lastProactiveSentAt: sentAt,
        lastProactiveReplyAt: new Date('2026-09-07T12:01:01.000Z'),
        unansweredProactiveCount: 0,
      }),
    ).toBe(true);
    expect(
      senderCanReceiveProactive({
        ...base,
        lastProactiveSentAt: sentAt,
        lastProactiveReplyAt: new Date('2026-09-07T12:00:59.000Z'),
        unansweredProactiveCount: 0,
      }),
    ).toBe(false);
    expect(
      senderCanReceiveProactive({
        ...base,
        unansweredProactiveCount: MAX_UNANSWERED_PROACTIVE,
      }),
    ).toBe(false);
  });

  it('blocks quiet-hour proactive delivery and caps the daily share', () => {
    expect(inQuietHours(new Date('2026-09-07T23:00:00.000Z'), 'UTC')).toBe(
      true,
    );
    expect(inQuietHours(new Date('2026-09-07T12:00:00.000Z'), 'UTC')).toBe(
      false,
    );
    expect(proactiveShareAllowed(100, 10)).toBe(true);
    expect(proactiveShareAllowed(100, 11)).toBe(false);
    expect(proactiveShareAllowed(0, 0)).toBe(false);
  });
});
