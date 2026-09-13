import { describe, expect, it } from '@jest/globals';
import { isDueInWindow, parseTimeOfDay } from './local-window';

const at = (iso: string) => new Date(iso);

describe('local proactive scheduling window', () => {
  it('parses HH:mm and rejects malformed times', () => {
    expect(parseTimeOfDay('08:00')).toBe(480);
    expect(parseTimeOfDay('23:59')).toBe(1439);
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('08:60')).toBeNull();
    expect(parseTimeOfDay('8')).toBeNull();
    expect(parseTimeOfDay(null)).toBeNull();
  });

  it('is due across the whole window, not just the exact minute', () => {
    // 01:00Z is 08:00 in Jakarta; a 30 minute window covers 08:00–08:29 local.
    expect(
      isDueInWindow(at('2026-09-13T01:00:00Z'), 'Asia/Jakarta', '08:00', 30),
    ).toBe(true);
    expect(
      isDueInWindow(at('2026-09-13T01:14:00Z'), 'Asia/Jakarta', '08:00', 30),
    ).toBe(true);
    expect(
      isDueInWindow(at('2026-09-13T01:29:00Z'), 'Asia/Jakarta', '08:00', 30),
    ).toBe(true);
  });

  it('is not due before the scheduled time nor after the window closes', () => {
    expect(
      isDueInWindow(at('2026-09-13T00:59:00Z'), 'Asia/Jakarta', '08:00', 30),
    ).toBe(false);
    expect(
      isDueInWindow(at('2026-09-13T01:30:00Z'), 'Asia/Jakarta', '08:00', 30),
    ).toBe(false);
    expect(
      isDueInWindow(at('2026-09-13T05:00:00Z'), 'Asia/Jakarta', '08:00', 30),
    ).toBe(false);
  });

  it('does not fire a late schedule early the next day', () => {
    // 23:50 local with a 30 minute window: 00:05 the next day is inside the
    // wrapped window, but must not be reported as due — that would send the new
    // day's briefing the moment the clock rolls over.
    expect(
      isDueInWindow(at('2026-09-13T16:50:00Z'), 'Asia/Jakarta', '23:50', 30),
    ).toBe(true);
    expect(
      isDueInWindow(at('2026-09-13T17:05:00Z'), 'Asia/Jakarta', '23:50', 30),
    ).toBe(false);
  });

  it('respects each user timezone for the same instant', () => {
    const instant = at('2026-09-13T01:00:00Z');

    expect(isDueInWindow(instant, 'Asia/Jakarta', '08:00', 30)).toBe(true);
    expect(isDueInWindow(instant, 'UTC', '08:00', 30)).toBe(false);
    expect(isDueInWindow(instant, 'Asia/Jakarta', '01:00', 30)).toBe(false);
  });

  it('falls back to the default time and UTC on bad input', () => {
    expect(
      isDueInWindow(at('2026-09-13T08:00:00Z'), 'Not/AZone', '08:00', 30),
    ).toBe(true);
    expect(
      isDueInWindow(at('2026-09-13T08:00:00Z'), 'UTC', 'nonsense', 30),
    ).toBe(true);
    expect(
      isDueInWindow(at('2026-09-13T08:00:00Z'), 'Not/AZone', 'nonsense', 30),
    ).toBe(true);
  });

  it('never reports due for a non-positive window', () => {
    expect(
      isDueInWindow(at('2026-09-13T01:00:00Z'), 'Asia/Jakarta', '08:00', 0),
    ).toBe(false);
    expect(
      isDueInWindow(at('2026-09-13T01:00:00Z'), 'Asia/Jakarta', '08:00', -5),
    ).toBe(false);
  });
});
