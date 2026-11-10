import { expect, test } from "@playwright/test";

const metric = { value: 12, previous: 6, series: [1, 2, 1, 4, 1, 1, 2] };
const dashboard = {
  generatedAt: "2026-11-07T12:00:00Z",
  from: "2026-11-01T00:00:00Z",
  until: "2026-11-07T12:00:00Z",
  period: "30d",
  bucket: "day",
  timezone: "Asia/Jakarta",
  environment: "production",
  overview: {
    totalUsers: 120,
    allowedUsers: 115,
    activeUsers: 42,
    subscribedUsers: 18,
    bannedUsers: 5,
    activeSessions: 14,
    storageBytes: 32000000,
    llmCostUsd: 123.4,
    llmCostBreakdown: [],
  },
  metrics: {
    registrations: metric,
    activeUsers: { ...metric, value: 42 },
    conversion: { ...metric, value: 25, converted: 3, trials: 12 },
    revenue: { ...metric, value: 87000, payments: 3 },
    cost: { ...metric, value: 4.2 },
    reliability: { ...metric, value: 98, completed: 49, failed: 1 },
  },
  attention: {
    failedRuns: 1,
    totalRuns: 50,
    expiringTrials: 9,
    expiringPlus: 2,
    activeExpiringTrials: 6,
  },
  failures: [
    {
      id: "failed-1",
      model: "qwen",
      createdAt: "2026-11-07T00:00:00Z",
      errorMessage: "Provider timeout",
    },
  ],
  timeline: Array.from({ length: 7 }, (_, i) => ({
    start: `2026-11-0${i + 1}T00:00:00+07:00`,
    registrations: i + 1,
    activeUsers: i + 5,
    messages: i * 8,
    costUsd: i / 10,
  })),
  costs: {
    byKind: [
      { kind: "message", costUsd: 3.1, calls: 900 },
      { kind: "background", costUsd: 0.8, calls: 300 },
      { kind: "hindsight", costUsd: 0.3, calls: 12 },
    ],
    breakdown: [
      {
        kind: "message",
        job: null,
        stage: "assistant.reply",
        costUsd: 2.9,
        calls: 160,
        failedCalls: 4,
        unpricedCalls: 0,
      },
      {
        kind: "background",
        job: "memory-dreams",
        stage: "memory-dream.extract",
        costUsd: 0.5,
        calls: 40,
        failedCalls: 0,
        unpricedCalls: 2,
      },
    ],
    topAccounts: [
      {
        userId: "heavy",
        name: "Budi Hemat",
        email: "budi@example.test",
        costUsd: 1.25,
        calls: 300,
        messages: 50,
      },
    ],
    unattributedUsd: 0.12,
    failedUsd: 0.05,
    unpricedCalls: 2,
    trackedSince: "2026-10-01T00:00:00.000Z",
    hindsightTracked: false,
  },
  channels: [
    { channel: "web", messages: 120 },
    { channel: "whatsapp", messages: 48 },
  ],
  adoption: [{ feature: "tasks", users: 21 }],
  acquisition: [{ source: "instagram", users: 12, converted: 3 }],
  models: [{ model: "qwen", costUsd: 4.2 }],
  recentUsers: [
    {
      id: "new",
      name: "Aisyah",
      email: "aisyah@example.test",
      createdAt: "2026-11-07T00:00:00Z",
      plan: "trial",
      onboardingCompleted: true,
    },
  ],
};

test("real metrics, period selection, failure details and accessible chart data", async ({
  page,
}, info) => {
  const periods: string[] = [];
  await page.route("**/admin/dashboard?**", async (route) => {
    const period = new URL(route.request().url()).searchParams.get("period")!;
    periods.push(period);
    await route.fulfill({
      json: { data: { ...dashboard, period } },
    });
  });
  await page.goto("/e2e/admin-dashboard.html");
  await expect(
    page.getByRole("heading", { name: "Metrik utama" })
  ).toBeVisible();
  await expect(page.getByText("Berlangganan", { exact: true })).toBeVisible();
  await expect(page.getByText("18", { exact: true })).toBeVisible();
  await expect(page.getByText(/review pembayaran|log audit/i)).toHaveCount(0);
  await page.getByRole("button", { name: "7 hari", exact: true }).click();
  await expect.poll(() => periods.at(-1)).toBe("7d");
  await expect(
    page.getByRole("heading", { name: "Pengguna aktif · 30 hari", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Lihat detail run asisten gagal" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Provider timeout");
  await page.keyboard.press("Escape");
  await page.getByText("Lihat data harian", { exact: true }).first().click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await page.getByText("Lihat data harian", { exact: true }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("dashboard.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
test("today shows hourly trends and where model cost goes", async ({
  page,
}) => {
  const periods: string[] = [];
  await page.route("**/admin/dashboard?**", async (route) => {
    const period = new URL(route.request().url()).searchParams.get("period")!;
    periods.push(period);
    const hourly = period === "today" || period === "24h";
    await route.fulfill({
      json: {
        data: {
          ...dashboard,
          period,
          bucket: hourly ? "hour" : "day",
          timeline: hourly
            ? Array.from({ length: 20 }, (_, hour) => ({
                start: `2026-11-07T${String(hour).padStart(2, "0")}:00:00+07:00`,
                registrations: 0,
                activeUsers: hour % 3,
                messages: hour,
                costUsd: hour / 100,
              }))
            : dashboard.timeline,
        },
      },
    });
  });
  await page.goto("/e2e/admin-dashboard.html");
  await page.getByRole("button", { name: "Hari ini", exact: true }).click();
  await expect.poll(() => periods.at(-1)).toBe("today");
  await expect(
    page.getByRole("heading", { name: /Tren per jam/ })
  ).toBeVisible();
  await expect(
    page.getByText("Hari ini vs kemarin pada jam yang sama")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pengguna aktif · hari ini" })
  ).toBeVisible();
  await page.getByRole("button", { name: "24 jam", exact: true }).click();
  await expect.poll(() => periods.at(-1)).toBe("24h");

  const costs = page.getByRole("region", { name: /Biaya model/ });
  await expect(costs.getByText("Proses latar", { exact: true })).toBeVisible();
  await expect(costs.getByText("Hindsight (memori)")).toBeVisible();
  await expect(
    costs.getByRole("rowheader", { name: /Ekstraksi memori/ })
  ).toContainText("Memori");
  await expect(
    costs.getByText(/panggilan tanpa biaya lengkap dari/)
  ).toHaveCount(0);
  await expect(costs.getByText(/Semua panggilan tercatat sejak/)).toHaveCount(
    0
  );
  await expect(costs.getByText(/Biaya Hindsight belum dilacak/)).toBeVisible();
  await costs.getByRole("link", { name: /Budi Hemat/ }).click();
  await expect(page).toHaveURL(/\/admin\/users\?q=budi%40example\.test/);
});
test("failed loading shows retry instead of fabricated metrics", async ({
  page,
}) => {
  await page.route("**/admin/dashboard?**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" },
      },
    })
  );
  await page.goto("/e2e/admin-dashboard.html");
  await expect(page.getByText("Gagal memuat dasbor")).toBeVisible();
  await expect(page.getByText("Berlangganan", { exact: true })).toHaveCount(0);
  await page.route("**/admin/dashboard?**", (route) =>
    route.fulfill({ json: { data: dashboard } })
  );
  await page.getByRole("button", { name: /coba lagi/i }).click();
  await expect(page.getByText("Berlangganan", { exact: true })).toBeVisible();
});
test("attention opens the corresponding filtered user list", async ({
  page,
}) => {
  await page.route("**/admin/dashboard?**", (route) =>
    route.fulfill({ json: { data: dashboard } })
  );
  await page.goto("/e2e/admin-dashboard.html");
  await page.getByRole("link", { name: /Trial berakhir/ }).click();
  await expect(page).toHaveURL(/\/admin\/users\?attention=trial-expiring/);
});
test("mobile navigation opens and closes without excluded links", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile drawer behavior");
  await page.route("**/admin/dashboard?**", (route) =>
    route.fulfill({ json: { data: dashboard } })
  );
  await page.goto("/e2e/admin-dashboard.html");
  await page.getByRole("button", { name: "Buka navigasi admin" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Pengguna", exact: true })
  ).toBeVisible();
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
  await expect.poll(async () => (await drawer.boundingBox())?.y).toBe(0);
  await page.getByRole("button", { name: "Tutup navigasi admin" }).click();
  await expect(drawer).not.toBeVisible();
});

test("a failed refresh keeps the previous metrics visible with a warning", async ({
  page,
}) => {
  await page.route("**/admin/dashboard?**", (route) =>
    route.fulfill({ json: { data: dashboard } })
  );
  await page.goto("/e2e/admin-dashboard.html");
  await expect(page.getByText("Berlangganan", { exact: true })).toBeVisible();
  await page.route("**/admin/dashboard?**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "SERVICE_UNAVAILABLE", message: "Refresh unavailable" },
      },
    })
  );
  await page.getByRole("button", { name: "Perbarui dasbor" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Data terakhir tetap ditampilkan"
  );
  await expect(page.getByText("18", { exact: true })).toBeVisible();
});
