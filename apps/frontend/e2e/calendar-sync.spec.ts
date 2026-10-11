import { expect, test, type Page } from "@playwright/test";
import type {
  CalendarEvent,
  CalendarEventWriteInput,
  CalendarSyncConflict,
} from "../src/lib/services/api/calendar/calendar.api";

const timestamp = "2026-10-08T08:00:00.000Z";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110";

const googleEvent: CalendarEvent = {
  id: "event-1",
  provider: "google",
  providerEventId: "google-event-1",
  title: "Rapat sinkron",
  description: null,
  location: "Ruang rapat",
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

const conflict: CalendarSyncConflict = {
  id: "conflict-1",
  eventId: googleEvent.id,
  title: googleEvent.title,
  localRevision: 3,
  remoteEtag: "etag-google-2",
  fields: ["title"],
  local: {
    title: "Rapat versi Sydia",
    description: null,
    location: googleEvent.location,
    startAt: googleEvent.startAt,
    endAt: googleEvent.endAt,
    timezone: googleEvent.timezone,
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    attendees: [],
    status: "confirmed",
  },
  remote: {
    title: "Rapat versi Google",
    description: null,
    location: googleEvent.location,
    startAt: googleEvent.startAt,
    endAt: googleEvent.endAt,
    timezone: googleEvent.timezone,
    allDayStartDate: null,
    allDayEndDate: null,
    recurrence: [],
    attendees: [],
    status: "confirmed",
  },
  remoteDeleted: false,
  createdAt: timestamp,
};

type CalendarMocks = {
  connected: boolean;
  disconnectPending: boolean;
  disconnectFailuresRemaining: number;
  conflictOpen: boolean;
  event: CalendarEvent;
  connectCount: number;
  disconnectCount: number;
  retryCount: number;
  pollCount: number;
  pollPending: boolean;
  lastSyncedAt: string;
  updateRequest: Partial<CalendarEventWriteInput> | null;
  resolutionRequest: {
    resolution: "keep_sydia" | "use_google";
    expectedLocalRevision: number;
    expectedRemoteEtag: string | null;
  } | null;
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
    openConflictCount: mocks.connected && mocks.conflictOpen ? 1 : 0,
    available: true,
  };
}

async function mockCalendarApi(
  page: Page,
  options: {
    connected?: boolean;
    conflictOpen?: boolean;
    disconnectFailuresRemaining?: number;
  } = {}
): Promise<CalendarMocks> {
  const mocks: CalendarMocks = {
    connected: options.connected ?? false,
    disconnectPending: false,
    disconnectFailuresRemaining: options.disconnectFailuresRemaining ?? 0,
    conflictOpen: options.conflictOpen ?? false,
    event: googleEvent,
    connectCount: 0,
    disconnectCount: 0,
    retryCount: 0,
    pollCount: 0,
    pollPending: false,
    lastSyncedAt: timestamp,
    updateRequest: null,
    resolutionRequest: null,
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

    if (pathname === "/calendar/conflicts")
      return route.fulfill({
        json: { data: mocks.conflictOpen ? [conflict] : [] },
      });

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
      mocks.conflictOpen = false;

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

    if (pathname === `/calendar/conflicts/${conflict.id}/resolve`) {
      const body = request.postDataJSON() as CalendarMocks["resolutionRequest"];
      mocks.resolutionRequest = body;
      mocks.conflictOpen = false;

      return route.fulfill({ json: { data: mocks.event } });
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

function googleCardStatus(page: Page, label: string) {
  return page
    .getByRole("heading", { name: "Google Calendar" })
    .locator("..")
    .getByText(label, { exact: true });
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

test("connects through a mocked Google authorization return", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page);

  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(googleCardStatus(page, "Belum terhubung")).toBeVisible();
  await page.getByRole("button", { name: "Hubungkan Google" }).click();

  await expect.poll(() => mocks.connectCount).toBe(1);
  await page.waitForURL(/oauthReturn=success/);
  await expect(googleCardStatus(page, "Terhubung")).toBeVisible();
});

test("sends the compared revision and ETag when resolving a conflict", async ({
  page,
}) => {
  const mocks = await mockCalendarApi(page, {
    connected: true,
    conflictOpen: true,
  });

  await page.goto("/e2e/calendar-sync.html?mode=integrations");
  await expect(page.getByText("Rapat versi Sydia")).toBeVisible();
  await page.getByRole("button", { name: "Pertahankan versi Sydia" }).click();

  await expect
    .poll(() => mocks.resolutionRequest?.resolution)
    .toBe("keep_sydia");
  expect(mocks.resolutionRequest).toMatchObject({
    resolution: "keep_sydia",
    expectedLocalRevision: 3,
    expectedRemoteEtag: "etag-google-2",
  });
  await expect(page.getByText("Rapat versi Sydia")).toHaveCount(0);
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
  await expect(googleCardStatus(page, "Terhubung")).toBeVisible();
  await page.getByRole("button", { name: "Putuskan" }).click();
  await page.getByRole("button", { name: "Ya, putuskan" }).click();

  await expect(googleCardStatus(page, "Belum terhubung")).toBeVisible();
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
  await expect(googleCardStatus(page, "Terhubung")).toBeVisible();
  await page.getByRole("button", { name: "Putuskan" }).click();
  await page.getByRole("button", { name: "Ya, putuskan" }).click();

  await expect(
    googleCardStatus(page, "Pencabutan izin tertunda")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Coba cabut izin lagi" })
  ).toBeVisible();
  expect(mocks.connected).toBe(false);
  expect(mocks.disconnectCount).toBe(1);

  await page.getByRole("button", { name: "Coba cabut izin lagi" }).click();

  await expect(googleCardStatus(page, "Belum terhubung")).toBeVisible();
  expect(mocks.connected).toBe(false);
  expect(mocks.disconnectCount).toBe(2);
});
