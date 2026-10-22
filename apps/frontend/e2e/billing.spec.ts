import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type {
  BillingOrder,
  BillingStatus,
} from "../src/lib/services/api/billing/billing.api";

function trial(): BillingStatus {
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
      usedBytes: 1_500_000_000,
      limitBytes: 10_000_000_000,
      maxFileBytes: 100_000_000,
    },
  };
}

async function setup(page: Page, initial = trial()) {
  let status = initial;
  let orders: BillingOrder[] = [];
  let submitted: unknown;
  await page.route("**/billing/me", (route) =>
    route.fulfill({ json: { data: status } })
  );
  await page.route("**/billing/orders", (route) =>
    route.fulfill({ json: { data: orders } })
  );
  await page.route("**/billing/checkouts", async (route) => {
    submitted = route.request().postDataJSON();
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
    status = { ...status, state: "paid", paidUntil: "2026-11-21T00:05:00Z" };
    await route.fulfill({ json: { data: orders[0] } });
  });

  return {
    submitted: () => submitted,
    setOrders: (value: BillingOrder[]) => {
      orders = value;
    },
  };
}

test("billing shows one promotional price, trial, and global storage", async ({
  page,
}, info) => {
  await setup(page);
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByRole("heading", { name: "Status langganan" })
  ).toBeVisible();
  await expect(page.getByText("Trial aktif", { exact: true })).toBeVisible();
  await expect(page.getByText("5 hari lagi", { exact: true })).toBeVisible();
  await expect(page.getByText("Aktif hingga 29 Okt 2026, 08.00")).toBeVisible();
  await expect(page.getByText("Rp 29.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 59.000", { exact: true })).toBeVisible();
  await expect(page.getByText("1,5 GB terpakai dari 10 GB")).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Penyimpanan" })
  ).toHaveAttribute("max", "10000000000");
  await expect(page.getByRole("link", { name: /Pro$/ })).toHaveCount(0);
  await mkdir("../../.impeccable/review", { recursive: true });
  await page.screenshot({
    path: `../../.impeccable/review/${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("checkout keeps pricing on the server and verifies payment before showing paid access", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/e2e/billing.html");
  await page.getByLabel("Nomor telepon untuk tagihan").fill("+6281234567890");
  await page.getByRole("button", { name: /Buat tagihan/ }).click();
  const payment = page.getByRole("link", { name: "Bayar melalui Mayar" });
  await expect(payment).toHaveAttribute("target", "_blank");
  await expect(payment).toHaveAttribute(
    "href",
    "https://merchant.myr.id/invoices/test"
  );
  expect(state.submitted()).toEqual({
    mobile: "+6281234567890",
    idempotencyKey: expect.any(String),
  });
  await expect(page.getByText("Trial aktif", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Periksa pembayaran" }).click();
  await expect(
    page.getByText("Langganan aktif", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("29 hari lagi", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 29.000 · Lunas")).toBeVisible();
});
test("expired billing explains read-only access while keeping renewal available", async ({
  page,
}) => {
  await setup(page, { ...trial(), active: false, state: "expired" });
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByText("Masa aktif habis", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Data tetap bisa dibaca, diunduh, dan dihapus/)
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Perpanjang langganan" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Buat tagihan/ })
  ).toBeEnabled();
});
test("an ambiguous invoice prevents a second checkout and explains review", async ({
  page,
}) => {
  const state = await setup(page);
  state.setOrders([
    {
      id: "review",
      status: "review",
      amount: 29_000,
      durationDays: 30,
      paymentUrl: null,
      expiresAt: "2026-10-22T00:15:00Z",
      createdAt: "2026-10-22T00:00:00Z",
      appliedAt: null,
    },
  ]);
  await page.goto("/e2e/billing.html");
  await expect(page.getByText(/Tagihan ini sedang diperiksa/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Buat tagihan/ })).toHaveCount(
    0
  );
});
test("billing retains English labels and an accessible phone field", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/e2e/billing.html?lang=en");
  await expect(page.getByText("Trial active", { exact: true })).toBeVisible();
  await expect(page.getByText("5 days left", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Billing phone number")).toBeVisible();
  await expect(
    page.getByText("All features · 10 GB storage · up to 100 MB per file")
  ).toBeVisible();
});

test("expired paid access shows the paid expiry instead of the old trial date", async ({
  page,
}, info) => {
  await setup(page, {
    ...trial(),
    active: false,
    state: "expired",
    trialEndsAt: "2026-10-01T00:00:00Z",
    paidUntil: "2026-10-21T00:00:00Z",
  });
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByText("Berakhir pada 21 Okt 2026, 08.00")
  ).toBeVisible();
  await mkdir("../../.impeccable/review", { recursive: true });
  await page.screenshot({
    path: `../../.impeccable/review/expired-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});
