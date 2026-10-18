import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-10-08T08:00:00.000Z";
const task = {
  id: "task-1",
  title: "Baca buku",
  status: "inbox",
  dueAt: "2026-10-08T15:59:00.000Z",
  priority: "medium",
  categories: [],
  source: null,
  description: null,
  completedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const reminder = {
  id: "reminder-1",
  title: "Minum obat",
  scheduledAt: "2026-10-09T09:00:00.000Z",
  recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [2, 4] },
  notes: null,
  source: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const document = {
  id: "document-1",
  title: "Invoice.pdf",
  status: "ready",
  file: {
    id: "asset-1",
    originalName: "Invoice.pdf",
    mimeType: "application/pdf",
    size: 1234,
    kind: "document",
    createdAt: timestamp,
  },
  description: null,
  textContent: null,
  transcript: null,
  imageDescription: null,
  structuredData: null,
  errorMessage: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const event = {
  id: "event-1",
  title: "Rapat tim",
  startAt: timestamp,
  endAt: "2026-10-08T09:00:00.000Z",
  timezone: "Asia/Makassar",
  status: "confirmed",
  location: "Kantor",
  attendees: [],
  description: null,
  provider: "google",
  providerEventId: "google-event-1",
  createdAt: timestamp,
  updatedAt: timestamp,
};

async function mockDetails(page: Page) {
  await page.route("**/tasks/task-1", (route) =>
    route.fulfill({ json: { data: task } })
  );
  await page.route("**/reminders/reminder-1", (route) =>
    route.fulfill({ json: { data: reminder } })
  );
  await page.route("**/documents/document-1", (route) =>
    route.fulfill({ json: { data: document } })
  );
  await page.route("**/calendar/events?*", (route) =>
    route.fulfill({ json: { data: [event] } })
  );
}

test.beforeEach(async ({ page }) => {
  await mockDetails(page);
});

test("replaces cards with four distinctly styled entity pills in Markdown", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html");
  const answer = page.getByRole("article", { name: "Jawaban Sydia" });
  await expect(
    answer.getByRole("button", { name: "Tugas: Baca buku" })
  ).toHaveCount(2);
  await expect(
    answer.getByRole("button", { name: "Pengingat: Minum obat" })
  ).toBeVisible();
  await expect(
    answer.getByRole("button", { name: "File: Invoice.pdf" })
  ).toBeVisible();
  await expect(
    answer.getByRole("button", { name: "Acara: Rapat tim" })
  ).toBeVisible();
  await expect(answer.getByText("Tugas tersimpan")).toHaveCount(0);
  await expect(answer.getByText("Tandai selesai")).toHaveCount(0);
  await expect(answer.locator("code")).toHaveText("Baca buku");
  await expect(answer.getByRole("link", { name: "Baca buku" })).toHaveAttribute(
    "href",
    "https://example.test"
  );
  const colors = await answer
    .locator("button[data-entity-kind]")
    .evaluateAll((buttons) => [
      ...new Set(
        buttons.map((button) => getComputedStyle(button).backgroundColor)
      ),
    ]);

  expect(colors).toHaveLength(4);
  await expect(answer.locator("button[data-entity-kind] svg")).toHaveCount(5);
});

test("shows an omitted saved entity as a compact pill", async ({ page }) => {
  await page.goto("/e2e/entity-renderer.html?mode=fallback");
  await expect(
    page
      .getByRole("article", { name: "Jawaban Sydia" })
      .getByRole("button", { name: "Tugas: Baca buku" })
  ).toBeVisible();
});

test("renders a task receipt with metadata and one existing smart entity pill", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html?mode=task-receipt");
  const answer = page.getByRole("article", { name: "Jawaban Sydia" });
  await expect(answer.getByText("Siap, tugasnya sudah dibuat.")).toBeVisible();
  await expect(answer.getByRole("listitem")).toHaveText(
    "Baca buku — Tenggat 8 Okt 2026, 23.59 · Prioritas tinggi"
  );
  await expect(answer.getByRole("listitem")).toBeVisible();
  await expect(answer.getByRole("button")).toHaveCount(1);
  await expect(answer.getByRole("link")).toHaveCount(0);

  const pill = answer.getByRole("button", { name: "Tugas: Baca buku" });
  await pill.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tandai selesai", exact: true })
  ).toBeVisible();
});

test("renders a task batch with one confirmation and one pill per saved task", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html?mode=task-batch");
  const answer = page.getByRole("article", { name: "Jawaban Sydia" });
  await expect(answer.getByText("Siap, 3 tugas sudah dibuat.")).toBeVisible();
  await expect(answer.getByRole("listitem")).toHaveText([
    "Baca buku — Tenggat 8 Okt 2026, 23.59 · Prioritas tinggi",
    "Kirim proposal — Tenggat 9 Okt 2026, 11.00",
    "Beli perlengkapan kantor",
  ]);
  await expect(answer.getByRole("button")).toHaveCount(3);
  await expect(
    answer.getByRole("button", { name: "Tugas: Baca buku" })
  ).toHaveCount(1);
  await expect(
    answer.getByRole("button", { name: "Tugas: Kirim proposal" })
  ).toHaveCount(1);
  await expect(
    answer.getByRole("button", { name: "Tugas: Beli perlengkapan kantor" })
  ).toHaveCount(1);
  await expect(answer.getByRole("listitem").nth(1)).toBeVisible();
  await expect(answer.getByRole("link")).toHaveCount(0);
});

test("renders task ID references despite a duplicate title in lookup results", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html?mode=task-list");
  const answer = page.getByRole("article", { name: "Jawaban Sydia" });
  await expect(
    answer.getByText("Ada 3 tugas yang belum selesai:")
  ).toBeVisible();
  await expect(answer.getByRole("listitem")).toHaveText([
    "Baca buku — Tenggat 8 Okt 2026, 23.59 · Prioritas tinggi · Sedang dikerjakan",
    "Kirim proposal — Tenggat 9 Okt 2026, 11.00",
    "Beli perlengkapan kantor",
  ]);
  await expect(answer.getByRole("button")).toHaveCount(3);

  for (const title of [
    "Baca buku",
    "Kirim proposal",
    "Beli perlengkapan kantor",
  ]) {
    await expect(
      answer.getByRole("button", { name: `Tugas: ${title}` })
    ).toHaveCount(1);
  }

  await expect(answer.getByRole("link")).toHaveCount(0);

  const request = page.waitForRequest("**/tasks/task-1");
  await answer.getByRole("button", { name: "Tugas: Baca buku" }).click();
  await request;
  await expect(page.getByRole("dialog")).toBeVisible();
});

for (const mode of ["compact-receipts", "compact-lists"]) {
  test(`renders ${mode} with inline details and existing entity access`, async ({
    page,
  }) => {
    await page.goto(`/e2e/entity-renderer.html?mode=${mode}`);
    const answer = page.getByRole("article", { name: "Jawaban Sydia" });

    await expect(answer.getByRole("listitem")).toHaveText([
      "Minum obat — Pada 13 Okt 2026, 17.00 · mingguan pada Selasa, Kamis",
      "Rapat tim — 8 Okt 2026, 16.00–17.00 · Kantor",
      "Invoice.pdf — PDF · 150 KB",
      "Bu Rina — rina@example.test · +62 811 000 · Grup: Teman Kerja",
      "Teman Kerja — 2 kontak",
    ]);
    await expect(answer.getByRole("button")).toHaveCount(3);
    await expect(
      answer.getByRole("button", { name: "Pengingat: Minum obat" })
    ).toHaveCount(1);
    await expect(
      answer.getByRole("button", { name: "Acara: Rapat tim" })
    ).toHaveCount(1);
    await expect(
      answer.getByRole("button", { name: "File: Invoice.pdf" })
    ).toHaveCount(1);
    await expect(answer.getByRole("link", { name: "Invoice.pdf" })).toHaveCount(
      0
    );

    const filePill = answer.getByRole("button", { name: "File: Invoice.pdf" });
    await filePill.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Invoice.pdf", { exact: true })
    ).toBeVisible();
  });
}

test("keeps an entity popover open when message data refreshes", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Tugas: Baca buku" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("entity-fixture-refresh"))
  );
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("completes and reopens a task from its popover", async ({ page }) => {
  let current = { ...task };
  await page.route("**/tasks/task-1", async (route) => {
    if (route.request().method() === "PATCH")
      current = { ...current, ...route.request().postDataJSON() };
    await route.fulfill({ json: { data: current } });
  });
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Tugas: Baca buku" }).first().click();
  await page
    .getByRole("button", { name: "Tandai selesai", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Kembalikan ke inbox" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Kembalikan ke inbox" }).click();
  await expect(
    page.getByRole("button", { name: "Tandai selesai", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Lihat tugas" })).toHaveAttribute(
    "href",
    /mode=tasks.*id=task-1/
  );
});

test("keeps a failed task action visible without changing status", async ({
  page,
}) => {
  await page.route("**/tasks/task-1", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          json: {
            error: {
              code: "INTERNAL_ERROR",
              message: "Perubahan belum tersimpan.",
            },
          },
        })
      : route.fulfill({ json: { data: task } })
  );
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Tugas: Baca buku" }).first().click();
  await page
    .getByRole("button", { name: "Tandai selesai", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Perubahan belum tersimpan."
  );
  await expect(
    page.getByRole("button", { name: "Tandai selesai", exact: true })
  ).toBeEnabled();
});

test("snoozes an active reminder and updates its details", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-10T00:00:00.000Z"));
  let current = { ...reminder };
  await page.route("**/reminders/reminder-1", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toEqual({
        snoozeUntil: "2026-10-10T01:00:00.000Z",
      });
      current = { ...reminder, scheduledAt: "2026-10-10T01:00:00.000Z" };
      await route.fulfill({ json: { data: current } });
    } else await route.fulfill({ json: { data: current } });
  });
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Pengingat: Minum obat" }).click();
  await expect(
    page.getByText("Berulang mingguan pada Selasa, Kamis")
  ).toBeVisible();
  await page.getByRole("button", { name: "Tunda 1 jam" }).click();
  await expect(page.getByText(/10 Okt 2026.*09[.:]00/)).toBeVisible();
});

test("offers authenticated file open and download links", async ({ page }) => {
  await page.goto("/e2e/entity-renderer.html");
  await page
    .getByRole("article", { name: "Jawaban Sydia" })
    .getByRole("button", { name: "File: Invoice.pdf" })
    .click();
  await expect(page.getByRole("link", { name: "Buka file" })).toHaveAttribute(
    "href",
    "http://localhost:5000/documents/document-1/content"
  );
  await expect(page.getByRole("link", { name: "Unduh" })).toHaveAttribute(
    "href",
    "http://localhost:5000/documents/document-1/content?download=1"
  );
});

test("shows event details in its timezone and links to that calendar day", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Acara: Rapat tim" }).click();
  await expect(page.getByText("Asia/Makassar", { exact: true })).toBeVisible();
  await expect(page.getByText("Kantor", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Lihat kalender" })
  ).toHaveAttribute("href", /date=2026-10-08.*view=day/);
});

test("shows a missing record and allows retry without presenting actions", async ({
  page,
}) => {
  await page.route("**/tasks/task-1", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Tugas tidak ditemukan." } },
    })
  );
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Tugas: Baca buku" }).first().click();
  await expect(page.getByRole("alert")).toHaveText("Tugas tidak ditemukan.");
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tandai selesai" })
  ).toHaveCount(0);
});

test("restores keyboard focus when the popover closes", async ({ page }) => {
  await page.goto("/e2e/entity-renderer.html");
  const pill = page.getByRole("button", { name: "Tugas: Baca buku" }).first();
  await pill.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Tandai selesai", exact: true })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );

  expect(overflow).toBe(false);
});

test("loads an uploaded attachment using its document ID", async ({ page }) => {
  await page.goto("/e2e/entity-renderer.html");
  await page
    .getByRole("article", { name: "Pesan Anda" })
    .getByRole("button", { name: "File: Invoice.pdf" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Siap digunakan");
});

test("keeps document citation locations and excerpts beside a file pill", async ({
  page,
}) => {
  await page.goto("/e2e/entity-renderer.html?mode=sources");
  const sources = page.getByRole("complementary", { name: "Sumber jawaban" });
  await expect(
    sources.getByRole("button", { name: "File: Invoice.pdf" })
  ).toBeVisible();
  await expect(sources).toContainText("halaman 1");
  await expect(sources).toContainText("Invoice total: Rp 150.000");
});

test("renders reminder details and actions in English", async ({ page }) => {
  await page.goto("/e2e/entity-renderer.html?mode=english");
  await page.getByRole("button", { name: "Reminder: Minum obat" }).click();
  await expect(page.getByText("Every week on Tuesday, Thursday")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete", exact: true })
  ).toBeVisible();
});

test("shows an unavailable event instead of outdated details", async ({
  page,
}) => {
  await page.route("**/calendar/events?*", (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Acara: Rapat tim" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Acara ini tidak lagi ada pada waktu semula."
  );
  await expect(page.getByText("Kantor", { exact: true })).toHaveCount(0);
});

test("hard deletes a reminder from chat instead of completing or cancelling it", async ({
  page,
}) => {
  let deleted = false;
  await page.route("**/reminders/reminder-1", async (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      await route.fulfill({ status: 204 });
    } else if (deleted) {
      await route.fulfill({
        status: 404,
        json: {
          error: { code: "NOT_FOUND", message: "Pengingat tidak ditemukan." },
        },
      });
    } else await route.fulfill({ json: { data: reminder } });
  });
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Pengingat: Minum obat" }).click();
  await expect(
    page.getByRole("button", { name: "Selesai", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Batalkan", exact: true })
  ).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Pengingat dihapus.");
  expect(deleted).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Pengingat: Minum obat" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Pengingat tidak ditemukan."
  );
});

test("keeps a reminder available when deletion fails", async ({ page }) => {
  await page.route("**/reminders/reminder-1", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 500,
          json: {
            error: {
              code: "INTERNAL_ERROR",
              message: "Pengingat belum dihapus.",
            },
          },
        })
      : route.fulfill({ json: { data: reminder } })
  );
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Pengingat: Minum obat" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Pengingat belum dihapus.");
  await expect(
    page.getByRole("button", { name: "Hapus", exact: true })
  ).toBeEnabled();
  await expect(page.getByText("Pengingat dihapus.")).toHaveCount(0);
});

test("does not delete a reminder when confirmation is dismissed", async ({
  page,
}) => {
  let deletes = 0;
  await page.route("**/reminders/reminder-1", (route) => {
    if (route.request().method() === "DELETE") deletes += 1;

    return route.fulfill({ json: { data: reminder } });
  });
  await page.goto("/e2e/entity-renderer.html");
  await page.getByRole("button", { name: "Pengingat: Minum obat" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tunda 1 jam" })).toBeVisible();
  expect(deletes).toBe(0);
});

test("removes a hard deleted reminder from the list on desktop and mobile", async ({
  page,
}, testInfo) => {
  let deleted = false;
  await page.route(/\/reminders(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { data: deleted ? [] : [reminder] } })
  );
  await page.route("**/reminders/reminder-1", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleted = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto("/e2e/entity-renderer.html?mode=reminders");
  await expect(
    page.getByRole("heading", { name: reminder.title })
  ).toBeVisible();
  if (testInfo.project.name === "mobile")
    await page
      .getByRole("button", { name: `Tindakan untuk ${reminder.title}` })
      .click();
  await expect(
    page.getByRole("button", { name: "Selesai", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Batalkan", exact: true })
  ).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole(testInfo.project.name === "mobile" ? "menuitem" : "button", {
      name: "Hapus",
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { name: reminder.title })).toHaveCount(
    0
  );
  expect(deleted).toBe(true);
});

test("hard deletes a reminder from Today", async ({ page }) => {
  let deleted = false;
  await page.route("**/reminders", (route) =>
    route.fulfill({ json: { data: deleted ? [] : [reminder] } })
  );
  await page.route("**/reminders/reminder-1", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleted = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto("/e2e/entity-renderer.html?mode=compact-reminders");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Hapus pengingat ${reminder.title}` })
    .click();
  await expect(page.getByText(reminder.title, { exact: true })).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("lists reminders without a status filter or a status query parameter", async ({
  page,
}) => {
  let requestedStatus: string | null | undefined;
  await page.route(/\/reminders(?:\?.*)?$/, (route) => {
    requestedStatus = new URL(route.request().url()).searchParams.get("status");

    return route.fulfill({ json: { data: [reminder] } });
  });
  await page.goto("/e2e/entity-renderer.html?mode=reminders");
  await expect(
    page.getByRole("heading", { name: reminder.title })
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Status pengingat" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Waktu pengingat" })
  ).toBeVisible();
  expect(requestedStatus).toBeNull();
  await expect(page.getByText("Terjadwal", { exact: true })).toHaveCount(0);
});

test("multi-day chat references load their full all-day range", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/calendar/events?*", (route) => {
    requests.push(route.request().url());

    return route.fulfill({
      json: {
        data: [
          {
            ...event,
            id: "event-all-day",
            title: "Libur tim",
            startAt: null,
            endAt: null,
            timezone: null,
            allDayStartDate: "2026-10-20T00:00:00.000Z",
            allDayEndDate: "2026-10-23T00:00:00.000Z",
          },
        ],
      },
    });
  });
  await page.goto("/e2e/entity-renderer.html?mode=all-day");
  await page.getByRole("button", { name: "Acara: Libur tim" }).click();
  await expect(
    page.getByText("20 Okt 2026 – 22 Okt 2026 · Sepanjang hari", {
      exact: true,
    })
  ).toBeVisible();
  expect(new URL(requests[0]!).searchParams.get("from")).toBe(
    "2026-10-20T00:00:00.000Z"
  );
  expect(new URL(requests[0]!).searchParams.get("to")).toBe(
    "2026-10-23T00:00:00.000Z"
  );
});

test("multi-day preview references display included dates without fetching user data", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/calendar/events"))
      requests.push(request.url());
  });
  await page.goto("/e2e/entity-renderer.html?mode=all-day-preview");
  await page.getByRole("button", { name: "Acara: Libur tim" }).click();
  await expect(
    page.getByText("20 Okt 2026 – 22 Okt 2026 · Sepanjang hari", {
      exact: true,
    })
  ).toBeVisible();
  expect(requests).toEqual([]);
});
