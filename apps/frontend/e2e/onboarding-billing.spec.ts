import { expect, test, type Page } from "@playwright/test";
import type { WhatsAppStatus } from "../src/lib/services/api/whatsapp/whatsapp.api";

test.setTimeout(60_000);

const profile = {
  id: "user-1",
  name: "Sari",
  email: "sari@example.test",
  timezone: "Asia/Jakarta",
  locale: "id",
  onboardingCompleted: false,
  role: "user",
};

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

async function setup(page: Page, user = profile) {
  const state = {
    completed: false,
    billingRequests: 0,
    greetingRequests: [] as { content: string; idempotencyKey: string }[],
    failGreeting: false,
    preferenceFailure: false,
    savedProfile: undefined as Record<string, unknown> | undefined,
    savedPreferences: undefined as unknown,
    preferences: {
      persona: "professional",
      preferredAddress: null as string | null,
    },
    telegramLinked: false,
    telegramAvailable: true,
    whatsapp: { ...idle },
    qrCount: 0,
    failQr: false,
  };

  await page.route("**/conversations/messages", (route) => {
    state.greetingRequests.push(route.request().postDataJSON());
    if (state.failGreeting)
      return route.fulfill({
        status: 503,
        json: {
          error: { message: "Percakapan belum dapat dimulai. Coba lagi." },
        },
      });

    return route.fulfill({
      json: {
        data: {
          conversation: { id: "welcome-conversation" },
          userMessage: {
            id: "greeting",
            content: route.request().postDataJSON().content,
            createdAt: "2026-11-07T00:00:00Z",
          },
          assistantMessage: null,
          assistantRun: {
            id: "welcome-run",
            status: "queued",
            createdAt: "2026-11-07T00:00:00Z",
          },
          toolInvocations: [],
        },
      },
    });
  });
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        user: { ...user, emailVerified: true },
        session: {
          id: "session-1",
          userId: user.id,
          expiresAt: "2099-11-22T00:00:00Z",
        },
      },
    })
  );
  await page.route("**/users/me", (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.savedProfile = body;
      state.completed = body.onboardingCompleted === true;
    }

    return route.fulfill({
      json: {
        data: {
          ...user,
          ...state.savedProfile,
          onboardingCompleted: state.completed,
        },
      },
    });
  });
  await page.route("**/users/me/preferences", (route) => {
    if (route.request().method() === "PATCH") {
      if (state.preferenceFailure)
        return route.fulfill({
          status: 503,
          json: {
            error: { message: "Preferensi belum dapat disimpan. Coba lagi." },
          },
        });
      state.savedPreferences = route.request().postDataJSON();
      state.preferences = {
        ...state.preferences,
        ...route.request().postDataJSON(),
      };
    }

    return route.fulfill({ json: { data: state.preferences } });
  });
  await page.route("http://localhost:5000/billing/**", (route) => {
    state.billingRequests++;

    return route.fulfill({
      status: 500,
      json: { message: "Billing unavailable" },
    });
  });
  await page.route("**/billing/gifts", (route) => {
    state.billingRequests++;

    return route.fulfill({ json: { data: [] } });
  });
  await page.route("**/billing/me", (route) => {
    state.billingRequests++;

    return route.fulfill({
      json: {
        data: {
          enforced: false,
          active: true,
          state: "disabled",
          trialEndsAt: null,
          paidUntil: null,
          lastActivatedAt: null,
          checkoutEnabled: false,
          environment: "sandbox",
          normalPrice: 59000,
          price: 29000,
          durationDays: 30,
          trialDays: 7,
          storage: {
            usedBytes: 0,
            limitBytes: 100000000,
            maxFileBytes: 100000000,
          },
        },
      },
    });
  });
  await page.route("http://localhost:5000/conversations", (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.route("**/telegram/status", (route) =>
    route.fulfill({
      json: {
        data: {
          available: state.telegramAvailable,
          linked: state.telegramLinked,
          username: state.telegramLinked ? "sari" : null,
          botUsername: "sydia_bot",
        },
      },
    })
  );
  await page.route("**/telegram/link", (route) =>
    route.fulfill({
      json: {
        data: {
          url: "https://t.me/sydia_bot?start=test",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      },
    })
  );
  await page.route("https://t.me/**", (route) =>
    route.fulfill({ body: "Telegram test" })
  );
  await page.route("**/whatsapp/status", (route) =>
    route.fulfill({ json: { data: state.whatsapp } })
  );
  await page.route("**/whatsapp/companion/qr", (route) => {
    state.qrCount++;
    if (state.failQr)
      return route.fulfill({
        status: 503,
        json: { error: { message: "Kode QR tidak dapat dimuat. Coba lagi." } },
      });
    state.whatsapp = {
      ...idle,
      setupPhase: "pairing",
      status: "awaiting_pair",
    };

    return route.fulfill({
      json: {
        data: {
          attemptId: `qr-${state.qrCount}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          assetPath: `/whatsapp/companion/qr/qr-${state.qrCount}`,
        },
      },
    });
  });
  await page.route("**/whatsapp/companion/qr/*", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="165" height="165"><rect width="165" height="165" fill="white"/><path d="M10 10h45v45H10zM110 10h45v45h-45zM10 110h45v45H10z" fill="black"/></svg>',
    })
  );
  await page.route("**/whatsapp/link-code", (route) =>
    route.fulfill({
      json: {
        data: {
          code: "SYDIA-7A2C9F10",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      },
    })
  );

  return state;
}

async function openChannels(page: Page) {
  await page.goto("/e2e/onboarding.html");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
}

test("channel setup replaces billing and can be skipped without a billing request", async ({
  page,
}) => {
  const state = await setup(page);
  await openChannels(page);
  await expect(page.getByText("Pengaturan awal · 5 dari 5")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lanjutkan", exact: true })
  ).toBeDisabled();
  await page.getByRole("button", { name: "Lewati untuk sekarang" }).click();
  await expect(page.getByText("Menyiapkan Sydia untuk Anda")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Halo, Sari! Sydia siap menemanimu." })
  ).toBeVisible();
  expect(state.billingRequests).toBe(0);
  await page.getByRole("button", { name: "Katakan Hai" }).click();
  await expect(
    page.getByRole("heading", { name: "Chat Sydia" })
  ).toHaveAttribute("data-conversation", "welcome-conversation");
  expect(state.greetingRequests).toEqual([
    {
      content: "Hai Sydia, salam kenal. Kamu bisa bantu apa aja?",
      idempotencyKey: expect.any(String),
    },
  ]);
  expect(state.savedProfile).toMatchObject({ onboardingCompleted: true });
});

test("a pending Sydia Plus gift waits until the user leaves the onboarding welcome", async ({
  page,
}) => {
  await setup(page);
  let giftRequests = 0;
  await page.route("**/billing/gifts", (route) => {
    giftRequests++;

    return route.fulfill({
      json: {
        data: [
          {
            id: "welcome-gift",
            durationDays: 30,
            paidUntil: "2026-12-08T00:00:00Z",
          },
        ],
      },
    });
  });

  await openChannels(page);
  const celebration = page.getByRole("complementary", {
    name: "Hadiah Sydia Plus",
  });

  const skip = page.getByRole("button", { name: "Lewati untuk sekarang" });
  await expect(skip).toBeVisible();
  await expect(celebration).toHaveCount(0);
  expect(giftRequests).toBe(0);

  await skip.click();
  const greeting = page.getByRole("button", { name: "Katakan Hai" });
  await expect(greeting).toBeVisible();
  await expect(celebration).toHaveCount(0);
  expect(giftRequests).toBe(0);

  await greeting.click();
  await expect(page.getByRole("heading", { name: "Chat Sydia" })).toBeVisible();
  await expect(
    celebration.getByRole("heading", { name: "Kamu dapat Sydia Plus!" })
  ).toBeVisible();
});

test("returning from channels preserves name and persona for the welcome", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/e2e/onboarding.html");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByLabel("Panggilan", { exact: true }).fill("Kak Sari");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Persona berikutnya" }).click();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Ramah", exact: true })
  ).toBeChecked();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await page.getByRole("button", { name: "Lewati untuk sekarang" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Halo, Kak Sari! Sydia siap menemanimu.",
    })
  ).toBeVisible();
  await expect(page.locator(".welcome-avatar img")).toHaveAttribute(
    "src",
    /haruka_friendly/
  );
  expect(state.savedPreferences).toMatchObject({
    persona: "friendly",
    preferredAddress: "Kak Sari",
  });
});

test("Telegram must confirm linking before onboarding can continue", async ({
  page,
}) => {
  const state = await setup(page);
  await openChannels(page);
  await page.getByRole("radio", { name: "Telegram", exact: true }).check();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByRole("button", { name: "Buka Telegram", exact: true })
    .click();
  await expect(
    page.getByText(/Menunggu konfirmasi dari Telegram/)
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lanjutkan", exact: true })
  ).toBeDisabled();
  expect(state.savedProfile).toMatchObject({ onboardingCompleted: false });
  state.telegramLinked = true;
  await expect(
    page.getByRole("heading", { name: "Telegram sudah terhubung" })
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("@sari", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(
    page.getByRole("heading", { name: /Halo, Sari!/ })
  ).toBeVisible();
});

test("unavailable Telegram explains availability and allows skipping", async ({
  page,
}) => {
  const state = await setup(page);
  state.telegramAvailable = false;
  await openChannels(page);
  await page.getByRole("radio", { name: "Telegram", exact: true }).check();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(
    page.getByText(/Integrasi Telegram belum tersedia/)
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lanjutkan", exact: true })
  ).toBeDisabled();
  await page.getByRole("button", { name: "Lewati untuk sekarang" }).click();
  await expect(
    page.getByRole("heading", { name: /Halo, Sari!/ })
  ).toBeVisible();
});

test("WhatsApp explains two numbers before QR and requires owner verification", async ({
  page,
}) => {
  const state = await setup(page);
  await openChannels(page);
  await page.getByRole("radio", { name: "WhatsApp", exact: true }).check();
  await expect(page.getByText("Sydia butuh dua nomor WhatsApp")).toBeVisible();
  expect(state.qrCount).toBe(0);
  await page.getByRole("button", { name: "Saya punya dua nomor" }).click();
  await expect(
    page.getByRole("img", {
      name: "Kode QR untuk menautkan akun WhatsApp asisten",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lanjutkan", exact: true })
  ).toBeDisabled();
  state.whatsapp = {
    ...idle,
    setupPhase: "owner_verification",
    status: "connected",
    assistantNumber: "6281234567890",
  };
  await expect(
    page.getByRole("heading", { name: "Verifikasi nomor pribadi" })
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("SYDIA-7A2C9F10", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Buka di WhatsApp pribadi" })
  ).toHaveAttribute("href", "https://wa.me/6281234567890?text=SYDIA-7A2C9F10");
  await expect(
    page.getByRole("button", { name: "Lanjutkan", exact: true })
  ).toBeDisabled();
  expect(state.savedProfile).toMatchObject({ onboardingCompleted: false });
  state.whatsapp = {
    ...state.whatsapp,
    setupPhase: "ready",
    linked: true,
    connected: true,
    ownerNumber: "6285712345678",
  };
  await expect(
    page.getByRole("heading", { name: "WhatsApp sudah terhubung" })
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(
    page.getByRole("heading", { name: /Halo, Sari!/ })
  ).toBeVisible();
});

test("a failed QR request surfaces an error and can be retried", async ({
  page,
}) => {
  const state = await setup(page);
  state.failQr = true;
  await openChannels(page);
  await page.getByRole("radio", { name: "WhatsApp", exact: true }).check();
  await page.getByRole("button", { name: "Saya punya dua nomor" }).click();
  await expect(
    page.getByText("Kode QR tidak dapat dimuat. Coba lagi.")
  ).toBeVisible();
  state.failQr = false;
  await page.getByRole("button", { name: "Muat kode QR", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "Kode QR untuk menautkan akun WhatsApp asisten",
    })
  ).toBeVisible();
  expect(state.qrCount).toBe(2);
});

test("name, self-description and persona are saved before choosing a channel", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/e2e/onboarding.html");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByLabel("Panggilan", { exact: true }).fill("Kak Sari");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("radio", { name: "Pedagang / pemilik usaha" }).check();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(page.getByText("Pengaturan awal · 5 dari 5")).toBeVisible();
  expect(state.savedPreferences).toMatchObject({
    preferredAddress: "Kak Sari",
    occupation: "business_owner",
  });
  expect(state.savedProfile).toMatchObject({ onboardingCompleted: false });
});

test.describe("on a device set to WITA", () => {
  test.use({ timezoneId: "Asia/Makassar" });

  test("onboarding proposes and saves the device timezone, not the WIB default", async ({
    page,
  }) => {
    const state = await setup(page);
    await page.goto("/e2e/onboarding.html");
    await expect(
      page.getByRole("button", { name: "Zona waktu", exact: true })
    ).toHaveText("Asia/Makassar");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
    await expect(page.getByText("Pengaturan awal · 5 dari 5")).toBeVisible();
    expect(state.savedProfile).toMatchObject({ timezone: "Asia/Makassar" });
  });

  test("a zone the user already chose is kept", async ({ page }) => {
    await setup(page, { ...profile, timezone: "Asia/Jayapura" });
    await page.goto("/e2e/onboarding.html");
    await expect(
      page.getByRole("button", { name: "Zona waktu", exact: true })
    ).toHaveText("Asia/Jayapura");
  });
});

test("a failed save before the channel step stays on the persona step for retry", async ({
  page,
}) => {
  const state = await setup(page);
  state.preferenceFailure = true;
  await openChannels(page);
  await expect(page.getByRole("alert")).toContainText(
    "Preferensi belum dapat disimpan"
  );
  await expect(page.getByText("Pengaturan awal · 4 dari 5")).toBeVisible();
  state.preferenceFailure = false;
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(page.getByText("Pengaturan awal · 5 dari 5")).toBeVisible();
});

test("saving failure keeps onboarding open and supports an explicit retry", async ({
  page,
}) => {
  const state = await setup(page);
  await openChannels(page);
  const skip = page.getByRole("button", { name: "Lewati untuk sekarang" });
  await expect(skip).toBeVisible();
  state.preferenceFailure = true;
  await skip.click();
  await expect(page.getByRole("alert")).toContainText(
    "Preferensi belum dapat disimpan"
  );
  expect(state.savedProfile).toMatchObject({ onboardingCompleted: false });
  state.preferenceFailure = false;
  await skip.click();
  await expect(
    page.getByRole("heading", { name: /Halo, Sari!/ })
  ).toBeVisible();
});

test("welcome animates aurora and confetti and respects reduced motion", async ({
  page,
}) => {
  await setup(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Lewati untuk sekarang" }).click();
  await expect(
    page.getByRole("heading", { name: /Halo, Sari!/ })
  ).toBeVisible();
  await expect(page.locator(".welcome-aurora span").first()).toHaveCSS(
    "animation-name",
    "welcome-bloom"
  );
  await expect(page.locator(".welcome-confetti span").first()).toHaveCSS(
    "animation-name",
    "welcome-drift"
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".welcome-aurora span").first()).toHaveCSS(
    "animation-name",
    "none"
  );
  await expect(page.locator(".welcome-confetti span").first()).toHaveCSS(
    "animation-name",
    "none"
  );
  await expect(page.getByRole("button", { name: "Katakan Hai" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test("English welcome sends the English greeting into a new conversation", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/e2e/onboarding.html");
  await page.getByRole("button", { name: "Bahasa", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Bahasa Inggris" }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await page.getByRole("button", { name: "Lewati untuk sekarang" }).click();
  await page.getByRole("button", { name: "Say Hi" }).click();
  await expect(
    page.getByRole("heading", { name: "Chat Sydia" })
  ).toHaveAttribute("data-conversation", "welcome-conversation");
  expect(state.greetingRequests).toEqual([
    {
      content: "Hi Sydia, nice to meet you. What could you help me with?",
      idempotencyKey: expect.any(String),
    },
  ]);
});

test("retrying a failed welcome greeting keeps its idempotency key", async ({
  page,
}) => {
  const state = await setup(page);
  state.failGreeting = true;
  await openChannels(page);
  await page.getByRole("button", { name: "Lewati untuk sekarang" }).click();
  await page.getByRole("button", { name: "Katakan Hai" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Percakapan belum dapat dimulai"
  );
  state.failGreeting = false;
  await page.getByRole("button", { name: "Katakan Hai" }).click();
  await expect(
    page.getByRole("heading", { name: "Chat Sydia" })
  ).toHaveAttribute("data-conversation", "welcome-conversation");
  expect(state.greetingRequests).toHaveLength(2);
  expect(state.greetingRequests[1]).toEqual(state.greetingRequests[0]);
});

test("each step shows its heading exactly once", async ({ page }) => {
  await setup(page);
  await page.goto("/e2e/onboarding.html");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Interaksi seperti apa yang kamu harapkan?",
    })
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Di mana kamu mau mengobrol dengan Sydia?",
    })
  ).toHaveCount(1);
});
