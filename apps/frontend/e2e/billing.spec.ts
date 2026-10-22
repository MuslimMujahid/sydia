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
    page.getByRole("heading", { name: "Selamat! 7 hari gratis untuk Anda" })
  ).toBeVisible();
  await expect(page.getByText(/Tanpa kartu, tanpa pembayaran/)).toBeVisible();
  await expect(
    page.getByText("Asisten yang ingat dan menindaklanjuti")
  ).toBeVisible();
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
test("a trial account is sent to the checkout page to subscribe", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByRole("link", { name: "Berlangganan · Rp 29.000" })
  ).toHaveAttribute("href", "/checkout");
  await expect(page.getByLabel("Nomor telepon untuk tagihan")).toHaveCount(0);
});
test("a paid account sees its payment confirmed and is not offered another payment", async ({
  page,
}) => {
  await setup(page, {
    ...trial(),
    state: "paid",
    paidUntil: "2026-11-21T00:00:00Z",
  });
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByRole("heading", { name: "Terima kasih sudah berlangganan" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Perpanjang langganan" })
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Berlangganan/ })).toHaveCount(
    0
  );
});
test("expired billing explains read-only access while keeping renewal available", async ({
  page,
}) => {
  await setup(page, { ...trial(), active: false, state: "expired" });
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByRole("heading", { name: "Sydia siap membantu Anda lagi" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Perpanjang langganan" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Berlangganan · Rp 29.000" })
  ).toBeVisible();
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
  await expect(page.getByRole("link", { name: /^Berlangganan/ })).toHaveCount(
    0
  );
});
test("billing retains English labels and the subscribe link", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/e2e/billing.html?lang=en");
  await expect(
    page.getByRole("heading", {
      name: "Congratulations! 7 free days are yours",
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Subscribe/ })).toHaveAttribute(
    "href",
    "/checkout"
  );
  await expect(
    page.getByText("The assistant that remembers and follows through")
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
    page.getByRole("heading", { name: "Sydia siap membantu Anda lagi" })
  ).toBeVisible();
  await mkdir("../../.impeccable/review", { recursive: true });
  await page.screenshot({
    path: `../../.impeccable/review/expired-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});

test("each paid payment opens its receipt from the history", async ({
  page,
}) => {
  const state = await setup(page);
  state.setOrders([
    {
      id: "order-9",
      status: "paid",
      amount: 29_000,
      durationDays: 30,
      paymentUrl: "https://merchant.myr.id/invoices/paid",
      expiresAt: "2026-10-22T00:15:00Z",
      createdAt: "2026-10-22T00:00:00Z",
      appliedAt: "2026-10-22T00:05:00Z",
    },
  ]);
  await page.goto("/e2e/billing.html");
  const row = page.getByRole("link", { name: /Langganan Sydia.*Lunas/ });
  await expect(row).toHaveAttribute("href", "/receipt/order-9");
  await expect(row).toContainText("Rp 29.000");
});
