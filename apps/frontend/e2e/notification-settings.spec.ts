import { expect, test } from "@playwright/test";

const initialPreferences = {
  automaticMemoryEnabled: false,
  persona: "professional",
  preferredAddress: null,
  briefingEnabled: true,
  briefingTime: "08:00",
  followUpIntervalMinutes: 60,
  webNotificationsEnabled: true,
  telegramNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
};

test("offers and saves each overdue task follow-up interval", async ({
  page,
}) => {
  let preferences = { ...initialPreferences };
  await page.route("**/users/me/preferences", async (route) => {
    if (route.request().method() === "PATCH") {
      preferences = { ...preferences, ...route.request().postDataJSON() };
    }

    await route.fulfill({ json: { data: preferences } });
  });
  await page.route("**/telegram/status", (route) =>
    route.fulfill({ json: { data: { linked: false } } })
  );
  await page.goto("/e2e/notification-settings.html");
  const interval = page.getByLabel("Pengingat tugas terlawat", {
    exact: true,
  });

  await expect(interval).toHaveValue("60");
  await expect(interval.locator("option")).toHaveText([
    "30 Menit",
    "1 Jam",
    "2 Jam",
    "3 Jam",
  ]);
  await interval.selectOption("30");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(30);
  await expect(interval).toBeEnabled();
  await interval.selectOption("120");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(120);
  await expect(interval).toBeEnabled();
  await interval.selectOption("180");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(180);
  await expect(interval).toBeEnabled();
  await interval.selectOption("60");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(60);
  await page.reload();
  await expect(interval).toHaveValue("60");
});
