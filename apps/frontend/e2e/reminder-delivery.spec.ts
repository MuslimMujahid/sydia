import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, delivery: Record<string, unknown>) {
  await page.route("**/reminders/delivery", (route) =>
    route.fulfill({ json: { data: delivery } })
  );
  await page.goto("/e2e/reminder-delivery.html");
}

test("a web-only account is told reminders cannot reach it and where to connect", async ({
  page,
}) => {
  await open(page, { status: "no_channel" });
  await expect(
    page.getByRole("heading", { name: "Pengingat belum bisa sampai ke kamu" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Hubungkan Telegram" })
  ).toHaveAttribute("href", "/settings/integrations");
});

test("an account with every channel muted is pointed to notification settings", async ({
  page,
}) => {
  await open(page, { status: "notifications_off" });
  await expect(
    page.getByRole("heading", { name: "Notifikasi pengingat sedang mati" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nyalakan notifikasi" })
  ).toHaveAttribute("href", "/settings/notifications");
});

test("no notice appears when reminders reach a connected channel", async ({
  page,
}) => {
  await open(page, { status: "reachable", channels: ["telegram"] });
  await expect(page.getByText("Pengingat", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});
