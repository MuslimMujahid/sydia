import { expect, test, type Page } from "@playwright/test";
import type {
  BillingOrder,
  BillingStatus,
} from "../src/lib/services/api/billing/billing.api";

function status(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    enforced: true,
    active: true,
    state: "trial",
    trialEndsAt: "2026-10-29T00:00:00Z",
    paidUntil: null,
    lastActivatedAt: "2026-10-22T00:00:00Z",
    checkoutEnabled: true,
    environment: "sandbox",
    normalPrice: 59_000,
    price: 29_000,
    durationDays: 30,
    trialDays: 7,
    storage: {
      usedBytes: 0,
      limitBytes: 10_000_000_000,
      maxFileBytes: 100_000_000,
    },
    ...overrides,
  };
}

const profile = {
  id: "user-1",
  name: "Sari",
  email: "sari@example.test",
  timezone: "Asia/Jakarta",
  locale: "id",
  onboardingCompleted: false,
  role: "user",
};

async function setup(page: Page, billing: BillingStatus | "unavailable") {
  let current = billing === "unavailable" ? status() : billing;
  let orders: BillingOrder[] = [];
  const saved: { profile?: unknown; preferences?: unknown } = {};
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          emailVerified: true,
          image: null,
          createdAt: "2026-10-22T00:00:00Z",
          updatedAt: "2026-10-22T00:00:00Z",
        },
        session: {
          id: "session-1",
          userId: profile.id,
          expiresAt: "2026-11-22T00:00:00Z",
        },
      },
    })
  );
  await page.route("**/users/me", (route) => {
    if (route.request().method() === "PATCH") {
      saved.profile = route.request().postDataJSON();

      return route.fulfill({
        json: { data: { ...profile, onboardingCompleted: true } },
      });
    }

    return route.fulfill({ json: { data: profile } });
  });
  await page.route("**/users/me/preferences", (route) => {
    saved.preferences = route.request().postDataJSON();

    return route.fulfill({ json: { data: saved.preferences } });
  });
  await page.route("**/billing/me", (route) =>
    billing === "unavailable"
      ? route.fulfill({ status: 500, json: { message: "unavailable" } })
      : route.fulfill({ json: { data: current } })
  );
  await page.route("**/billing/orders", (route) =>
    route.fulfill({ json: { data: orders } })
  );
  await page.route("**/billing/checkouts", async (route) => {
    orders = [
      {
        id: "order-1",
        amount: 29_000,
        durationDays: 30,
        status: "pending",
        paymentUrl: "https://merchant.myr.id/invoices/test",
        expiresAt: "2026-10-22T00:15:00Z",
        appliedAt: null,
        createdAt: "2026-10-22T00:00:00Z",
      },
    ];
    await route.fulfill({ json: { data: orders[0] } });
  });
  await page.route("**/billing/orders/order-1/refresh", async (route) => {
    orders = orders.map((order) => ({
      ...order,
      status: "paid",
      appliedAt: "2026-10-22T00:05:00Z",
    }));
    current = { ...current, state: "paid", paidUntil: "2026-11-21T00:05:00Z" };
    await route.fulfill({ json: { data: orders[0] } });
  });

  return saved;
}

async function advance(page: Page, times: number) {
  for (let index = 0; index < times; index += 1)
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
}

test("without billing the wizard keeps its three steps", async ({ page }) => {
  const saved = await setup(
    page,
    status({ state: "disabled", enforced: false })
  );

  await page.goto("/e2e/onboarding.html");
  await expect(page.getByText("Pengaturan awal · 1 dari 3")).toBeVisible();
  await advance(page, 2);
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(page.getByRole("heading", { name: "Chat Sydia" })).toBeVisible();
  expect(saved.profile).toMatchObject({ onboardingCompleted: true });
});

test("a billing status failure does not block onboarding", async ({ page }) => {
  await setup(page, "unavailable");
  await page.goto("/e2e/onboarding.html");
  await expect(page.getByText("Pengaturan awal · 1 dari 3")).toBeVisible();
});

test("onboarding asks for payment before it can be completed", async ({
  page,
}) => {
  const saved = await setup(page, status());
  await page.goto("/e2e/onboarding.html");
  await expect(page.getByText("Pengaturan awal · 1 dari 4")).toBeVisible();
  await advance(page, 3);
  await expect(
    page.getByRole("heading", { name: "Pilih cara memulai" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bayar sekarang" })
  ).toBeVisible();
  await expect(page.getByText("Rp 29.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 59.000", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Trial gratis 7 hari aktif hingga/)
  ).toBeVisible();
  // Nothing is saved or completed until the user chooses how to start.
  expect(saved.profile).toBeUndefined();
  await page.getByLabel("Nomor telepon untuk tagihan").fill("+6281234567890");
  await page.getByRole("button", { name: /Buat tagihan/ }).click();
  await expect(
    page.getByRole("link", { name: "Bayar melalui Mayar" })
  ).toBeVisible();
  // Creating an invoice is not onboarding submission.
  expect(saved.profile).toBeUndefined();
  await expect(page.getByRole("heading", { name: "Chat Sydia" })).toHaveCount(
    0
  );
});

test("a paid user finishes onboarding from the payment step", async ({
  page,
}) => {
  const saved = await setup(page, status());
  await page.goto("/e2e/onboarding.html");
  await advance(page, 3);
  await page.getByLabel("Nomor telepon untuk tagihan").fill("+6281234567890");
  await page.getByRole("button", { name: /Buat tagihan/ }).click();
  await page.getByRole("button", { name: "Periksa pembayaran" }).click();
  await expect(page.getByText(/Pembayaran diterima/)).toBeVisible();
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();
  await expect(page.getByRole("heading", { name: "Chat Sydia" })).toBeVisible();
  expect(saved.profile).toMatchObject({ onboardingCompleted: true });
});

test("the free trial remains an explicit way to finish onboarding", async ({
  page,
}) => {
  const saved = await setup(page, status());
  await page.goto("/e2e/onboarding.html");
  await advance(page, 3);
  await page
    .getByRole("button", { name: "Lanjut dengan trial gratis" })
    .click();
  await expect(page.getByRole("heading", { name: "Chat Sydia" })).toBeVisible();
  expect(saved.profile).toMatchObject({ onboardingCompleted: true });
  expect(saved.preferences).toMatchObject({ persona: "professional" });
});

test("an expired account cannot finish onboarding without paying", async ({
  page,
}) => {
  await setup(page, status({ active: false, state: "expired" }));
  await page.goto("/e2e/onboarding.html");
  await advance(page, 3);
  await expect(
    page.getByRole("heading", { name: "Masa aktif habis" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bayar untuk melanjutkan" })
  ).toBeDisabled();
});
