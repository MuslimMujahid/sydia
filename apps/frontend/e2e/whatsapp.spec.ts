import { expect, test, type Page } from "@playwright/test";
import type { WhatsAppStatus } from "../src/lib/services/api/whatsapp/whatsapp.api";

const idle: WhatsAppStatus = {
  connected: false,
  linked: false,
  setupPhase: "disconnected",
  status: "disconnected",
  assistantNumber: null,
  ownerNumber: null,
  reason: null,
  ownerCodeExpiresAt: null,
  qrExpiresAt: null,
};

const ready: WhatsAppStatus = {
  ...idle,
  connected: true,
  linked: true,
  setupPhase: "ready",
  status: "connected",
  assistantNumber: "6281234567890",
  ownerNumber: "6285712345678",
};

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64"
);

test.setTimeout(60_000);

async function provider(page: Page, initial: WhatsAppStatus = idle) {
  const state = {
    status: { ...initial },
    failQr: false,
    failDisconnect: false,
    qrCount: 0,
    qrRequests: [] as unknown[],
    codeCount: 0,
    statusRequests: 0,
  };

  await page.route("**/whatsapp/status", (route) => {
    state.statusRequests++;

    return route.fulfill({ json: { data: state.status } });
  });
  await page.route("**/whatsapp/companion/qr", async (route) => {
    state.qrCount++;
    state.qrRequests.push(route.request().postDataJSON());
    if (state.failQr)
      return route.fulfill({
        status: 503,
        json: { error: { message: "Kode QR tidak dapat dimuat. Coba lagi." } },
      });
    state.status = { ...idle, setupPhase: "pairing", status: "awaiting_pair" };

    return route.fulfill({
      json: {
        data: {
          attemptId: `qr-${state.qrCount}`,
          expiresAt: new Date(
            (await page.evaluate(() => Date.now())) + 60_000
          ).toISOString(),
          assetPath: `/whatsapp/companion/qr/qr-${state.qrCount}`,
        },
      },
    });
  });
  await page.route("**/whatsapp/companion/qr/*", (route) =>
    route.fulfill({ contentType: "image/png", body: png })
  );
  await page.route("**/whatsapp/link-code", async (route) => {
    state.codeCount++;

    return route.fulfill({
      json: {
        data: {
          code: "SYDIA-7A2C9F10",
          expiresAt: new Date(
            (await page.evaluate(() => Date.now())) + 600_000
          ).toISOString(),
        },
      },
    });
  });
  await page.route("**/whatsapp/owner/replace", async (route) => {
    state.status = {
      ...ready,
      linked: false,
      connected: false,
      ownerNumber: null,
      setupPhase: "owner_verification",
    };

    return route.fulfill({
      json: {
        data: {
          code: "SYDIA-7A2C9F10",
          expiresAt: new Date(
            (await page.evaluate(() => Date.now())) + 600_000
          ).toISOString(),
        },
      },
    });
  });
  await page.route("**/whatsapp/link", (route) => {
    if (state.failDisconnect)
      return route.fulfill({
        status: 503,
        json: { error: { message: "Koneksi belum dapat diputuskan." } },
      });
    state.status = { ...idle };

    return route.fulfill({ json: { data: { revoked: true } } });
  });

  return state;
}

const open = (page: Page) => page.goto("/e2e/calendar-sync.html?mode=whatsapp");
const connection = (page: Page) =>
  page.getByRole("switch", {
    name: "WhatsApp",
    exact: true,
    includeHidden: true,
  });

test("WhatsApp QR setup waits for provider login and separate owner verification", async ({
  page,
}) => {
  const state = await provider(page);
  await open(page);
  await connection(page).click();
  await expect(
    page.getByAltText("Kode QR untuk menautkan akun WhatsApp asisten")
  ).toBeVisible();
  await expect(connection(page)).not.toBeChecked();
  state.status = {
    ...ready,
    connected: false,
    linked: false,
    ownerNumber: null,
    setupPhase: "owner_verification",
  };
  await expect(page.getByText("SYDIA-7A2C9F10", { exact: true })).toBeVisible();
  await expect(connection(page)).not.toBeChecked();
  state.status = { ...ready };
  await expect(connection(page)).toBeChecked({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: "Ganti nomor asisten" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ganti nomor pribadi" })
  ).toBeVisible();
  await expect(
    page.getByAltText("Kode QR untuk menautkan akun WhatsApp asisten")
  ).toHaveCount(0);
});

test("WhatsApp QR failure remains actionable with no pairing-code fallback", async ({
  page,
}) => {
  const state = await provider(page);
  state.failQr = true;
  await open(page);
  await connection(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "Kode QR tidak dapat dimuat"
  );
  await expect(connection(page)).not.toBeChecked();
  await expect(connection(page)).toBeEnabled();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("WhatsApp expired QR disappears and refresh waits for an explicit action", async ({
  page,
}) => {
  await page.clock.install();
  const state = await provider(page);
  await open(page);
  await connection(page).click();
  const qr = page.getByAltText("Kode QR untuk menautkan akun WhatsApp asisten");
  await expect(qr).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(qr).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Kode QR kedaluwarsa" })
  ).toBeVisible();
  expect(state.qrCount).toBe(1);
  await page
    .getByRole("button", { name: "Muat kode QR baru", exact: true })
    .click();
  await expect(qr).toBeVisible();
  expect(state.qrRequests).toEqual([{ refresh: false }, { refresh: true }]);
});

test("WhatsApp expired owner message becomes compact recovery and requires explicit renewal", async ({
  page,
}) => {
  await page.clock.install();
  const state = await provider(page, {
    ...ready,
    connected: false,
    linked: false,
    ownerNumber: null,
    setupPhase: "owner_verification",
  });

  await open(page);
  await expect(page.getByText("SYDIA-7A2C9F10", { exact: true })).toBeVisible();
  await page.clock.fastForward(601_000);
  await expect(page.getByText(/^Verifikasi kedaluwarsa ·/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verifikasi nomor pribadi Anda" })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salin pesan" })).toHaveCount(
    0
  );
  await expect(
    page.getByText(
      "Nomor pribadi belum terverifikasi. Buat pesan baru, lalu kirim dari WhatsApp pribadi Anda. Pesan sebelumnya tidak berlaku."
    )
  ).toBeVisible();
  expect(state.codeCount).toBe(1);
  await page
    .getByRole("button", { name: "Buat pesan baru", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Salin pesan" })).toBeVisible();
  expect(state.codeCount).toBe(2);
  await expect(connection(page)).not.toBeChecked();
});

test("WhatsApp reopening expired verification waits for explicit renewal", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-22T10:00:00Z") });
  const state = await provider(page, {
    ...ready,
    connected: false,
    linked: false,
    ownerNumber: null,
    setupPhase: "owner_verification",
    ownerCodeExpiresAt: "2026-10-22T09:59:00Z",
  });

  await open(page);
  await expect(page.getByText(/^Verifikasi kedaluwarsa ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salin pesan" })).toHaveCount(
    0
  );
  expect(state.codeCount).toBe(0);
  await page
    .getByRole("button", { name: "Buat pesan baru", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Salin pesan" })).toBeVisible();
  expect(state.codeCount).toBe(1);
});

test("WhatsApp disconnect requires confirmation and cancellation preserves connection", async ({
  page,
}) => {
  await provider(page, ready);
  await open(page);
  await connection(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(connection(page)).toBeChecked();
  await connection(page).click();
  await page
    .getByRole("button", { name: "Putuskan WhatsApp", exact: true })
    .click();
  await expect(connection(page)).not.toBeChecked();
});

test("WhatsApp disconnect failure preserves connection and permits retry", async ({
  page,
}) => {
  const state = await provider(page, ready);
  state.failDisconnect = true;
  await open(page);
  await connection(page).click();
  await page
    .getByRole("button", { name: "Putuskan WhatsApp", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Koneksi belum dapat diputuskan"
  );
  await expect(connection(page)).toBeChecked();
  state.failDisconnect = false;
  await page
    .getByRole("button", { name: "Putuskan WhatsApp", exact: true })
    .click();
  await expect(connection(page)).not.toBeChecked();
});

test("WhatsApp owner edit requires new verification rather than silently trusting a number", async ({
  page,
}) => {
  await provider(page, ready);
  await open(page);
  await page.getByRole("button", { name: "Ganti nomor pribadi" }).click();
  await expect(page.getByRole("dialog")).toContainText("Ganti nomor pribadi?");
  await page
    .getByRole("button", { name: "Lanjutkan ganti nomor", exact: true })
    .click();
  await expect(page.getByText("SYDIA-7A2C9F10", { exact: true })).toBeVisible();
  await expect(connection(page)).not.toBeChecked();
});

test("WhatsApp restriction presents reason without retrying provider login", async ({
  page,
}) => {
  const state = await provider(page, {
    ...ready,
    connected: false,
    status: "enforced",
    reason: "Pengiriman dibatasi oleh WhatsApp.",
  });

  await open(page);
  await expect(
    page.getByText("Pengiriman dibatasi oleh WhatsApp.")
  ).toBeVisible();
  const statusRequests = state.statusRequests;
  await page
    .getByRole("button", { name: "Periksa status", exact: true })
    .click();
  await expect.poll(() => state.statusRequests).toBeGreaterThan(statusRequests);
  await expect(
    page.getByRole("button", { name: "Sambungkan kembali", exact: true })
  ).toHaveCount(0);
  expect(state.qrCount).toBe(0);
});

test("WhatsApp mobile QR explains a second screen and keeps controls within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const state = await provider(page);
  await open(page);
  await connection(page).click();
  await expect(page.getByText(/Tampilkan Sydia di layar lain/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Perbarui QR" })).toBeVisible();
  expect(state.qrRequests).toEqual([{ refresh: false }]);
  await page.getByRole("button", { name: "Perbarui QR" }).click();
  await expect
    .poll(() => state.qrRequests)
    .toEqual([{ refresh: false }, { refresh: true }]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
