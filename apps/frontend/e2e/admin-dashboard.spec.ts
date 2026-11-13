import { expect, test, type Page } from "@playwright/test";

const days = Array.from(
  { length: 7 },
  (_, i) => `2026-11-0${i + 1}T00:00:00+07:00`
);

const window = (period = "7d") => ({
  generatedAt: "2026-11-07T13:14:00Z",
  from: "2026-10-31T17:00:00Z",
  until: "2026-11-07T13:14:00Z",
  period,
  bucket: "day",
  timezone: "Asia/Jakarta",
  buckets: days,
});

const totals = {
  activeUsers: 8,
  messages: 58,
  costUsd: 4.32,
  interactiveUsd: 2.38,
  backgroundUsd: 1.94,
  wastedUsd: 0.31,
  revenueIdr: 58000,
  payments: 2,
  inputTokens: 1_420_000,
  cachedInputTokens: 255_600,
  unpricedCalls: 4,
};

const previous = {
  ...totals,
  activeUsers: 5,
  messages: 41,
  costUsd: 2.1,
  interactiveUsd: 1.56,
  backgroundUsd: 0.54,
  wastedUsd: 0.09,
  revenueIdr: 29000,
  payments: 1,
};

const featureDay = {
  chat: 0.12,
  notes: 0.13,
  memory: 0.14,
  tasks: 0.03,
  overhead: 0.07,
};

const summary = {
  ...window(),
  totalAccounts: 26,
  current: totals,
  previous,
  series: {
    activeUsers: [3, 4, 2, 5, 4, 6, 5],
    messages: [6, 9, 4, 11, 7, 12, 9],
    costUsd: [0.41, 0.52, 0.38, 0.71, 0.55, 0.98, 0.77],
    interactiveUsd: [0.2, 0.3, 0.2, 0.4, 0.3, 0.5, 0.4],
    backgroundUsd: [0.21, 0.22, 0.18, 0.31, 0.25, 0.48, 0.37],
    revenueIdr: [0, 0, 29000, 0, 0, 29000, 0],
    featureCosts: days.map(() => featureDay),
  },
  normal: null,
  featureCosts: {
    current: { memory: 0.98, notes: 0.92, chat: 0.84, documents: 0.71 },
    previous: { memory: 0.37, notes: 0.8, chat: 0.7 },
  },
  typicalCostPerAction: 0.021,
  attention: [
    {
      kind: "cost-outpacing",
      costChange: 105.7,
      messageChange: 41.5,
      drivers: [
        { feature: "documents", deltaUsd: 0.71 },
        { feature: "memory", deltaUsd: 0.61 },
      ],
    },
    {
      kind: "user-leak",
      userId: "arif",
      name: "Arif Hidayat",
      costUsd: 0.74,
      actions: 3,
      multiple: 11.7,
      backgroundShare: 0.92,
    },
    {
      kind: "failed-runs",
      failed: 2,
      total: 74,
      lastFailedAt: "2026-11-07T12:42:00Z",
      lastError: "Provider timeout",
    },
    { kind: "expiring-trials", count: 5, active: 2 },
  ],
  movers: [
    {
      userId: "bima",
      name: "Bima Santoso",
      kind: "cost",
      delta: 1.1,
      feature: "documents",
      actions: 16,
      previousActions: 4,
      activeDays: 3,
    },
  ],
  wastedTopStage: "memory-dream.extract",
  runs: {
    failed: 2,
    total: 74,
    lastFailedAt: "2026-11-07T12:42:00Z",
    lastError: "Provider timeout",
  },
  failures: [
    {
      id: "failed-1",
      model: "openai/gpt-5-mini",
      createdAt: "2026-11-07T12:42:00Z",
      errorMessage: "Provider timeout",
    },
  ],
  expiring: { trials: 5, activeTrials: 2, plus: 0 },
  channels: [
    { channel: "web", messages: 38, users: 6 },
    { channel: "whatsapp", messages: 14, users: 3 },
    { channel: "telegram", messages: 6, users: 2 },
  ],
  newAccounts: [
    {
      id: "nadia",
      name: "Nadia Putri",
      email: "nadia@example.test",
      createdAt: "2026-11-05T00:00:00Z",
      source: "instagram",
      onboardingCompleted: true,
      messages: 3,
      features: 2,
    },
  ],
};

const usage = {
  ...window(),
  totalAccounts: 26,
  dormantAccounts: 9,
  neverActiveAccounts: 9,
  days: 7,
  groups: { power: 1, regular: 1, casual: 0, dormant: 9, inactive: 9 },
  users: [
    {
      userId: "rani",
      name: "Rani Pratiwi",
      email: "rani@example.test",
      plan: "plus",
      activeDays: 6,
      actions: { chat: 18, notes: 12, memory: 6, tasks: 4 },
      costUsd: 0.96,
      costs: { chat: 0.31, notes: 0.28, memory: 0.21, tasks: 0.08 },
      activity: [3, 6, 0, 9, 7, 6, 9],
      group: "power",
      multiple: 1,
      leak: false,
    },
    {
      userId: "arif",
      name: "Arif Hidayat",
      email: "arif@example.test",
      plan: "trial",
      activeDays: 3,
      actions: { chat: 3 },
      costUsd: 0.74,
      costs: { chat: 0.06, memory: 0.68 },
      activity: [0, 0, 0, 1, 0, 1, 1],
      group: "regular",
      multiple: 12,
      leak: true,
    },
  ],
  typicalCostPerAction: 0.02,
  features: [
    "chat",
    "notes",
    "memory",
    "tasks",
    "reminders",
    "documents",
    "calendar",
    "contacts",
  ].map((feature) => ({
    feature,
    users: feature === "chat" ? 2 : feature === "reminders" ? 0 : 1,
    actions: feature === "chat" ? 21 : feature === "reminders" ? 0 : 4,
    returning: feature === "chat" ? 2 : 0,
    perUser: feature === "chat" ? [3, 18] : feature === "reminders" ? [] : [4],
    series: [0, 1, 0, 2, 0, 1, 0],
  })),
  featureCosts: { chat: 0.84, notes: 0.92, memory: 0.98, overhead: 0.48 },
  pooledMemoryUsd: 0.19,
};

const memoryDetail = {
  ...window(),
  feature: "memory",
  sources: [
    {
      stage: "memory-dream.extract",
      kind: "background",
      calls: 64,
      retried: 14,
      costUsd: 0.52,
    },
    {
      stage: "hindsight",
      kind: "hindsight",
      calls: 3,
      retried: 0,
      costUsd: 0.19,
    },
  ],
  series: [1, 1, 0, 2, 1, 3, 2],
  users: [
    {
      userId: "rani",
      name: "Rani Pratiwi",
      actions: 6,
      activeDays: 4,
      costUsd: 0.3,
    },
    {
      userId: "arif",
      name: "Arif Hidayat",
      actions: 0,
      activeDays: 0,
      costUsd: 0.24,
    },
  ],
};

const costs = {
  ...window(),
  current: totals,
  previous,
  series: { featureCosts: days.map(() => featureDay) },
  featureCosts: summary.featureCosts,
  typicalCostPerAction: 0.021,
  pricing: { plusPriceIdr: 29000, termDays: 30, usdIdrRate: 16250 },
  processes: [
    {
      stage: "memory-dream.extract",
      feature: "memory",
      kind: "background",
      calls: 64,
      costUsd: 0.52,
      inputTokens: 210000,
      outputTokens: 9000,
      cachedInputTokens: 0,
      wastedUsd: 0.11,
      retried: 14,
      failed: 3,
      unpriced: 0,
      models: [
        {
          model: "google/gemini-2.5-flash",
          retry: false,
          calls: 50,
          costUsd: 0.41,
        },
        {
          model: "google/gemini-2.5-flash",
          retry: true,
          calls: 14,
          costUsd: 0.11,
        },
      ],
      accounts: [{ userId: "arif", name: "Arif Hidayat", costUsd: 0.18 }],
    },
  ],
  users: [
    {
      userId: "rani",
      name: "Rani Pratiwi",
      plan: "plus",
      actions: 46,
      costUsd: 0.96,
      backgroundUsd: 0.38,
      featureActions: { chat: 18 },
      multiple: 1,
      leak: false,
    },
    {
      userId: "arif",
      name: "Arif Hidayat",
      plan: "trial",
      actions: 3,
      costUsd: 0.74,
      backgroundUsd: 0.68,
      featureActions: { chat: 3 },
      multiple: 11.7,
      leak: true,
    },
  ],
  unattributedUsd: 0.03,
  pooledMemoryUsd: 0.19,
  models: [{ model: "openai/gpt-5-mini", costUsd: 2.74 }],
};

/** The fixture page hosts every analytics route; move between them by the sidebar. */
async function open(page: Page, name?: string, search = "") {
  await page.goto(`/e2e/admin-dashboard.html${search}`);
  if (!name) return;
  const link = () =>
    page.locator('nav[aria-label="Navigasi admin"] a:visible', {
      hasText: new RegExp(`^${name}$`),
    });

  if ((await link().count()) === 0)
    await page.getByRole("button", { name: "Buka navigasi admin" }).click();
  await link().first().click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

async function mock(page: Page, periods: string[] = []) {
  await page.route("**/admin/summary?**", async (route) => {
    const period = new URL(route.request().url()).searchParams.get("period")!;
    periods.push(period);
    await route.fulfill({ json: { data: { ...summary, period } } });
  });
  await page.route("**/admin/usage?**", (route) =>
    route.fulfill({ json: { data: usage } })
  );
  await page.route("**/admin/usage/features/memory?**", (route) =>
    route.fulfill({ json: { data: memoryDetail } })
  );
  await page.route("**/admin/costs?**", (route) =>
    route.fulfill({ json: { data: costs } })
  );
}

test("summary shows comparisons, attention links and accessible charts", async ({
  page,
}, info) => {
  const periods: string[] = [];
  await mock(page, periods);
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Ringkasan", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByText("Biaya naik lebih cepat dari pemakaian", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/Arif Hidayat/).first()).toBeVisible();
  await expect(page.getByText("Sembunyikan akun uji")).toHaveCount(0);

  await page.getByRole("button", { name: "30 hari", exact: true }).click();
  await expect.poll(() => periods.at(-1)).toBe("30d");
  await expect(page).toHaveURL(/period=30d/);

  await page
    .getByRole("button", { name: /Lihat detail\s*:\s*Run asisten gagal/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Provider timeout");
  await page.keyboard.press("Escape");

  await page.getByText("Lihat tabel data").first().click();
  await expect(page.getByRole("table").first()).toBeVisible();

  await page.screenshot({
    path: info.outputPath("summary.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  await page
    .getByRole("link", { name: /Lihat pengguna\s*:\s*Arif Hidayat/ })
    .click();
  await expect(page).toHaveURL(/\/admin\/users\?.*user=arif/);
});

test("navigation keeps the period between analytics pages", async ({
  page,
}) => {
  await mock(page);
  await open(page, "Biaya", "?period=30d");
  await expect(page).toHaveURL(/\/admin\/costs\?period=30d/);
  await expect(
    page.getByRole("heading", { name: "Biaya", level: 1 })
  ).toBeVisible();
});

test("usage heatmap opens a feature drawer with its cost sources", async ({
  page,
}, info) => {
  await mock(page);
  await open(page, "Penggunaan");
  await expect(
    page.getByRole("link", { name: "Rani Pratiwi" }).first()
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Memori/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Ekstraksi memori");
  await expect(drawer).toContainText("Arif Hidayat");
  await page.screenshot({ path: info.outputPath("usage.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/feature=/);
});

test("usage heatmap switches to spend per feature and flags leaks", async ({
  page,
}, info) => {
  await mock(page);
  await open(page, "Penggunaan");
  const arif = page.getByRole("row", { name: /Arif Hidayat/ });
  await expect(arif).toContainText("3/7");
  await expect(arif).toContainText("biaya biasa untuk aksinya");
  const table = page.locator("article").filter({ has: arif });
  await table.screenshot({ path: info.outputPath("heatmap-actions.png") });
  await page.getByRole("radio", { name: "Biaya" }).click();
  await expect(arif.getByRole("cell").nth(3)).toHaveText("0,68");
  await expect(
    page.getByRole("list", { name: "Skala biaya per fitur" })
  ).toBeVisible();
  await table.screenshot({ path: info.outputPath("heatmap-cost.png") });
});

test("active days line up across periods and hide for hourly ones", async ({
  page,
}, info) => {
  await mock(page);
  await page.route("**/admin/usage?**", (route) => {
    const period = new URL(route.request().url()).searchParams.get("period");
    const hourly = period === "today" || period === "24h";
    const long = period === "30d" || period === "90d";

    return route.fulfill({
      json: {
        data: {
          ...usage,
          period,
          bucket: hourly ? "hour" : "day",
          buckets: long ? Array.from({ length: 30 }, (_, i) => `d${i}`) : days,
          days: hourly ? 1 : long ? 30 : 7,
          users: usage.users.map((user) => ({
            ...user,
            activity: long
              ? Array.from({ length: 30 }, () => 0)
              : user.activity,
          })),
        },
      },
    });
  });

  await open(page, "Penggunaan", "?period=30d");
  const columns = page.getByRole("columnheader");
  await expect(columns.filter({ hasText: "Hari aktif" })).toBeVisible();
  const counts = page.getByText(/^\d+\/30 hari aktif$/);
  await expect(counts).toHaveCount(2);
  const tops = await counts.evaluateAll((nodes) =>
    nodes.map((node) => {
      const cell = node.closest("td")!.getBoundingClientRect();
      const box = node.getBoundingClientRect();

      return Math.abs(box.top + box.height / 2 - (cell.top + cell.height / 2));
    })
  );

  // The count sits beside the meter, centred in its row like the 7-day squares.
  for (const offset of tops) expect(offset).toBeLessThan(2);
  await page
    .locator("article")
    .filter({ has: counts.first() })
    .screenshot({ path: info.outputPath("heatmap-30d.png") });

  await page.getByRole("button", { name: "Hari ini" }).click();
  await expect(
    page.getByRole("link", { name: "Rani Pratiwi" }).first()
  ).toBeVisible();
  await expect(columns.filter({ hasText: "Hari aktif" })).toHaveCount(0);
});

test("an empty period shows only an icon and message", async ({ page }) => {
  await mock(page);
  await page.route("**/admin/usage?**", (route) =>
    route.fulfill({
      json: {
        data: {
          ...usage,
          users: [],
          groups: { ...usage.groups, power: 0, regular: 0 },
          features: usage.features.map((f) => ({
            ...f,
            users: 0,
            actions: 0,
            perUser: [],
          })),
        },
      },
    })
  );
  await open(page, "Penggunaan", "?period=today");
  await expect(page.getByText(/Belum ada aktivitas/)).toBeVisible();
  await expect(page.getByText("Pengguna × fitur")).toHaveCount(0);
});

test("costs expose leaks and expand a process", async ({ page }, info) => {
  await mock(page);
  await open(page, "Biaya");
  const row = page.getByRole("button", { name: /Ekstraksi memori/ }).first();
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("google/gemini-2.5-flash").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("costs.png"), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test("a failed cost read offers a retry without a fake page", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/admin/costs?**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" },
      },
    })
  );
  await open(page, "Biaya");
  await expect(page.getByRole("alert")).toContainText(
    "Data biaya gagal dimuat"
  );
  await page.route("**/admin/costs?**", (route) =>
    route.fulfill({ json: { data: costs } })
  );
  await page.getByRole("button", { name: /Coba lagi/ }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Proses", { exact: true }).first()).toBeVisible();
});

test("long periods fold charts into a capped number of bars", async ({
  page,
}) => {
  const long = Array.from({ length: 90 }, (_, i) =>
    new Date(Date.UTC(2026, 7, 10 + i) - 7 * 3600_000).toISOString()
  );

  const stretch = <T>(values: T[]) =>
    long.map((_, index) => values[index % values.length]!);

  await mock(page);
  await page.route("**/admin/summary?**", (route) =>
    route.fulfill({
      json: {
        data: {
          ...summary,
          period: "90d",
          buckets: long,
          series: Object.fromEntries(
            Object.entries(summary.series).map(([key, values]) => [
              key,
              stretch(values as unknown[]),
            ])
          ),
        },
      },
    })
  );
  await page.route("**/admin/usage?**", (route) =>
    route.fulfill({
      json: {
        data: {
          ...usage,
          period: "90d",
          buckets: long,
          days: 90,
          users: usage.users.map((user) => ({
            ...user,
            activity: stretch(user.activity),
          })),
          features: usage.features.map((row) => ({
            ...row,
            series: stretch(row.series),
          })),
        },
      },
    })
  );

  const sparklinesFit = () =>
    page.locator('[role="img"][aria-label^="Tren"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        const bars = [...node.children].map((bar) =>
          bar.getBoundingClientRect()
        );

        return (
          bars.length <= 15 && bars.every((bar) => bar.right <= box.right + 0.5)
        );
      })
    );

  await open(page, undefined, "?period=90d");
  await expect(page.getByText("Tren mingguan")).toBeVisible();
  const weekly = page.getByRole("img", { name: "Pesan pengguna per minggu" });
  await expect(weekly.getByRole("button")).toHaveCount(13);
  const tiles = await sparklinesFit();
  expect(tiles.length).toBeGreaterThan(0);
  expect(tiles.every(Boolean)).toBe(true);

  await open(page, "Penggunaan", "?period=90d");
  await expect(
    page.getByRole("link", { name: "Rani Pratiwi" }).first()
  ).toBeVisible();
  const rows = await sparklinesFit();
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(Boolean)).toBe(true);
});

test("phone width keeps every analytics page within the screen", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);

  for (const name of ["Ringkasan", "Penggunaan", "Biaya"]) {
    await open(page, name === "Ringkasan" ? undefined : name);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`mobile-${name}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      name
    ).toBe(true);
  }

  await page.getByRole("button", { name: "Buka navigasi admin" }).click();
  const drawer = page.getByRole("dialog");
  for (const name of ["Ringkasan", "Penggunaan", "Biaya", "Pengguna"])
    await expect(drawer.getByRole("link", { name, exact: true })).toBeVisible();
});
