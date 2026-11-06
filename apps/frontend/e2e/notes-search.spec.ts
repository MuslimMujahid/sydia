import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/notes/search?**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");

    return route.fulfill({
      json: {
        data: [
          {
            ref: "custom:note",
            title: `Hasil ${query}`,
            path: "",
            excerpt: "",
          },
        ],
      },
    });
  });
});

async function openSearch(page: Page) {
  await page.goto("/e2e/notes-search.html");
  await expect(
    page.getByRole("textbox", { name: "Cari catatan" })
  ).toBeVisible();
}

async function openSearchWithPausedClock(page: Page) {
  const now = new Date("2026-11-06T00:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await openSearch(page);
}

test("search waits for a pause after the latest keystroke", async ({
  page,
}) => {
  await openSearchWithPausedClock(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/notes/search")
      requests.push(request.url());
  });
  const input = page.getByRole("textbox", { name: "Cari catatan" });

  await input.fill("c");
  await page.clock.runFor(200);
  await input.fill("ca");
  await page.clock.runFor(200);
  await input.fill("catatan");
  await page.clock.runFor(299);
  await expect(input).toHaveValue("catatan");
  expect(requests).toEqual([]);

  const sent = page.waitForRequest("**/notes/search?**");

  await page.clock.runFor(1);
  await sent;
  await page.clock.resume();
  await expect(
    page.getByRole("button", { name: "Hasil catatan" })
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]!).searchParams.get("query")).toBe("catatan");
});

test("clearing search cancels the pending query", async ({ page }) => {
  await openSearchWithPausedClock(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/notes/search")
      requests.push(request.url());
  });
  const input = page.getByRole("textbox", { name: "Cari catatan" });

  await input.fill("catatan");
  await page.clock.runFor(200);
  await input.fill("");
  await page.clock.runFor(1000);

  expect(requests).toEqual([]);
  await expect(
    page.getByText("Cari judul atau teks di dalam catatan.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hasil catatan" })
  ).toBeHidden();
});

test("leaving search cancels the pending query", async ({ page }) => {
  await openSearchWithPausedClock(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/notes/search")
      requests.push(request.url());
  });

  await page.getByRole("textbox", { name: "Cari catatan" }).fill("catatan");
  await page.clock.runFor(200);
  await page.getByRole("button", { name: "Tutup pencarian" }).click();
  await page.clock.runFor(1000);

  expect(requests).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "Cari catatan" })
  ).toBeHidden();
});
