import { expect, test, type Page } from "@playwright/test";
import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "../src/lib/services/api/calendar/calendar.api";

const timestamp = "2026-10-08T08:00:00.000Z";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110";

// A cold Vite fixture compiles the calendar and rich text dependencies on first
// navigation. Keep assertion deadlines unchanged while allowing that startup.
test.setTimeout(60_000);

const googleEvent: CalendarEvent = {
  id: "event-1",
  provider: "google",
  providerEventId: "google-event-1",
  title: "Rapat sinkron",
  description: null,
  location: "Ruang rapat",
  reminderMinutes: 10,
  startAt: timestamp,
  endAt: "2026-10-08T09:00:00.000Z",
  timezone: "Asia/Makassar",
  allDayStartDate: null,
  allDayEndDate: null,
  recurrence: [],
  recurringParentProviderEventId: null,
  recurringParentEventId: null,
  recurrenceExceptionKey: null,
  originalStartAt: null,
  originalStartDate: null,
  attendees: [],
  status: "confirmed",
  syncState: "error",
  createdAt: timestamp,
  updatedAt: timestamp,
};

type CalendarMocks = {
  connected: boolean;
  disconnectPending: boolean;
  disconnectFailuresRemaining: number;
  event: CalendarEvent;
  connectCount: number;
  disconnectCount: number;
  retryCount: number;
  pollCount: number;
  pollPending: boolean;
  lastSyncedAt: string;
  updateRequest: Partial<CalendarEventWriteInput> | null;
  createRequest: (CalendarEventWriteInput & { destination: string }) | null;
};

function connectedStatus(mocks: CalendarMocks) {
  return {
    connected: mocks.connected,
    connectionStatus: mocks.disconnectPending
      ? "disconnecting"
      : mocks.connected
        ? "connected"
        : "disconnected",
    cleanupPending: mocks.disconnectPending,
    provider: "google",
    calendarId: mocks.connected ? "primary" : null,
    calendarName: mocks.connected ? "Kalender utama" : null,
    googleEmail: mocks.connected ? "user@example.test" : null,
    bindingState: mocks.connected ? "active" : null,
    lastSyncedAt: mocks.lastSyncedAt,
    lastErrorCode: null,
    pendingOperationCount: 0,
    openConflictCount: 0,
    available: true,
  };
}

async function mockCalendarApi(
  page: Page,
  options: {
    connected?: boolean;
    disconnectFailuresRemaining?: number;
  } = {}
): Promise<CalendarMocks> {
  const mocks: CalendarMocks = {
    connected: options.connected ?? false,
    disconnectPending: false,
    disconnectFailuresRemaining: options.disconnectFailuresRemaining ?? 0,
    event: googleEvent,
    connectCount: 0,
    disconnectCount: 0,
    retryCount: 0,
    pollCount: 0,
    pollPending: false,
    lastSyncedAt: timestamp,
    updateRequest: null,
    createRequest: null,
  };

  await page.route("http://localhost:5000/calendar/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/calendar/status")
      return route.fulfill({ json: { data: connectedStatus(mocks) } });

    if (pathname === "/calendar/google/poll") {
      mocks.pollCount += 1;

      return route.fulfill({
        status: 202,
        json: {
          data: {
            status: mocks.pollPending ? "queued" : "fresh",
            calendarId: "primary",
            lastSyncedAt: mocks.lastSyncedAt,
          },
        },
      });
    }

    if (pathname === "/calendar/google/calendars")
      return route.fulfill({
        json: {
          data: [
            {
              id: "primary",
              name: "Kalender utama",
              timezone: "Asia/Makassar",
              primary: true,
              writable: true,
            },
          ],
        },
      });

    if (pathname === "/calendar/events" && request.method() === "POST") {
      mocks.createRequest =
        request.postDataJSON() as CalendarEventWriteInput & {
          destination: string;
        };

      return route.fulfill({
        json: {
          data: { ...googleEvent, ...mocks.createRequest, id: "created-event" },
        },
      });
    }

    if (pathname === "/calendar/events")
      return route.fulfill({ json: { data: [mocks.event] } });

    if (pathname === "/calendar/google/connect") {
      mocks.connectCount += 1;
      mocks.connected = true;
      const returnUrl = new URL(
        "/e2e/calendar-sync.html?mode=integrations&oauthReturn=success",
        baseURL
      );

      return route.fulfill({ json: { data: { url: returnUrl.toString() } } });
    }

    if (pathname === "/calendar/disconnect") {
      mocks.disconnectCount += 1;

      if (mocks.disconnectFailuresRemaining > 0) {
        mocks.disconnectFailuresRemaining -= 1;
        mocks.connected = false;
        mocks.disconnectPending = true;

        return route.fulfill({
          json: {
            data: {
              connected: false,
              connectionStatus: "disconnecting",
              cleanupPending: true,
            },
          },
        });
      }

      mocks.connected = false;
      mocks.disconnectPending = false;

      return route.fulfill({
        json: {
          data: {
            connected: false,
            connectionStatus: "disconnected",
            cleanupPending: false,
          },
        },
      });
    }

    if (
      pathname === `/calendar/events/${googleEvent.id}` &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as Partial<CalendarEventWriteInput>;
      mocks.updateRequest = body;
      mocks.event = { ...mocks.event, ...body, syncState: "pending" };

      return route.fulfill({ json: { data: mocks.event } });
    }

    if (pathname === `/calendar/events/${googleEvent.id}/retry-sync`) {
      mocks.retryCount += 1;
      mocks.event = { ...mocks.event, syncState: "pending" };

      return route.fulfill({ json: { data: mocks.event } });
    }

    return route.fulfill({ json: { data: null } });
  });

  await page.route("http://localhost:5000/tasks**", (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.route("http://localhost:5000/telegram/status", (route) =>
    route.fulfill({
      json: {
        data: {
          available: false,
          notice: null,
          linked: false,
          externalId: null,
          username: null,
          firstName: null,
          botUsername: null,
          lastInboundAt: null,
        },
      },
    })
  );
  await page.route("http://localhost:5000/whatsapp/status", (route) =>
    route.fulfill({
      json: {
        data: {
          gateway: {
            status: "disconnected",
            registrationReady: false,
            profileReady: false,
            sendingPaused: false,
            enforcementCode: null,
            enforcementReason: null,
            recoveryReason: null,
            lastConnectedAt: null,
            lastEventAt: null,
          },
          linked: false,
          externalId: null,
          contact: null,
        },
      },
    })
  );

  return mocks;
}

test("reload requests one Google pull and replaces events after the worker completes", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  mocks.pollPending = true;
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await expect.poll(() => mocks.pollCount).toBe(1);
  await expect(page.getByText("Rapat sinkron", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Menyinkronkan Google Calendar" })
  ).toBeVisible();

  mocks.event = { ...mocks.event, title: "Rapat terbaru dari Google" };
  mocks.lastSyncedAt = "2026-10-08T08:01:00.000Z";
  await expect(
    page.getByText("Rapat terbaru dari Google", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Menyinkronkan Google Calendar…", { exact: true })
  ).not.toBeVisible();

  mocks.pollPending = false;
  await page.reload();
  await expect.poll(() => mocks.pollCount).toBe(2);
  await expect(
    page.getByText("Rapat terbaru dari Google", { exact: true })
  ).toBeVisible();
});

test("calendar reload skips Google polls for a disconnected account", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await expect(
    page.getByRole("button", { name: "Hubungkan Google" })
  ).toBeVisible();
  expect(mocks.pollCount).toBe(0);
});

test("a failed refresh shows the error and logs the failed sync request", async ({
  page,
}) => {
  await mockCalendarApi(page, { connected: true });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("http://localhost:5000/calendar/google/poll", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Google Calendar sementara tidak tersedia.",
        },
      },
    })
  );

  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Google Calendar sementara tidak tersedia." })
  ).toBeVisible();
  await expect
    .poll(() =>
      errors.some((message) =>
        message.includes("Google Calendar page refresh failed")
      )
    )
    .toBe(true);
});

test("cancelled Calendar consent keeps the integrations switch available for retry", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page);

  await page.goto(
    "/e2e/calendar-sync.html?mode=integrations&googleCalendar=denied"
  );

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Izin Google Calendar dibatalkan" })
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).toBeEnabled();
  expect(mocks.connectCount).toBe(0);
});

test("failed Calendar consent gives an actionable error without claiming a connection", async ({
  page,
}) => {
  await mockCalendarApi(page);

  await page.goto(
    "/e2e/calendar-sync.html?mode=integrations&googleCalendar=failed"
  );

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Google Calendar belum berhasil terhubung" })
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).not.toBeChecked();
});

test("connects through a mocked Google authorization return", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page);

  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).not.toBeChecked();
  await page
    .getByRole("switch", { name: "Google Calendar", exact: true })
    .click();

  await expect.poll(() => mocks.connectCount).toBe(1);
  await page.waitForURL(/oauthReturn=success/);
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).toBeChecked();
});

test("keeps the Google description visible with the account in the title despite sync metadata", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  await page.route("http://localhost:5000/calendar/status", (route) =>
    route.fulfill({
      json: {
        data: {
          ...connectedStatus(mocks),
          bindingState: "initializing",
          pendingOperationCount: 3,
          openConflictCount: 2,
          lastErrorCode: "TEMPORARY_PROVIDER_ERROR",
        },
      },
    })
  );

  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(
    page.getByRole("heading", {
      name: "Google Calendar user@example.test",
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Google Calendar user@example.test",
      exact: true,
    })
  ).toHaveText(
    /^Google Calendar\s*user@example\.test\s*Sinkronkan agenda dengan akun Google Anda\.$/
  );
});

test("retries a failed Google event sync from its editor", async ({ page }) => {
  const mocks = await mockCalendarApi(page, { connected: true });

  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByRole("button", { name: "Coba sinkronkan lagi" }).click();

  await expect.poll(() => mocks.retryCount).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("saves an edit to a Google event through the update endpoint", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  mocks.event = { ...googleEvent, syncState: "synced" };

  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByLabel("Judul").fill("Rapat diperbarui");
  await page.getByRole("button", { name: "Simpan acara" }).click();

  await expect.poll(() => mocks.updateRequest?.title).toBe("Rapat diperbarui");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("disconnects Google Calendar and returns to the local agenda state", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });

  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).toBeChecked();
  await page
    .getByRole("switch", { name: "Google Calendar", exact: true })
    .click();

  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).not.toBeChecked();
  expect(mocks.disconnectCount).toBe(1);
});

test("keeps Google sync suspended and allows retry when token revocation is pending", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, {
    connected: true,
    disconnectFailuresRemaining: 1,
  });

  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).toBeChecked();
  await page
    .getByRole("switch", { name: "Google Calendar", exact: true })
    .click();

  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Coba cabut izin lagi" })
  ).toBeVisible();
  expect(mocks.connected).toBe(false);
  expect(mocks.disconnectCount).toBe(1);

  await page.getByRole("button", { name: "Coba cabut izin lagi" }).click();

  await expect(
    page.getByRole("switch", { name: "Google Calendar", exact: true })
  ).not.toBeChecked();
  expect(mocks.connected).toBe(false);
  expect(mocks.disconnectCount).toBe(2);
});

type TelegramMocks = {
  linked: boolean;
  failConnect: boolean;
  failUnlink: boolean;
};

async function mockTelegramApi(
  page: Page,
  linked = false
): Promise<TelegramMocks> {
  const mocks = { linked, failConnect: false, failUnlink: false };
  await page.clock.install({ time: new Date("2026-10-12T08:00:00Z") });
  await page.route("http://localhost:5000/telegram/status", (route) =>
    route.fulfill({
      json: {
        data: {
          available: true,
          linked: mocks.linked,
          externalId: "telegram-user",
          username: mocks.linked ? "ayu" : null,
          firstName: "Ayu",
          botUsername: "sydia_bot",
          notice: null,
          lastInboundAt: null,
        },
      },
    })
  );
  await page.route("http://localhost:5000/telegram/link", (route) => {
    const unlinking = route.request().method() === "DELETE";
    if (unlinking ? mocks.failUnlink : mocks.failConnect)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Telegram sementara tidak tersedia.",
          },
        },
      });

    if (unlinking) {
      mocks.linked = false;

      return route.fulfill({ status: 204 });
    }

    return route.fulfill({
      json: {
        data: {
          url: `${baseURL}/telegram-authorize`,
          expiresAt: "2026-10-12T08:05:00Z",
        },
      },
    });
  });
  await page.context().route(`${baseURL}/telegram-authorize`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Telegram authorization fixture</p>",
    })
  );

  return mocks;
}

test("Telegram switch opens authorization and stays off until confirmation", async ({
  page,
}) => {
  await mockCalendarApi(page);
  const mocks = await mockTelegramApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  const telegram = page.getByRole("switch", { name: "Telegram", exact: true });
  await expect(telegram).toBeEnabled();
  const popupPromise = page.waitForEvent("popup");
  await telegram.focus();
  await page.keyboard.press("Space");
  const popup = await popupPromise;
  await popup.waitForURL(`${baseURL}/telegram-authorize`);
  await expect(telegram).not.toBeChecked();
  await expect(telegram).toBeDisabled();
  await expect(
    page.getByText("Selesaikan penghubungan akun di Telegram.", {
      exact: false,
    })
  ).toBeVisible();

  mocks.linked = true;
  await expect(telegram).toBeChecked();
  await expect(telegram).toBeEnabled();
  await expect(page.getByText("@ayu", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Buka Telegram|Putuskan/ })
  ).toHaveCount(0);
  await popup.close();
});

test("keeps the Telegram description visible with the account in the title until disconnected", async ({
  page,
}) => {
  await mockCalendarApi(page);
  await mockTelegramApi(page, true);
  await page.goto("/e2e/calendar-sync.html?mode=integrations");

  await expect(
    page.getByRole("heading", { name: "Telegram @ayu", exact: true })
  ).toBeVisible();
  const description = page.getByText(
    "Mengobrol dan menerima pengingat melalui Telegram.",
    { exact: true }
  );

  await expect(description).toBeVisible();
  const telegram = page.getByRole("switch", { name: "Telegram", exact: true });
  await telegram.click();

  await expect(telegram).not.toBeChecked();
  await expect(page.getByText("@ayu", { exact: true })).toHaveCount(0);
  await expect(description).toBeVisible();
});

test("blocked Telegram authorization popup offers an inline continuation link", async ({
  page,
}) => {
  await mockCalendarApi(page);
  await mockTelegramApi(page);
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await page.getByRole("switch", { name: "Telegram", exact: true }).click();

  await expect(
    page.getByRole("link", { name: "lanjutkan di Telegram" })
  ).toHaveAttribute("href", `${baseURL}/telegram-authorize`);
  await expect(
    page.getByRole("switch", { name: "Telegram", exact: true })
  ).not.toBeChecked();
});

test("failed Telegram linking leaves the switch off and ready to retry", async ({
  page,
}) => {
  await mockCalendarApi(page);
  const mocks = await mockTelegramApi(page);
  mocks.failConnect = true;
  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  const telegram = page.getByRole("switch", { name: "Telegram", exact: true });
  const popupPromise = page.waitForEvent("popup");
  await telegram.click();
  const popup = await popupPromise;

  await expect(page.getByRole("alert")).toContainText(
    "Telegram sementara tidak tersedia."
  );
  await expect(telegram).not.toBeChecked();
  await expect(telegram).toBeEnabled();
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("Telegram disconnect failure keeps the switch on and allows another attempt", async ({
  page,
}) => {
  await mockCalendarApi(page);
  const mocks = await mockTelegramApi(page, true);
  mocks.failUnlink = true;
  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  const telegram = page.getByRole("switch", { name: "Telegram", exact: true });
  await expect(telegram).toBeChecked();
  await telegram.click();

  await expect(page.getByRole("alert")).toContainText(
    "Telegram sementara tidak tersedia."
  );
  await expect(telegram).toBeChecked();
  await expect(telegram).toBeEnabled();
  mocks.failUnlink = false;
  await telegram.click();
  await expect(telegram).not.toBeChecked();
});

test("unavailable Telegram connection has a disabled switch", async ({
  page,
}) => {
  await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(
    page.getByRole("switch", { name: "Telegram", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByText("Integrasi Telegram belum tersedia di server ini.")
  ).toBeVisible();
});

async function mockWhatsAppApi(page: Page) {
  const mocks = {
    linked: false,
    blocked: false,
    failConnect: false,
    failUnlink: false,
  };

  await page.clock.install({ time: new Date("2026-10-12T08:00:00Z") });
  await page.route("http://localhost:5000/whatsapp/status", (route) =>
    route.fulfill({
      json: {
        data: {
          linked: mocks.linked,
          externalId: mocks.linked ? "628123456789@s.whatsapp.net" : null,
          contact: null,
          gateway: {
            status: mocks.blocked ? "enforced" : "connected",
            registrationReady: true,
            profileReady: true,
            sendingPaused: mocks.blocked,
            enforcementCode: null,
            enforcementReason: mocks.blocked
              ? "Pengiriman dijeda oleh WhatsApp."
              : null,
            recoveryReason: null,
            lastConnectedAt: null,
            lastEventAt: null,
          },
        },
      },
    })
  );
  await page.route("http://localhost:5000/whatsapp/link-code", (route) =>
    mocks.failConnect
      ? route.fulfill({
          status: 503,
          json: {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Kode WhatsApp belum dapat dibuat.",
            },
          },
        })
      : route.fulfill({
          json: {
            data: { code: "SYDIA-1234", expiresAt: "2026-10-12T08:05:00Z" },
          },
        })
  );
  await page.route("http://localhost:5000/whatsapp/link", (route) => {
    if (mocks.failUnlink)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Tautan WhatsApp belum dapat diputuskan.",
          },
        },
      });
    mocks.linked = false;

    return route.fulfill({ status: 204 });
  });

  return mocks;
}

test("WhatsApp switch creates a code and turns on only after linking is confirmed", async ({
  page,
}) => {
  const mocks = await mockWhatsAppApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=whatsapp");
  const whatsapp = page.getByRole("switch", { name: "WhatsApp", exact: true });
  await whatsapp.click();

  await expect(page.getByText("SYDIA-1234", { exact: true })).toBeVisible();
  await expect(whatsapp).not.toBeChecked();
  await expect(whatsapp).toBeDisabled();
  mocks.linked = true;
  await expect(whatsapp).toBeChecked();
  await expect(page.getByText("628123456789", { exact: true })).toBeVisible();
});

test("WhatsApp link-code failure leaves the switch off and ready to retry", async ({
  page,
}) => {
  const mocks = await mockWhatsAppApi(page);
  mocks.failConnect = true;
  await page.goto("/e2e/calendar-sync.html?mode=whatsapp");
  const whatsapp = page.getByRole("switch", { name: "WhatsApp", exact: true });
  await whatsapp.click();

  await expect(page.getByRole("alert")).toContainText(
    "Kode WhatsApp belum dapat dibuat."
  );
  await expect(whatsapp).not.toBeChecked();
  await expect(whatsapp).toBeEnabled();
});

test("WhatsApp disconnect failure keeps the switch on and allows another attempt", async ({
  page,
}) => {
  const mocks = await mockWhatsAppApi(page);
  mocks.linked = true;
  mocks.failUnlink = true;
  await page.goto("/e2e/calendar-sync.html?mode=whatsapp");
  const whatsapp = page.getByRole("switch", { name: "WhatsApp", exact: true });
  await expect(whatsapp).toBeChecked();
  await whatsapp.click();

  await expect(page.getByRole("alert")).toContainText(
    "Tautan WhatsApp belum dapat diputuskan."
  );
  await expect(whatsapp).toBeChecked();
  await expect(whatsapp).toBeEnabled();
  mocks.failUnlink = false;
  await whatsapp.click();
  await expect(whatsapp).not.toBeChecked();
});

test("WhatsApp enforcement disables new links and exposes the reason", async ({
  page,
}) => {
  const mocks = await mockWhatsAppApi(page);
  mocks.blocked = true;
  await page.goto("/e2e/calendar-sync.html?mode=whatsapp");
  await expect(
    page.getByRole("switch", { name: "WhatsApp", exact: true })
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "Pengiriman dijeda oleh WhatsApp."
  );
});

test("event fields stay collapsed until their icon row is clicked", async ({
  page,
}, testInfo) => {
  await mockCalendarApi(page, { connected: true });
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await expect(page.getByLabel("Judul", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Lokasi", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Pengulangan", exact: true })
  ).toBeHidden();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.screenshot({
    path: `/tmp/sydia-event-${testInfo.project.name}-compact.png`,
  });
  await page.getByRole("button", { name: "Ubah lokasi" }).click();
  await expect(page.getByLabel("Lokasi", { exact: true })).toBeVisible();
  await page.getByLabel("Lokasi", { exact: true }).fill("Kantor");
  await page.getByRole("button", { name: "Ubah lokasi" }).click();
  await expect(page.getByRole("button", { name: "Ubah lokasi" })).toContainText(
    "Kantor"
  );
});

test("Google destination controls whether Meet is offered and saved", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await page.getByLabel("Judul", { exact: true }).fill("Rapat mingguan");
  await page.getByRole("checkbox", { name: "Buat kalender Google" }).uncheck();
  await expect(
    page.getByRole("button", { name: "Ubah Google Meet" })
  ).toBeHidden();
  await page.getByRole("checkbox", { name: "Buat kalender Google" }).check();
  await page.getByRole("button", { name: "Ubah Google Meet" }).click();
  await page.getByRole("checkbox", { name: "Tambahkan Google Meet" }).check();
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page
    .getByRole("combobox", { name: "Pengulangan", exact: true })
    .selectOption("weekly");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.createRequest)
    .toMatchObject({
      destination: "google",
      createGoogleMeet: true,
      recurrence: ["RRULE:FREQ=WEEKLY"],
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("all-day recurring events save without hidden timed fields", async ({
  page,
}, testInfo) => {
  const mocks = await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await page.getByLabel("Judul", { exact: true }).fill("Libur tim");
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page.getByRole("checkbox", { name: "Sepanjang hari" }).check();
  await page
    .getByRole("combobox", { name: "Pengulangan", exact: true })
    .selectOption("custom");
  await page.getByLabel("Satuan pengulangan").selectOption("MONTHLY");
  await page
    .getByRole("combobox", { name: "Berakhir", exact: true })
    .selectOption("count");
  await page.getByLabel("Jumlah pengulangan").fill("3");
  await page.screenshot({
    path: `/tmp/sydia-event-${testInfo.project.name}-expanded.png`,
  });
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.createRequest)
    .toMatchObject({
      destination: "local",
      allDayStartDate: "2026-10-08",
      allDayEndDate: "2026-10-09",
      recurrence: ["RRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=3"],
    });
  expect(mocks.createRequest).not.toHaveProperty("startAt");
});

test("month cell offers separate event and task creation", async ({ page }) => {
  await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar&view=month");
  await page
    .getByRole("button", { name: "Buat pada Jumat, 9 Oktober", exact: true })
    .click({ position: { x: 5, y: 45 } });
  await expect(
    page.getByRole("menuitem", { name: "Buat Acara" })
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Buat Tugas" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tugas baru" })).toBeVisible();
});

test("time-grid slot opens the creation menu before the event editor", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar&view=day");
  await page
    .getByRole("button", { name: "Buat pada Kamis, 8 Oktober", exact: true })
    .click({ position: { x: 30, y: 460 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await page.getByLabel("Judul", { exact: true }).fill("Acara dari kalender");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect.poll(() => mocks.createRequest?.timezone).toBe("Asia/Makassar");
});

test("editing shows the existing Google Meet link on disclosure", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  mocks.event = {
    ...googleEvent,
    googleMeetUrl: "https://meet.google.com/abc-defg-hij",
    googleMeetStatus: "success",
  };
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByRole("button", { name: "Ubah Google Meet" }).click();
  await expect(
    page.getByRole("link", { name: "https://meet.google.com/abc-defg-hij" })
  ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
});

test("rich event notes keep formatting after saving and reopening", async ({
  page,
}, testInfo) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await expect(
    page.getByRole("textbox", { name: "Catatan", exact: true })
  ).toBeHidden();
  await page.getByRole("button", { name: "Ubah catatan" }).click();
  const notes = page.getByRole("textbox", { name: "Catatan", exact: true });
  await page.getByRole("button", { name: "Tebal", exact: true }).click();
  await notes.pressSequentially("Rencana peluncuran");
  await expect(notes.locator("strong")).toHaveText("Rencana peluncuran");
  await expect(
    page.getByRole("button", { name: "Simpan acara" })
  ).toBeInViewport();
  await page.screenshot({
    path: `/tmp/sydia-event-${testInfo.project.name}-rich-notes.png`,
  });
  await page.getByRole("button", { name: "Ubah catatan" }).click();
  await expect(
    page.getByRole("button", { name: "Ubah catatan" })
  ).toContainText("Rencana peluncuran");
  await expect(
    page.getByRole("button", { name: "Ubah catatan" })
  ).not.toContainText("<strong>");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.updateRequest?.description)
    .toBe("<p><strong>Rencana peluncuran</strong></p>");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await expect(page.getByRole("dialog").locator("strong")).toHaveText(
    "Rencana peluncuran"
  );
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByRole("button", { name: "Ubah catatan" }).click();
  await expect(
    page
      .getByRole("textbox", { name: "Catatan", exact: true })
      .locator("strong")
  ).toHaveText("Rencana peluncuran");
});

test("opening legacy plain-text notes does not rewrite them on an unrelated edit", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  mocks.event = { ...googleEvent, description: "Anggaran < 100\nHubungi tim" };
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByRole("button", { name: "Ubah catatan" }).click();
  await expect(
    page.getByRole("textbox", { name: "Catatan", exact: true })
  ).toContainText("Anggaran < 100");
  await page.getByLabel("Judul", { exact: true }).fill("Rapat terbaru");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.updateRequest)
    .toMatchObject({ title: "Rapat terbaru" });
  expect(mocks.updateRequest).not.toHaveProperty("description");
});

test("provider HTML notes render allowed formatting without executable markup", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  mocks.event = {
    ...googleEvent,
    description:
      '<p><strong>Agenda rapat</strong></p><p><a href="javascript:alert(1)">Tautan</a></p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
  };
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  const details = page.getByRole("dialog");
  await expect(details.locator("strong")).toHaveText("Agenda rapat");
  await expect(
    details.locator("script, img, [onerror], a[href^='javascript:']")
  ).toHaveCount(0);
});

test("timed event fields show one date and two times on the same row", async ({
  page,
}, testInfo) => {
  await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /^Tanggal / })).toHaveCount(
    1
  );
  await expect(dialog.getByRole("button", { name: /^Jam / })).toHaveCount(2);
  await expect(
    page.getByRole("checkbox", { name: "Sepanjang hari" })
  ).not.toBeChecked();
  const date = await dialog
    .getByRole("button", { name: /^Tanggal / })
    .boundingBox();

  const start = await dialog
    .getByRole("button", { name: /^Jam mulai/ })
    .boundingBox();

  const end = await dialog
    .getByRole("button", { name: /^Jam selesai/ })
    .boundingBox();

  expect(date).not.toBeNull();
  expect(start?.y).toBe(date?.y);
  expect(end?.y).toBe(date?.y);
  await page.screenshot({
    path: `/tmp/sydia-event-${testInfo.project.name}-time.png`,
  });
});

test("changing the shared event date moves both start and end times", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page.getByRole("button", { name: /^Tanggal acara/ }).click();
  await page
    .getByRole("gridcell", { name: "Jumat, 9 Oktober", exact: true })
    .click();
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.updateRequest)
    .toMatchObject({
      startAt: "2026-10-09T08:00:00.000Z",
      endAt: "2026-10-09T09:00:00.000Z",
      timezone: "Asia/Makassar",
    });
});

test("multi-day all-day events hide times and include the selected last day", async ({
  page,
}, testInfo) => {
  const mocks = await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await page.getByLabel("Judul", { exact: true }).fill("Libur beberapa hari");
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page.getByRole("checkbox", { name: "Sepanjang hari" }).check();
  await page.getByLabel("Mulai", { exact: true }).fill("2026-10-20");
  await page.getByLabel("Selesai", { exact: true }).fill("2026-10-22");
  await expect(
    page.getByRole("dialog").locator('input[type="date"]')
  ).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Jam / })).toHaveCount(0);
  await page.screenshot({
    path: `/tmp/sydia-event-${testInfo.project.name}-date-range.png`,
  });
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.createRequest)
    .toMatchObject({
      allDayStartDate: "2026-10-20",
      allDayEndDate: "2026-10-23",
    });
  expect(mocks.createRequest).not.toHaveProperty("startAt");
  expect(mocks.createRequest).not.toHaveProperty("endAt");
});

test("unchecking all-day collapses the date range to its selected start day", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  await page.getByLabel("Judul", { exact: true }).fill("Rapat setelah libur");
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page.getByRole("checkbox", { name: "Sepanjang hari" }).check();
  await page.getByLabel("Mulai", { exact: true }).fill("2026-10-20");
  await page.getByLabel("Selesai", { exact: true }).fill("2026-10-22");
  await page.getByRole("checkbox", { name: "Sepanjang hari" }).uncheck();
  await expect(
    page.getByRole("button", { name: /^Tanggal acara/ })
  ).toContainText("20 Okt 2026");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.createRequest?.startAt?.slice(0, 10))
    .toBe("2026-10-20");
  expect(mocks.createRequest?.endAt?.slice(0, 10)).toBe("2026-10-20");
  expect(mocks.createRequest).not.toHaveProperty("allDayStartDate");
});

test("an unrelated edit preserves an existing timed event spanning multiple days", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, { connected: true });
  mocks.event = { ...googleEvent, endAt: "2026-10-10T09:00:00.000Z" };
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", {
        name: "Buka Kamis, 8 Oktober",
        exact: true,
      }),
    })
    .getByRole("button", { name: /Acara: Rapat sinkron/ })
    .click();
  await page.getByRole("button", { name: "Edit acara" }).click();
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page.getByLabel("Judul", { exact: true }).fill("Judul terbaru");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect
    .poll(() => mocks.updateRequest)
    .toMatchObject({ title: "Judul terbaru" });
  expect(mocks.updateRequest).not.toHaveProperty("startAt");
  expect(mocks.updateRequest).not.toHaveProperty("endAt");
});

test("new events default to one ten-minute reminder", async ({
  page,
}, testInfo) => {
  const mocks = await mockCalendarApi(page);
  await page.goto("/e2e/calendar-sync.html?mode=calendar");
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Buat Acara" }).click();
  const reminderRow = page.getByRole("button", { name: "Ubah pengingat" });
  await expect(reminderRow).toHaveAttribute("aria-expanded", "false");
  await expect(reminderRow).toHaveText("10 menit sebelum acara");
  await expect(page.getByLabel("Pengingat sebelum acara")).toBeHidden();
  await reminderRow.click();
  const reminder = page.getByLabel("Pengingat sebelum acara");
  await expect(reminder).toHaveValue("10");
  await expect(reminder.locator("option")).toHaveText([
    "10 menit sebelumnya",
    "15 menit sebelumnya",
    "30 menit sebelumnya",
    "1 jam sebelumnya",
  ]);
  await reminderRow.click();
  await page
    .getByLabel("Judul", { exact: true })
    .fill("Acara dengan pengingat");
  await page.getByRole("button", { name: "Ubah tanggal dan waktu" }).click();
  await page.getByRole("checkbox", { name: "Sepanjang hari" }).check();
  await page.screenshot({
    path: `/tmp/sydia-event-reminder-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect.poll(() => mocks.createRequest?.reminderMinutes).toBe(10);
});

for (const minutes of [15, 30, 60]) {
  test(`an event saves its selected ${minutes}-minute reminder`, async ({
    page,
  }) => {
    const mocks = await mockCalendarApi(page, { connected: true });
    mocks.event = { ...googleEvent, reminderMinutes: 10, syncState: "synced" };
    await page.goto("/e2e/calendar-sync.html?mode=calendar");
    await page.getByRole("button", { name: /Acara: Rapat sinkron/ }).click();
    await page.getByRole("button", { name: "Edit acara" }).click();
    const reminderRow = page.getByRole("button", { name: "Ubah pengingat" });
    await reminderRow.click();
    await page
      .getByLabel("Pengingat sebelum acara")
      .selectOption(String(minutes));
    await reminderRow.click();
    await expect(reminderRow).toHaveText(
      minutes === 60 ? "1 jam sebelum acara" : `${minutes} menit sebelum acara`
    );
    await reminderRow.click();
    await expect(page.getByLabel("Pengingat sebelum acara")).toHaveValue(
      String(minutes)
    );
    await page.getByRole("button", { name: "Simpan acara" }).click();
    await expect
      .poll(() => mocks.updateRequest)
      .toEqual({ reminderMinutes: minutes });
  });
}
