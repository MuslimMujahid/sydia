import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/dev-toolbar.html");
  await page.getByRole("button", { name: "Development tools" }).click();
});

test("opens above the bottom-right toggle and closes with Escape", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Send daily brief" })
  ).toBeVisible();
  const toggle = await page
    .getByRole("button", { name: "Development tools" })
    .boundingBox();

  expect(toggle).not.toBeNull();
  expect(toggle!.x).toBeGreaterThan(page.viewportSize()!.width - 70);
  expect(toggle!.y).toBeGreaterThan(page.viewportSize()!.height - 80);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Send daily brief" })
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Development tools" })
  ).toBeFocused();
});

test("queues daily briefs with distinct request keys for deliberate sends", async ({
  page,
}) => {
  const requests: { requestId: string }[] = [];
  await page.route("**/dev/notifications/daily-brief", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: { data: { status: "queued", deliveryCount: 2, replayed: false } },
    });
  });
  await page.getByRole("button", { name: "Send daily brief" }).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Send daily brief" })
  ).toBeEnabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Send daily brief" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(requests[0]!.requestId).not.toBe(requests[1]!.requestId);
});

test("keeps the toolbar limited to its actions", async ({ page }) => {
  await expect(
    page.getByText("Development tools", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Send to this account’s enabled Telegram and WhatsApp channels."
    )
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send follow-up" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Chat previews" })).toBeVisible();
});

test("disables sending while a follow-up request is pending", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });

  await page.route("**/dev/notifications/follow-up", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        data: { status: "nothing_due", deliveryCount: 0, replayed: false },
      },
    });
  });
  await page.getByRole("button", { name: "Send follow-up" }).click();
  await expect(
    page.getByRole("button", { name: "Send daily brief" })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send follow-up" })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send weekly brief only", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send weekly + daily brief", exact: true })
  ).toBeDisabled();
  finish();
  await expect(page.getByRole("status")).toHaveText(
    "No tasks are due for follow-up."
  );
});

test("surfaces request failures and permits another send", async ({ page }) => {
  const requests: { requestId: string }[] = [];
  await page.route("**/dev/notifications/daily-brief", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 503,
      json: { error: { message: "Queue unavailable. Check Redis." } },
    });
  });
  await page.getByRole("button", { name: "Send daily brief" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Queue unavailable. Check Redis."
  );
  await expect(
    page.getByRole("button", { name: "Send daily brief" })
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send daily brief" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]!.requestId).toBe(requests[0]!.requestId);
});

test("reports disabled notification channels without claiming delivery", async ({
  page,
}) => {
  await page.route("**/dev/notifications/daily-brief", async (route) => {
    await route.fulfill({
      json: { data: { status: "queued", deliveryCount: 0, replayed: false } },
    });
  });
  await page.getByRole("button", { name: "Send daily brief" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Notifications are disabled in settings."
  );
});

test("links to chat previews", async ({ page }) => {
  await page.getByRole("link", { name: "Chat previews" }).click();
  await expect(page).toHaveURL(/\/chats$/);
});

const weeklyActions = [
  { label: "Send weekly brief only", endpoint: "weekly-brief" },
  { label: "Send weekly + daily brief", endpoint: "daily-weekly-brief" },
];

for (const { label, endpoint } of weeklyActions) {
  test(`${label} sends to its endpoint with distinct keys for deliberate sends`, async ({
    page,
  }) => {
    const requests: { requestId: string }[] = [];
    await page.route(`**/dev/notifications/${endpoint}`, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        json: { data: { status: "queued", deliveryCount: 2, replayed: false } },
      });
    });
    const action = page.getByRole("button", { name: label, exact: true });
    await action.click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(action).toBeEnabled();
    await action.click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[1]!.requestId).not.toBe(requests[0]!.requestId);
  });

  test(`${label} retains its request key after a failed send`, async ({
    page,
  }) => {
    const requests: { requestId: string }[] = [];
    await page.route(`**/dev/notifications/${endpoint}`, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 503,
        json: { error: { message: "Queue unavailable. Check Redis." } },
      });
    });
    const action = page.getByRole("button", { name: label, exact: true });
    await action.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Queue unavailable. Check Redis."
    );
    await action.click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]!.requestId).toBe(requests[0]!.requestId);
  });
}
