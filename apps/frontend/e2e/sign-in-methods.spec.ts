import { expect, test, type Page } from "@playwright/test";

const backend = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:5000";

async function openProfile(
  page: Page,
  methods: { password: boolean; google: boolean }
) {
  const login = await page.request.post(`${backend}/api/auth/sign-in/email`, {
    headers: { origin: "http://localhost:3000" },
    data: { email: "user@demo.com", password: "Demo1234!" },
  });

  expect(login.status()).toBe(200);
  await page.route(`${backend}/api/auth/registration/methods`, (route) =>
    route.fulfill({
      headers: {
        "access-control-allow-origin": "http://localhost:3000",
        "access-control-allow-credentials": "true",
      },
      json: {
        ...methods,
        googleEmail: methods.google ? "google-only@example.test" : null,
        confirmed: true,
        confirmationMethod: "password",
      },
    })
  );
  // Client navigation lets the browser control only provider-method metadata.
  await page.goto("/settings/assistant");
  // This settings page has no streaming connection. Finish loading its client
  // code before clicking, so the link does not become a server navigation.
  await page.waitForLoadState("networkidle");
  const metadata = page.waitForResponse(
    (response) => response.url() === `${backend}/api/auth/registration/methods`
  );

  await page.getByRole("link", { name: "Profil", exact: true }).click();
  expect((await metadata).status()).toBe(200);

  return page.getByRole("region", { name: "Cara masuk", exact: true });
}

for (const width of [390, 1440]) {
  test.describe(`sign-in methods at ${width}px`, () => {
    test.use({ viewport: { width, height: 1100 } });

    test("password label and change action share one row", async ({ page }) => {
      const card = await openProfile(page, { password: true, google: false });
      const heading = card.getByRole("heading", {
        name: "Kata sandi",
        exact: true,
      });

      const action = card.getByRole("link", { name: "Ubah kata sandi" });
      await expect(action).toBeVisible();
      const labelBox = await heading.boundingBox();
      const actionBox = await action.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(actionBox).not.toBeNull();
      expect(
        Math.abs(
          labelBox!.y +
            labelBox!.height / 2 -
            (actionBox!.y + actionBox!.height / 2)
        )
      ).toBeLessThanOrEqual(1);
      await card.screenshot({
        path: test.info().outputPath("password-row.png"),
      });
    });

    test("Google-only accounts omit the password section", async ({ page }) => {
      const card = await openProfile(page, { password: false, google: true });
      await expect(card.getByText("google-only@example.test")).toBeVisible();
      await expect(
        card.getByRole("heading", { name: "Kata sandi", exact: true })
      ).toHaveCount(0);
      await expect(
        card.getByRole("link", { name: "Ubah kata sandi" })
      ).toHaveCount(0);
      await expect(
        card.getByText("Masuk menggunakan akun Google yang terhubung.")
      ).toHaveCount(0);
      await card.screenshot({
        path: test.info().outputPath("google-only.png"),
      });
    });

    test("linked Google accounts retain their configured password action", async ({
      page,
    }) => {
      const card = await openProfile(page, { password: true, google: true });
      await expect(card.getByText("google-only@example.test")).toBeVisible();
      await expect(
        card.getByRole("link", { name: "Ubah kata sandi" })
      ).toBeVisible();
    });
  });
}
