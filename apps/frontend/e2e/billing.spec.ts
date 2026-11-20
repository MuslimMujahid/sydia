import { expect, test, type Locator, type Page } from "@playwright/test";
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
    page.getByRole("heading", { name: /^Trial aktif, sisa/ })
  ).toBeVisible();
  await expect(
    page.getByText(/Berlangganan sebelum trial berakhir/)
  ).toBeVisible();
  await expect(page.getByText("Yang Anda dapatkan")).toBeVisible();
  await expect(page.getByText("Diskon 50%")).toBeVisible();
  await expect(page.getByText("Rp 29.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Rp 59.000", { exact: true })).toBeVisible();
  await expect(page.getByText("1,5 GB dari 10 GB terpakai")).toBeVisible();
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
    page.getByRole("link", { name: "Berlangganan", exact: true })
  ).toHaveAttribute("href", "/checkout");
  await expect(page.getByLabel("Nomor telepon untuk tagihan")).toHaveCount(0);
});
test("a paid account sees its payment confirmed and is not offered another payment", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-01T00:00:00Z"));
  await setup(page, {
    ...trial(),
    state: "paid",
    paidUntil: "2026-11-21T00:00:00Z",
  });
  await page.goto("/e2e/billing.html");
  await expect(
    page.getByRole("heading", { name: "Sydia Plus aktif" })
  ).toBeVisible();
  await expect(page.getByText(/^Sisa \d+ hari$/).first()).toBeVisible();
  await expect(page.getByText("Rp 29.000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Yang Anda dapatkan")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Berlangganan lagi" })
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
    page.getByRole("heading", { name: "Masa aktif Anda sudah berakhir" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Berlangganan lagi" })
  ).toBeVisible();
  await expect(page.getByText("Rp 29.000", { exact: true })).toBeVisible();
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
    page.getByRole("heading", { name: /^Trial active, .* left$/ })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Subscribe/ })).toHaveAttribute(
    "href",
    "/checkout"
  );
  await expect(page.getByText("What you get")).toBeVisible();
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
    page.getByRole("heading", { name: "Masa aktif Anda sudah berakhir" })
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
  const row = page.getByRole("link", { name: /Sydia Plus.*Lunas/ });
  await expect(row).toHaveAttribute("href", "/receipt/order-9");
  await expect(row).toContainText("Rp 29.000");
});

test("gift celebration confirms the received days and stays dismissed after reload", async ({
  page,
}, info) => {
  await setup(page, {
    ...trial(),
    state: "paid",
    paidUntil: "2026-12-08T00:00:00Z",
  });
  let giftIds: string[] = [];
  await page.route("**/billing/gifts", (route) =>
    route.fulfill({
      json: {
        data:
          giftIds.length === 0
            ? [
                {
                  id: "gift-new",
                  durationDays: 7,
                  paidUntil: "2026-12-08T00:00:00Z",
                },
                {
                  id: "gift-old",
                  durationDays: 30,
                  paidUntil: "2026-12-01T00:00:00Z",
                },
              ]
            : [],
      },
    })
  );
  await page.route("**/billing/gifts/acknowledge", (route) => {
    giftIds = route.request().postDataJSON().giftIds;

    return route.fulfill({ json: { data: { success: true } } });
  });
  await page.goto("/e2e/billing.html?celebrate");
  const gift = page.getByRole("complementary", { name: "Hadiah Sydia Plus" });
  await expect(
    gift.getByRole("heading", { name: "Kamu dapat Sydia Plus!" })
  ).toBeVisible();
  await expect(gift.getByRole("status")).toContainText("37 hari");
  await expect(gift.getByRole("status")).toContainText("8 Desember 2026");
  await seekGiftReveal(gift, 1450);
  await page.screenshot({ path: info.outputPath("gift-celebration.png") });

  await expect(gift.getByRole("button")).toHaveCount(1);
  await gift.getByRole("button", { name: "Tutup", exact: true }).press("Enter");
  await expect(gift).not.toBeVisible();
  expect(giftIds).toEqual(["gift-new", "gift-old"]);
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/billing/gifts"
  );

  await page.reload();
  await refreshed;
  await expect(gift).not.toBeVisible();
});

async function seekGiftReveal(gift: Locator, time: number) {
  await gift.evaluate(async (element, currentTime) => {
    const animations = element.getAnimations({ subtree: true });

    for (const animation of animations) {
      animation.pause();
      animation.currentTime = currentTime;
    }

    await Promise.all(animations.map((animation) => animation.ready));
  }, time);
}

async function lidClearance(gift: Locator) {
  const [lidBottom, boxTop] = await Promise.all([
    gift
      .locator(".gift-lid")
      .evaluate((element) => element.getBoundingClientRect().bottom),
    gift
      .locator(".gift-box")
      .evaluate((element) => element.getBoundingClientRect().top),
  ]);

  return boxTop - lidBottom;
}

test("gift celebration opens the box and sends ribbons across the card", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setup(page, {
    ...trial(),
    state: "paid",
    paidUntil: "2026-12-08T00:00:00Z",
  });
  await page.route("**/billing/gifts", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "gift-confetti",
            durationDays: 30,
            paidUntil: "2026-12-08T00:00:00Z",
          },
        ],
      },
    })
  );
  await page.goto("/e2e/billing.html?celebrate");
  const gift = page.getByRole("complementary", { name: "Hadiah Sydia Plus" });
  await expect(
    gift.getByRole("heading", { name: "Kamu dapat Sydia Plus!" })
  ).toBeVisible();

  await seekGiftReveal(gift, 160);
  expect(await lidClearance(gift)).toBeLessThanOrEqual(0);
  await gift.screenshot({ path: info.outputPath("gift-wrapped.png") });
  await seekGiftReveal(gift, 780);
  expect(await lidClearance(gift)).toBeGreaterThan(8);

  await seekGiftReveal(gift, 1800);
  const burst = await gift.evaluate((element) => {
    const visibleRibbons = [
      ...element.querySelectorAll(".gift-confetti"),
    ].filter((particle) =>
      particle.getAnimations().some((animation) => {
        const progress = animation.effect?.getComputedTiming().progress;

        return (
          progress != null &&
          progress < 1 &&
          Number(getComputedStyle(particle).opacity) > 0.5
        );
      })
    );

    const positions = visibleRibbons.map((ribbon) =>
      ribbon.getBoundingClientRect()
    );

    return {
      ribbons: visibleRibbons.length,
      spread:
        Math.max(...positions.map((position) => position.right)) -
        Math.min(...positions.map((position) => position.left)),
      cardWidth: element.getBoundingClientRect().width,
    };
  });

  expect(burst.ribbons).toBeGreaterThanOrEqual(18);
  expect(burst.spread).toBeGreaterThan(burst.cardWidth * 0.65);
  await gift.screenshot({ path: info.outputPath("gift-confetti.png") });

  await seekGiftReveal(gift, 3600);
  const settled = await gift.evaluate((element) => {
    return [...element.querySelectorAll(".gift-confetti")].filter(
      (particle) => Number(getComputedStyle(particle).opacity) > 0.5
    ).length;
  });

  expect(settled).toBeGreaterThanOrEqual(8);
  await gift.screenshot({ path: info.outputPath("gift-unwrapped.png") });
});

test("gift celebration keeps feedback visible with reduced motion and allows retry", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  let attempts = 0;
  await page.route("**/billing/gifts", (route) =>
    route.fulfill({
      json: {
        data:
          attempts < 2
            ? [
                {
                  id: "gift-one-day",
                  durationDays: 1,
                  paidUntil: "2026-12-01T00:00:00Z",
                },
              ]
            : [],
      },
    })
  );
  await page.route("**/billing/gifts/acknowledge", (route) => {
    attempts += 1;

    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: {
            error: { code: "SERVICE_UNAVAILABLE", message: "Try again." },
          },
        })
      : route.fulfill({ json: { data: { success: true } } });
  });
  await page.goto("/e2e/billing.html?celebrate&lang=en");
  const gift = page.getByRole("complementary", { name: "Sydia Plus gift" });
  await expect(
    gift.getByRole("heading", { name: "You got Sydia Plus!" })
  ).toBeVisible();
  await expect(gift.getByRole("status")).toContainText("1 day as a gift");
  await expect(gift.locator(".gift-token")).toBeVisible();
  expect(await lidClearance(gift)).toBeGreaterThan(0);
  expect(
    await gift.evaluate(
      (element) => element.getAnimations({ subtree: true }).length
    )
  ).toBe(0);

  const close = gift.getByRole("button", { name: "Close", exact: true });
  await close.click();
  await expect(gift.getByRole("alert")).toHaveText(
    "Couldn’t dismiss the gift. Try again."
  );
  await close.click();
  await expect(gift).not.toBeVisible();
});
