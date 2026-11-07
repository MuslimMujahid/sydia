import { expect, test, type Page } from "@playwright/test";

async function openUsers(
  page: Page,
  userCount = 51,
  expiry: (userId: string) => string | null = () => null
) {
  const requests: URL[] = [];
  await page.route("**/admin/users?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const filtered =
      url.searchParams.get("q") || url.searchParams.get("status");

    const total =
      url.searchParams.get("q") === "missing" ? 0 : filtered ? 1 : userCount;

    const offset = Number(url.searchParams.get("offset"));
    const length = Math.min(25, total - offset);
    const data = Array.from({ length }, (_, index) => ({
      id: `user-${offset + index + 1}`,
      name: filtered ? "Ada" : `User ${offset + index + 1}`,
      email: `user${offset + index + 1}@example.com`,
      status: url.searchParams.get("status") === "banned" ? "banned" : "active",
      createdAt: "2026-10-24T00:00:00Z",
      paidUntil: expiry(`user-${offset + index + 1}`),
      trialEndsAt: "2026-10-31T00:00:00Z",
      plan: expiry(`user-${offset + index + 1}`) ? "plus" : "expired",
      onboardingCompleted: true,
      acquisitionSource: null,
      channels: ["web"],
      payments: 0,
      paymentTotalIdr: 0,
      lastPaymentAt: null,
      lastPaymentMethod: null,
      llmCost30DaysUsd: 0,
      lastActivityAt: null,
      activeSessions: 0,
      storageBytes: 0,
      llmCostUsd: 0,
      usage: {
        conversations: 0,
        documents: 0,
        memories: 0,
        reminders: 0,
        tasks: 0,
        contacts: 0,
        events: 0,
      },
    }));

    await route.fulfill({
      json: { data, pagination: { total, offset, limit: 25 } },
    });
  });
  await page.goto("/e2e/admin-users.html");
  await expect(page.getByRole("status")).toHaveText(
    `Menampilkan 1–${Math.min(25, userCount)} dari ${userCount} pengguna`
  );

  return requests;
}

test("loads 25 users at a time and disables navigation at both ends", async ({
  page,
}, testInfo) => {
  const requests = await openUsers(page);
  await expect(
    page.getByRole("button", { name: "Sebelumnya", exact: true })
  ).toBeDisabled();
  expect(requests[0].searchParams.get("limit")).toBe("25");
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 26–50 dari 51 pengguna"
  );
  await expect(
    page.getByRole("button", {
      name: "Detail penggunaan untuk User 26",
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByText("User 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 51–51 dari 51 pengguna"
  );
  await expect(
    page.getByRole("button", { name: "Berikutnya", exact: true })
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("pagination.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 26–50 dari 51 pengguna"
  );
});

test("searches all users on the server and resets the page", async ({
  page,
}) => {
  const requests = await openUsers(page);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("26–50");
  await page.getByRole("searchbox", { name: "Cari pengguna" }).fill("Ada");
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 1–1 dari 1 pengguna"
  );
  expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
  expect(requests.at(-1)?.searchParams.get("q")).toBe("Ada");
  await expect(
    page.getByRole("button", {
      name: "Detail penggunaan untuk Ada",
      exact: true,
    })
  ).toBeVisible();
});

test("status filtering uses global counts and starts at page one", async ({
  page,
}) => {
  const requests = await openUsers(page);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("26–50");
  await page.getByRole("button", { name: "Diblokir 1", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 1–1 dari 1 pengguna"
  );
  expect(requests.at(-1)?.searchParams.get("status")).toBe("banned");
  expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
  await expect(
    page.getByRole("button", { name: "Diizinkan 50", exact: true })
  ).toBeVisible();
});

test("empty search can be reset to the first unfiltered page", async ({
  page,
}) => {
  await openUsers(page);
  await page.getByRole("searchbox", { name: "Cari pengguna" }).fill("missing");
  await expect(page.getByText("Tidak ada pengguna yang cocok")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 0–0 dari 0 pengguna"
  );
  await page.getByRole("button", { name: "Atur ulang filter" }).first().click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 1–25 dari 51 pengguna"
  );
});

test("opens user details without fetching the users again", async ({
  page,
}) => {
  const requests = await openUsers(page);
  const initialRequests = requests.length;
  const detail = page.getByRole("button", {
    name: "Detail penggunaan untuk User 1",
    exact: true,
  });

  await detail.click();
  await expect(detail).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("heading", { name: "Penggunaan", exact: true })
  ).toBeVisible();
  expect(requests).toHaveLength(initialRequests);
  await detail.click();
  await expect(detail).toHaveAttribute("aria-expanded", "false");
});

test("page numbers jump directly to the selected page and mark the current page", async ({
  page,
}) => {
  const requests = await openUsers(page);
  const thirdPage = page.getByRole("button", {
    name: "Halaman 3",
    exact: true,
  });

  await expect(
    page.getByRole("button", { name: "Halaman 1", exact: true })
  ).toHaveAttribute("aria-current", "page");
  await thirdPage.click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 51–51 dari 51 pengguna"
  );
  await expect(thirdPage).toHaveAttribute("aria-current", "page");
  expect(requests.at(-1)?.searchParams.get("offset")).toBe("50");
});

test("long lists show a compact range and allow jumps to the last and first pages", async ({
  page,
}, testInfo) => {
  await openUsers(page, 839);
  const navigation = page.getByRole("navigation", {
    name: "Paginasi pengguna",
  });

  await expect(navigation.getByRole("button")).toHaveCount(6);
  await navigation
    .getByRole("button", { name: "Halaman 34", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 826–839 dari 839 pengguna"
  );
  await expect(
    navigation.getByRole("button", { name: "Halaman 34", exact: true })
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("button", { name: "Berikutnya", exact: true })
  ).toBeDisabled();
  await navigation
    .getByRole("button", { name: "Halaman 32", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 776–800 dari 839 pengguna"
  );
  await navigation
    .getByRole("button", { name: "Halaman 31", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 751–775 dari 839 pengguna"
  );
  await expect(
    navigation.getByRole("button", { name: "Halaman 30", exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: testInfo.outputPath("numbered-pagination.png"),
    fullPage: true,
  });
  await navigation
    .getByRole("button", { name: "Halaman 1", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 1–25 dari 839 pengguna"
  );
});

test("gifts the selected user thirty days and refreshes the user list", async ({
  page,
}) => {
  let paidUntil: string | null = null;
  const lists = await openUsers(page, 51, (userId) =>
    userId === "user-2" ? paidUntil : null
  );

  let body: unknown;
  await page.route("**/admin/users/user-2/gift-plus", async (route) => {
    body = route.request().postDataJSON();
    paidUntil = "2026-12-01T00:00:00Z";
    await route.fulfill({
      json: { data: { paidUntil } },
    });
  });
  const before = lists.length;
  await page
    .getByRole("button", { name: "Beri Sydia Plus kepada User 2", exact: true })
    .click();
  const gift = page.getByRole("dialog");
  await expect(
    gift.getByText("user2@example.com", { exact: true })
  ).toBeVisible();
  await expect(
    gift.getByRole("button", { name: "30 hari", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await gift.getByRole("button", { name: "Terapkan", exact: true }).click();
  await expect(gift).not.toBeVisible();
  expect(body).toEqual({
    durationDays: 30,
    requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  await expect.poll(() => lists.length).toBeGreaterThan(before);
  await expect(
    page
      .getByText("Plus · s.d. 1 Des", { exact: true })
      .filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Sydia Plus diberikan" })
  ).toContainText("User 2");
});

test("custom gifts require a whole number between one and 3650 days", async ({
  page,
}) => {
  await openUsers(page);
  await page
    .getByRole("button", { name: "Beri Sydia Plus kepada User 1", exact: true })
    .click();
  const gift = page.getByRole("dialog");
  await gift.getByRole("button", { name: "Kustom", exact: true }).click();
  const days = gift.getByLabel("Jumlah hari");
  const apply = gift.getByRole("button", { name: "Terapkan", exact: true });
  await expect(apply).toBeDisabled();
  await days.fill("0");
  await expect(apply).toBeDisabled();
  await days.fill("1.5");
  await expect(apply).toBeDisabled();
  await days.fill("3651");
  await expect(apply).toBeDisabled();
  await days.fill("45");
  let body: unknown;
  await page.route("**/admin/users/user-1/gift-plus", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      json: { data: { paidUntil: "2026-12-16T00:00:00Z" } },
    });
  });
  await apply.click();
  await expect(gift).not.toBeVisible();
  expect(body).toMatchObject({ durationDays: 45 });
});

test("failed gifts stay visible and retries reuse the same request", async ({
  page,
}) => {
  await openUsers(page);
  const bodies: unknown[] = [];
  await page.route("**/admin/users/user-1/gift-plus", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Hadiah belum tersedia. Coba lagi.",
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "Beri Sydia Plus kepada User 1", exact: true })
    .click();
  const gift = page.getByRole("dialog");
  await gift.getByRole("button", { name: "7 hari", exact: true }).click();
  await gift.getByRole("button", { name: "Terapkan", exact: true }).click();
  await expect(gift.getByRole("alert")).toBeVisible();
  await expect(
    gift.getByRole("button", { name: "90 hari", exact: true })
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(gift).not.toBeVisible();
  await page
    .getByRole("button", { name: "Beri Sydia Plus kepada User 1", exact: true })
    .click();
  await gift.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

test("pending gifts block duplicate submission and cannot be dismissed", async ({
  page,
}) => {
  await openUsers(page);

  let release: () => void = () => {
    throw new Error("No pending request");
  };

  let requestCount = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/admin/users/user-1/gift-plus", async (route) => {
    requestCount += 1;
    await gate;
    await route.fulfill({
      json: { data: { paidUntil: "2026-12-01T00:00:00Z" } },
    });
  });
  await page
    .getByRole("button", { name: "Beri Sydia Plus kepada User 1", exact: true })
    .click();
  const gift = page.getByRole("dialog");
  await gift.getByRole("button", { name: "Terapkan", exact: true }).click();
  await expect(
    gift.getByRole("button", { name: "Menerapkan…", exact: true })
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(gift).toBeVisible();
  expect(requestCount).toBe(1);
  release();
  await expect(gift).not.toBeVisible();
});

test("gift picker stays inside the viewport", async ({ page }, testInfo) => {
  await openUsers(page);
  await page.getByRole("searchbox", { name: "Cari pengguna" }).fill("Ada");
  await expect(page.getByRole("status")).toHaveText(
    "Menampilkan 1–1 dari 1 pengguna"
  );
  await page
    .getByRole("button", { name: "Beri Sydia Plus kepada Ada", exact: true })
    .click();
  const gift = page.getByRole("dialog");
  await expect(
    gift.getByRole("button", { name: "30 hari", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  const bounds = await gift.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  await page.screenshot({
    path: `../../.impeccable/review/admin-gifts/${testInfo.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});

test("tablet users retain room for their name and gift action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await openUsers(page);
  await expect(page.getByRole("table")).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Beri Sydia Plus kepada User 1",
      exact: true,
    })
  ).toBeVisible();
});

test("plan, activity and sort filters reset pagination and reach the server", async ({
  page,
}) => {
  const requests = await openUsers(page);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("26–50");
  await page.getByRole("button", { name: "Paket: Semua", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter paket" })
    .selectOption("plus");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("plan"))
    .toBe("plus");
  expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
  await page
    .getByRole("combobox", { name: "Filter aktivitas" })
    .selectOption("inactive");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("activity"))
    .toBe("inactive");
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Urutkan pengguna" })
    .selectOption("activity");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("sort"))
    .toBe("activity");
});

test("CSV exports every matching page and protects spreadsheet formula cells", async ({
  page,
}) => {
  await openUsers(page);
  const exports: number[] = [];
  await page.route("**/admin/users?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("limit") !== "100") return route.fallback();
    const offset = Number(params.get("offset"));
    exports.push(offset);
    await route.fulfill({
      json: {
        data: Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({
          name: i === 0 ? "=DANGEROUS()" : `User ${offset + i}`,
          email: `${offset + i}@example.test`,
          status: "active",
          plan: "trial",
          createdAt: "2026-11-01T00:00:00Z",
          lastActivityAt: null,
          paidUntil: null,
          paymentTotalIdr: 0,
        })),
        pagination: { total: 101, offset, limit: 100 },
      },
    });
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor CSV", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(exports).toEqual([0, 100]);
  expect(csv.split("\r\n")).toHaveLength(102);
  expect(csv).toContain('"\'=DANGEROUS()"');
});

test("users can compare multiple expanded rows and close them independently", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === "desktop" ? 1440 : 390,
    height: 1000,
  });
  await openUsers(page, 7);
  const first = page.getByRole("button", {
    name: "Detail penggunaan untuk User 1",
    exact: true,
  });

  const second = page.getByRole("button", {
    name: "Detail penggunaan untuk User 2",
    exact: true,
  });

  await first.click();
  await second.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(second).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("heading", { name: "Penggunaan", exact: true })
  ).toHaveCount(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: testInfo.outputPath("pengguna-details.png"),
    fullPage: true,
    animations: "disabled",
  });
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(second).toHaveAttribute("aria-expanded", "true");
});
