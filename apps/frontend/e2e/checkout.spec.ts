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
    trialEndsAt: "2099-10-29T00:00:00Z",
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
  onboardingCompleted: true,
  role: "user",
};

async function setup(page: Page, billing: BillingStatus = status()) {
  let current = billing;
  let orders: BillingOrder[] = [];
  const seen: { submitted?: unknown; refreshes: number } = { refreshes: 0 };
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
          expiresAt: "2099-11-22T00:00:00Z",
        },
      },
    })
  );
  await page.route("**/users/me", (route) =>
    route.fulfill({ json: { data: profile } })
  );
  await page.route("**/billing/me", (route) =>
    route.fulfill({ json: { data: current } })
  );
  await page.route("**/billing/orders", (route) =>
    route.fulfill({ json: { data: orders } })
  );
  await page.route("**/billing/checkouts", async (route) => {
    seen.submitted = route.request().postDataJSON();
    orders = [
      {
        id: "order-1",
        amount: 29_000,
        durationDays: 30,
        status: "pending",
        paymentUrl: "https://merchant.myr.id/invoices/test",
        expiresAt: "2099-10-22T00:15:00Z",
        appliedAt: null,
        createdAt: "2026-10-22T00:00:00Z",
      },
    ];
    await route.fulfill({ json: { data: orders[0] } });
  });
  await page.route("**/billing/orders/order-1/refresh", async (route) => {
    seen.refreshes += 1;

    if (seen.refreshes > 1) {
      orders = orders.map((order) => ({
        ...order,
        status: "paid",
        appliedAt: "2026-10-22T00:05:00Z",
      }));
      current = {
        ...current,
        state: "paid",
        paidUntil: "2099-11-21T00:05:00Z",
      };
    }

    await route.fulfill({ json: { data: orders[0] } });
  });

  return seen;
}

test("the order summary shows the plan, price, and what is due today", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/e2e/checkout.html");
  await expect(
    page.getByRole("heading", { name: "Ringkasan pesanan" })
  ).toBeVisible();
  await expect(page.getByText("Penyimpanan 10 GB")).toBeVisible();
  await expect(page.getByText("Jatuh tempo hari ini")).toBeVisible();
  await expect(page.getByText("Rp 59.000", { exact: true })).toBeVisible();
  await expect(page.getByText(/mengarahkan Anda ke Mayar/)).toBeVisible();
});

test("subscribing shows the loading scene, then the hand-off to Mayar", async ({
  page,
}) => {
  const seen = await setup(page);
  await page.goto("/e2e/checkout.html");
  await page.getByLabel("Nomor telepon untuk tagihan").fill("+6281234567890");
  await page.getByRole("button", { name: "Berlangganan" }).click();
  await expect(page.getByText("Menyiapkan pembayaran Anda")).toBeVisible();
  const payment = page.getByRole("link", { name: "Bayar melalui Mayar" });
  await expect(payment).toBeVisible();
  await expect(payment).toHaveAttribute("target", "_blank");
  await expect(payment).toHaveAttribute(
    "href",
    "https://merchant.myr.id/invoices/test"
  );
  await expect(page.getByText("Selesaikan pembayaran di Mayar")).toBeVisible();
  expect(seen.submitted).toEqual({
    mobile: "+6281234567890",
    idempotencyKey: expect.any(String),
  });
});

test("coming back from paying confirms the payment without a manual check", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/e2e/checkout.html");
  await page.getByLabel("Nomor telepon untuk tagihan").fill("+6281234567890");
  await page.getByRole("button", { name: "Berlangganan" }).click();
  await expect(
    page.getByRole("link", { name: "Bayar melalui Mayar" })
  ).toBeVisible();
  // The tab regains focus after payment: the first check is still pending
  // in this mock, the second is paid.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Pembayaran diterima")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mulai gunakan Sydia" })
  ).toBeVisible();
});

test("a subscriber renewing is told the renewal is added after the current period", async ({
  page,
}) => {
  await setup(
    page,
    status({ state: "paid", paidUntil: "2099-11-21T00:00:00Z" })
  );
  await page.goto("/e2e/checkout.html");
  await expect(
    page.getByRole("heading", { name: "Ringkasan pesanan" })
  ).toBeVisible();
});

test("without a payment option the page says so instead of offering a form", async ({
  page,
}) => {
  await setup(page, status({ checkoutEnabled: false }));
  await page.goto("/e2e/checkout.html");
  await expect(page.getByText("Pembayaran belum tersedia")).toBeVisible();
  await expect(page.getByRole("button", { name: "Berlangganan" })).toHaveCount(
    0
  );
});

test("a paid order has a printable receipt", async ({ page }) => {
  await setup(page);
  await page.route("**/billing/orders", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "order-abc12345",
            amount: 29_000,
            durationDays: 30,
            status: "paid",
            paymentUrl: "https://merchant.myr.id/invoices/paid",
            paymentMethod: "ewallet/DANA",
            expiresAt: "2026-10-22T00:15:00Z",
            appliedAt: "2026-10-22T00:05:00Z",
            createdAt: "2026-10-22T00:00:00Z",
          },
        ],
      },
    })
  );
  await page.goto("/e2e/checkout.html?to=/receipt/order-abc12345");
  await expect(
    page.getByRole("heading", { name: "Struk pembayaran" })
  ).toBeVisible();
  await expect(page.getByText("SYD-ABC12345").first()).toBeVisible();
  await expect(page.getByText("Rp 29.000 dibayar pada")).toBeVisible();
  await expect(page.getByText("sari@example.test")).toBeVisible();
  await expect(page.getByText("INV-ABC12345")).toBeVisible();
  await expect(page.getByText("Dibayar melalui DANA")).toBeVisible();
  await expect(page.getByRole("link", { name: "Lihat invoice" })).toHaveCount(
    0
  );
  await expect(page.getByRole("button", { name: "Unduh resi" })).toBeVisible();
});

test("an unpaid or unknown order has no receipt", async ({ page }) => {
  await setup(page);
  await page.goto("/e2e/checkout.html?to=/receipt/missing");
  await expect(page.getByText(/Struk tidak ditemukan/)).toBeVisible();
});
