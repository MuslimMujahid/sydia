import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

const backend = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:5000";
const mailbox = process.env.PLAYWRIGHT_MAIL_URL ?? "http://localhost:8025";
const password = "Registration123!";
test.setTimeout(60_000);
type MailList = {
  messages: { ID: string; Subject: string; To: { Address: string }[] }[];
};

async function deliveredCode(
  request: APIRequestContext,
  email: string,
  subject: string
) {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailbox}/api/v1/messages`);
        expect(response.ok()).toBe(true);
        const inbox = (await response.json()) as MailList;
        const message = inbox.messages.find(
          (item) =>
            item.Subject === subject &&
            item.To.some((to) => to.Address === email)
        );

        if (!message) return false;
        const detail = (await (
          await request.get(`${mailbox}/api/v1/message/${message.ID}`)
        ).json()) as { Text: string };

        code = detail.Text.match(/Kode Anda: (\d{6})/)?.[1];

        return Boolean(code);
      },
      {
        message:
          "The local SMTP server must receive the requested authentication email",
        timeout: 15_000,
      }
    )
    .toBe(true);
  if (!code)
    throw new Error("Delivered authentication email did not contain a code");

  return code;
}

async function register(page: Page) {
  const email = `registration-${randomUUID()}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Nama", { exact: true }).fill("Registration Test");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page
    .getByLabel("Konfirmasi kata sandi", { exact: true })
    .fill(password);
  // SMTP connection, greeting, and socket timeouts can exceed the normal UI
  // assertion deadline. Wait for the actual bounded delivery response first.
  const delivery = page.waitForResponse(
    (response) =>
      response.url() ===
        `${backend}/api/auth/email-otp/send-verification-otp` &&
      response.request().method() === "POST",
    { timeout: 45_000 }
  );

  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Periksa email Anda", exact: true })
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect((await delivery).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: /Kirim ulang dalam/ })
  ).toBeDisabled({ timeout: 15_000 });

  return email;
}

function wrongCode(code: string) {
  return code === "000000" ? "999999" : "000000";
}

test("keyboard skip navigation stays inside the mobile viewport and focuses the main content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sign-up");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", {
    name: "Lewati ke konten",
    exact: true,
  });

  await expect(skip).toBeFocused();
  const bounds = await skip.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

async function captureCompletedCode(page: Page, name: string) {
  const directory = process.env.AUTH_VISUAL_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.getByRole("heading", { level: 1 }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${directory}/${name}-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: `${directory}/${name}-desktop.png` });
}

test("email signup gates protected APIs until the delivered code is verified", async ({
  page,
}) => {
  const email = await register(page);
  const denied = await page.request.get(`${backend}/users/me`);
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({
    error: { details: { reason: "EMAIL_VERIFICATION_REQUIRED" } },
  });
  const code = await deliveredCode(
    page.request,
    email,
    "Verifikasi email Sydia Anda"
  );

  await page.getByLabel("Kode verifikasi", { exact: true }).fill(code);
  await captureCompletedCode(page, "verify-ready");
  await page
    .getByRole("button", { name: "Verifikasi email", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding/);
  expect((await page.request.get(`${backend}/users/me`)).ok()).toBe(true);
  await expect(
    page.getByRole("button", {
      name: /(?:hubungkan|connect).*Google Calendar/i,
    })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /(?:hubungkan|connect).*Google Calendar/i })
  ).toHaveCount(0);
});

test("the fifth incorrect code invalidates the challenge in the real protection store", async ({
  page,
}) => {
  const email = await register(page);
  const code = await deliveredCode(
    page.request,
    email,
    "Verifikasi email Sydia Anda"
  );

  const submit = (otp: string) =>
    page.request.post(`${backend}/api/auth/email-otp/verify-email`, {
      headers: { origin: "http://localhost:3000" },
      data: { email, otp },
    });

  expect((await submit(wrongCode(code))).status()).toBe(400);
  expect((await submit(wrongCode(code))).status()).toBe(400);
  expect((await submit(wrongCode(code))).status()).toBe(400);
  expect((await submit(wrongCode(code))).status()).toBe(400);
  const fifth = await submit(wrongCode(code));
  expect(fifth.status()).toBe(403);
  expect(await fifth.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  expect((await submit(code)).status()).toBe(403);
  expect((await page.request.get(`${backend}/users/me`)).status()).toBe(403);
});

test("concurrent correct submissions consume the delivered code once", async ({
  page,
}) => {
  const email = await register(page);
  const code = await deliveredCode(
    page.request,
    email,
    "Verifikasi email Sydia Anda"
  );

  const submit = () =>
    page.request.post(`${backend}/api/auth/email-otp/verify-email`, {
      headers: { origin: "http://localhost:3000" },
      data: { email, otp: code },
    });

  const results = await Promise.all([submit(), submit()]);

  expect(results.map((result) => result.status()).sort()).toEqual([200, 400]);
  expect((await page.request.get(`${backend}/users/me`)).ok()).toBe(true);
});

test("a wrong code has a recoverable error state and the correct code still works", async ({
  page,
}) => {
  const email = await register(page);
  const code = await deliveredCode(
    page.request,
    email,
    "Verifikasi email Sydia Anda"
  );

  await page
    .getByLabel("Kode verifikasi", { exact: true })
    .fill(wrongCode(code));
  await page
    .getByRole("button", { name: "Verifikasi email", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kode belum cocok", exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel("Kode verifikasi", { exact: true })
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("Sisa percobaan: 4.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .getByRole("button", { name: "Coba lagi", exact: true })
      .boundingBox()
  ).toMatchObject({ y: 447 });
  await captureCompletedCode(page, "wrong-code");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByLabel("Kode verifikasi", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: "Verifikasi email", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("pasting a spaced verification code preserves all six digits and verifies the account", async ({
  page,
}) => {
  const email = await register(page);
  const code = await deliveredCode(
    page.request,
    email,
    "Verifikasi email Sydia Anda"
  );

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await page.evaluate(
    (text) => navigator.clipboard.writeText(text),
    `${code.slice(0, 3)} ${code.slice(3)}`
  );
  await page.getByLabel("Kode verifikasi", { exact: true }).focus();
  await page.keyboard.press("Control+V");

  await expect(page.getByLabel("Kode verifikasi", { exact: true })).toHaveValue(
    code
  );
  await page
    .getByRole("button", { name: "Verifikasi email", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("registration becomes interactive while remote Google Fonts cannot respond", async ({
  page,
}) => {
  const fontRequests: string[] = [];
  // Leave the remote stylesheet pending, matching the observed network outage.
  // Closing this isolated browser context releases the held request.
  await page.route("https://fonts.googleapis.com/**", (route) => {
    fontRequests.push(route.request().url());
  });
  await page.goto("/sign-up", { waitUntil: "commit" });

  await expect(page.getByLabel("Email", { exact: true })).toBeEditable();
  await expect(page.getByLabel("Kata sandi", { exact: true })).toBeEditable();
  expect(fontRequests).toEqual([]);
});

test("cancelled Google sign-in returns to a usable password sign-in screen", async ({
  page,
}) => {
  await page.goto("/google-result?error=access_denied");
  await expect(
    page.getByRole("heading", { name: "Belum masuk dengan Google" })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Proses masuk dibatalkan."
  );

  await page
    .getByRole("link", { name: "Kembali ke masuk", exact: true })
    .click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel("Email", { exact: true })).toBeEditable();
  await expect(page.getByLabel("Kata sandi", { exact: true })).toBeEditable();
});

test("email correction verifies the replacement before changing the existing identity", async ({
  page,
}) => {
  const email = await register(page);
  const initial = (await (
    await page.request.get(`${backend}/api/auth/get-session`)
  ).json()) as { user: { id: string } };

  const replacement = `replacement-${randomUUID()}@example.test`;
  await page
    .getByRole("link", { name: "Email salah? Ubah email", exact: true })
    .click();
  await page.getByLabel("Kata sandi saat ini", { exact: true }).fill(password);
  await page.getByLabel("Email baru", { exact: true }).fill(replacement);
  await page
    .getByRole("button", { name: "Kirim kode ke email baru", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verifikasi email baru", exact: true })
  ).toBeVisible();
  const pending = (await (
    await page.request.get(`${backend}/api/auth/get-session`)
  ).json()) as { user: { email: string } };

  expect(pending.user.email).toBe(email);
  const code = await deliveredCode(
    page.request,
    replacement,
    "Verifikasi email baru Sydia Anda"
  );

  await page.getByLabel("Kode verifikasi", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: "Verifikasi email baru", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Email berhasil diubah", exact: true })
  ).toBeVisible();
  const changed = (await (
    await page.request.get(`${backend}/api/auth/get-session`)
  ).json()) as { user: { id: string; email: string; emailVerified: boolean } };

  expect(changed.user).toMatchObject({
    id: initial.user.id,
    email: replacement,
    emailVerified: true,
  });
});

test("password recovery ends existing sessions and returns to password sign-in", async ({
  page,
}) => {
  const email = `recovery-${randomUUID()}@example.test`;
  const registration = await page.request.post(
    `${backend}/api/auth/sign-up/email`,
    {
      headers: { origin: "http://localhost:3000" },
      data: { name: "Recovery Test", email, password },
    }
  );

  expect(registration.ok()).toBe(true);
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Kirim kode pemulihan", exact: true })
    .click();
  await expect(page.getByLabel("Kode verifikasi", { exact: true })).toBeVisible(
    { timeout: 20_000 }
  );
  const code = await deliveredCode(
    page.request,
    email,
    "Pulihkan kata sandi Sydia Anda"
  );

  await page.getByLabel("Kode verifikasi", { exact: true }).fill(code);
  await captureCompletedCode(page, "recovery-code");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await page
    .getByLabel("Kata sandi baru", { exact: true })
    .fill("Replacement123!");
  await page
    .getByLabel("Ulangi kata sandi baru", { exact: true })
    .fill("Replacement123!");
  await page
    .getByRole("button", { name: "Simpan kata sandi baru", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kata sandi diperbarui", exact: true })
  ).toBeVisible();
  expect(
    await (await page.request.get(`${backend}/api/auth/get-session`)).json()
  ).toBeNull();
  await page
    .getByRole("link", { name: "Kembali ke masuk", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill("Replacement123!");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("the sending cooldown is enforced by the server", async ({ page }) => {
  const email = await register(page);
  const limited = await page.request.post(
    `${backend}/api/auth/email-otp/send-verification-otp`,
    {
      headers: { origin: new URL(page.url()).origin },
      data: { email, type: "email-verification" },
    }
  );

  expect(limited.status()).toBe(429);
  expect(await limited.json()).toMatchObject({ code: "AUTH_RATE_LIMITED" });
});

test("mobile signup keeps a 342 pixel form with no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1060 });
  await page.goto("/sign-up");
  const bounds = await page.locator("form").boundingBox();
  expect(bounds?.width).toBe(342);
  expect(bounds?.x).toBe(24);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Lanjutkan dengan Google", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buat akun", exact: true })
  ).toBeVisible();
});

test("signup cannot submit credentials before JavaScript is interactive", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/sign-up");
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Kata sandi", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Buat akun", exact: true })
  ).toBeDisabled();
  await context.close();
});
