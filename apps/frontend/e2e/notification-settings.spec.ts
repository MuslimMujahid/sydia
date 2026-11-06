import { expect, test, type Page } from "@playwright/test";
import { chooseOption, expectOptions } from "./select-field";

const initialPreferences = {
  automaticMemoryEnabled: false,
  persona: "professional",
  preferredAddress: null,
  briefingEnabled: true,
  weeklyBriefingEnabled: true,
  weeklyBriefingDay: 1,
  briefingTime: "08:00",
  followUpIntervalMinutes: 60,
  webNotificationsEnabled: true,
  telegramNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
};

async function openSettings(page: Page) {
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

  return () => preferences;
}

test("saves the weekly weekday and retains it after reload", async ({
  page,
}) => {
  const preferences = await openSettings(page);
  const weekday = page.getByLabel("Hari briefing mingguan", { exact: true });
  await expect(weekday).toHaveText("Senin");
  await expectOptions(weekday, [
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
    "Minggu",
  ]);
  await chooseOption(weekday, "Minggu");
  await expect.poll(() => preferences().weeklyBriefingDay).toBe(7);
  await page.reload();
  await expect(weekday).toHaveText("Minggu");
});

test("weekly-only briefing keeps the shared time editable", async ({
  page,
}) => {
  const preferences = await openSettings(page);
  await page
    .getByRole("switch", { name: "Aktifkan briefing harian", exact: true })
    .click();
  await expect.poll(() => preferences().briefingEnabled).toBe(false);
  const time = page.getByLabel("Jam briefing", { exact: true });
  await expect(time).toBeEnabled();
  await time.fill("09:15");
  await expect.poll(() => preferences().briefingTime).toBe("09:15");
  await page.reload();
  await expect(time).toHaveValue("09:15");
  await expect(
    page.getByRole("switch", {
      name: "Aktifkan briefing mingguan",
      exact: true,
    })
  ).toBeChecked();
});

test("switches independently disable the weekday and shared time controls", async ({
  page,
}) => {
  await openSettings(page);
  await page
    .getByRole("switch", { name: "Aktifkan briefing mingguan", exact: true })
    .click();
  await expect(
    page.getByLabel("Hari briefing mingguan", { exact: true })
  ).toBeDisabled();
  await expect(page.getByLabel("Jam briefing", { exact: true })).toBeEnabled();
  await page
    .getByRole("switch", { name: "Aktifkan briefing harian", exact: true })
    .click();
  await expect(page.getByLabel("Jam briefing", { exact: true })).toBeDisabled();
});

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

  await expect(interval).toHaveText("1 Jam");
  await expectOptions(interval, ["30 Menit", "1 Jam", "2 Jam", "3 Jam"]);
  await chooseOption(interval, "30 Menit");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(30);
  await expect(interval).toBeEnabled();
  await chooseOption(interval, "2 Jam");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(120);
  await expect(interval).toBeEnabled();
  await chooseOption(interval, "3 Jam");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(180);
  await expect(interval).toBeEnabled();
  await chooseOption(interval, "1 Jam");
  await expect.poll(() => preferences.followUpIntervalMinutes).toBe(60);
  await page.reload();
  await expect(interval).toHaveText("1 Jam");
});
