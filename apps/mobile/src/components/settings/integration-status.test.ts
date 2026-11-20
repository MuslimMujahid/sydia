import { describe, expect, test } from "bun:test";
import type { CalendarStatus } from "@/lib/services/api/calendar/calendar.api";
import type { WhatsAppStatus } from "@/lib/services/api/whatsapp/whatsapp.api";
import {
  calendarConnection,
  deriveWhatsAppView,
  formatCountdown,
  telegramAccountLabel,
  whatsappMessageUrl,
} from "./integration-status";

const now = Date.parse("2026-11-19T05:00:00Z");

function whatsapp(overrides: Partial<WhatsAppStatus>): WhatsAppStatus {
  return {
    connected: false,
    linked: false,
    setupPhase: "disconnected",
    status: "disconnected",
    assistantNumber: null,
    ownerNumber: null,
    reason: null,
    ownerCodeExpiresAt: null,
    qrExpiresAt: null,
    ...overrides,
  };
}

const idle = { attempt: null, code: null, qrPending: false, now };

describe("formatCountdown", () => {
  test("shows minutes and zero-padded seconds, never negative", () => {
    expect(formatCountdown(245_000)).toBe("4:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("telegramAccountLabel", () => {
  test("prefers the username with a single @", () => {
    expect(telegramAccountLabel({ username: "@dipa", firstName: "Dipa" })).toBe(
      "@dipa"
    );
    expect(telegramAccountLabel({ username: null, firstName: "Dipa" })).toBe(
      "Dipa"
    );
    expect(telegramAccountLabel(undefined)).toBeNull();
  });
});

describe("deriveWhatsAppView", () => {
  test("a fresh account is not pairing yet", () => {
    const view = deriveWhatsAppView(whatsapp({}), idle);
    expect(view.isPairing).toBe(false);
    expect(view.label).toBe("Belum terhubung");
  });

  test("an unexpired QR attempt means pairing", () => {
    const view = deriveWhatsAppView(whatsapp({ setupPhase: "pairing" }), {
      ...idle,
      attempt: {
        attemptId: "a",
        assetPath: "/x",
        expiresAt: "2026-11-19T05:01:00Z",
      },
    });
    expect(view.isPairing).toBe(true);
    expect(view.expiredQr).toBe(false);
    expect(view.label).toBe("Menunggu pemindaian QR");
  });

  test("an expired QR is flagged so a new one can be requested", () => {
    const view = deriveWhatsAppView(
      whatsapp({ setupPhase: "qr_expired" }),
      idle
    );
    expect(view.isPairing).toBe(true);
    expect(view.expiredQr).toBe(true);
  });

  test("owner verification reports an expired challenge", () => {
    const view = deriveWhatsAppView(
      whatsapp({
        setupPhase: "owner_verification",
        assistantNumber: "628111",
        ownerCodeExpiresAt: "2026-11-19T04:00:00Z",
      }),
      idle
    );
    expect(view.ownerVerification).toBe(true);
    expect(view.expiredCode).toBe(true);
    expect(view.label).toBe("Verifikasi kedaluwarsa · +628111");
  });

  test("a ready connection reads as connected", () => {
    const view = deriveWhatsAppView(
      whatsapp({
        connected: true,
        linked: true,
        setupPhase: "ready",
        status: "connected",
        assistantNumber: "628111",
        ownerNumber: "628222",
      }),
      idle
    );
    expect(view.label).toBe("Terhubung");
    expect(view.isPairing).toBe(false);
  });
});

describe("calendarConnection", () => {
  const base: CalendarStatus = {
    connected: false,
    connectionStatus: "disconnected",
    provider: "google",
    pendingOperationCount: 0,
    openConflictCount: 0,
  };

  test("maps backend states to what the row shows", () => {
    expect(calendarConnection(undefined)).toBe("disconnected");
    expect(
      calendarConnection({
        ...base,
        connected: true,
        connectionStatus: "connected",
      })
    ).toBe("connected");
    expect(
      calendarConnection({ ...base, connectionStatus: "reconnect_required" })
    ).toBe("reconnect");
    expect(calendarConnection({ ...base, available: false })).toBe(
      "unavailable"
    );
  });
});

describe("whatsappMessageUrl", () => {
  test("prefills the verification text for the assistant number", () => {
    expect(whatsappMessageUrl("+62 811-1", "KODE 123")).toBe(
      "https://wa.me/628111?text=KODE%20123"
    );
  });
});
