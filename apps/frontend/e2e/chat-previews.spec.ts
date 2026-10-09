import { expect, test, type Page, type Route } from "@playwright/test";
import type { SendMessageVariables } from "../src/lib/services/api/conversations/conversations.api";

const timestamp = "2026-10-09T08:00:00.000Z";

function response(values: SendMessageVariables) {
  const channel = values.previewChannel!;
  const conversationId =
    values.conversationId ??
    `conversation-${channel}-${values.previewSessionId}`;

  const runId = `${channel}-${values.idempotencyKey}`;
  const content =
    channel === "web"
      ? "**Baca buku** — saved"
      : channel === "telegram"
        ? "*Baca buku* — saved"
        : "*Baca buku* — saved\n- One\n- Two\n> Quoted\n`my_task_id`";

  return {
    conversation: {
      id: conversationId,
      title: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    userMessage: {
      id: `user-${runId}`,
      conversationId,
      role: "user",
      content: values.content,
      attachments: [],
      createdAt: timestamp,
    },
    assistantMessage: {
      id: `assistant-${runId}`,
      conversationId,
      role: "assistant",
      content,
      attachments: [],
      createdAt: timestamp,
    },
    assistantRun: {
      id: runId,
      conversationId,
      assistantMessageId: `assistant-${runId}`,
      status: "completed",
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    toolInvocations: [
      {
        id: `tool-${runId}`,
        assistantRunId: runId,
        name: "create_task",
        label: "Create task",
        status: "completed",
        objectId: `task-${channel}`,
        objectType: "task",
        state: null,
        output: {
          object: {
            id: `task-${channel}`,
            title: "Baca buku",
            status: "inbox",
          },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

async function fulfill(route: Route, values: SendMessageVariables) {
  await route.fulfill({
    contentType: "text/event-stream",
    body: `data: ${JSON.stringify({ type: "data-turn", data: response(values) })}\n\ndata: [DONE]\n\n`,
  });
}

async function mockMessages(page: Page) {
  const requests: SendMessageVariables[] = [];
  await page.route("**/conversations/messages/stream", async (route) => {
    const values = route.request().postDataJSON() as SendMessageVariables;
    requests.push(values);
    await fulfill(route, values);
  });

  return requests;
}

async function send(page: Page, content: string) {
  await page
    .getByRole("textbox", { name: "Message all three chats" })
    .fill(content);
  await page.getByRole("button", { name: "Send to all three chats" }).click();
  await expect(page.getByRole("button", { name: "New session" })).toBeEnabled();
}

test("fires three requests concurrently through the existing endpoint", async ({
  page,
}) => {
  const requests: SendMessageVariables[] = [];
  const pending: Route[] = [];
  await page.route("**/conversations/messages/stream", async (route) => {
    requests.push(route.request().postDataJSON() as SendMessageVariables);
    pending.push(route);
    if (pending.length === 3)
      await Promise.all(
        pending.map((item, index) => fulfill(item, requests[index]!))
      );
  });
  await page.goto("/e2e/chat-previews.html");
  await send(page, "Create a task");
  expect(requests.map((request) => request.previewChannel).sort()).toEqual([
    "telegram",
    "web",
    "whatsapp",
  ]);
  expect(
    new Set(requests.map((request) => request.previewSessionId)).size
  ).toBe(1);
  expect(requests.map((request) => request.content)).toEqual([
    "Create a task",
    "Create a task",
    "Create a task",
  ]);
});

test("keeps the composer unlabeled visually and resets below the send button", async ({
  page,
}) => {
  await page.goto("/e2e/chat-previews.html");
  await expect(
    page.getByRole("heading", { name: "Chat previews" })
  ).toHaveCount(0);
  await expect(
    page.getByText("Message all three chats", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message all three chats" })
  ).toBeVisible();
  const sendButton = await page
    .getByRole("button", { name: "Send to all three chats" })
    .boundingBox();

  const resetButton = await page
    .getByRole("button", { name: "New session" })
    .boundingBox();

  expect(sendButton).not.toBeNull();
  expect(resetButton).not.toBeNull();
  expect(resetButton!.y).toBeGreaterThan(sendButton!.y + sendButton!.height);
  expect(resetButton!.x).toBe(sendButton!.x);
});

test("separates each branded inbox and the shared composer", async ({
  page,
}) => {
  await page.goto("/e2e/chat-previews.html");
  const panes = page.getByRole("region");
  const logos = panes.locator("img");
  await expect(logos).toHaveCount(3);
  await expect
    .poll(() =>
      logos.evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0
        )
      )
    )
    .toBe(true);
  const rectangles = await panes.evaluateAll((sections) =>
    sections.map((section) => {
      const rect = section.getBoundingClientRect();

      return { left: rect.left, right: rect.right, bottom: rect.bottom };
    })
  );

  expect(rectangles[1]!.left).toBeGreaterThan(rectangles[0]!.right);
  expect(rectangles[2]!.left).toBeGreaterThan(rectangles[1]!.right);
  const composer = await page.locator("form").boundingBox();
  expect(composer!.y).toBeGreaterThan(rectangles[0]!.bottom);
});

test("renders channel syntax and reserves entity pills for web chat", async ({
  page,
}) => {
  let entityReads = 0;
  await page.route("**/tasks/*", (route) => {
    if (!["fetch", "xhr"].includes(route.request().resourceType()))
      return route.continue();
    entityReads += 1;

    return route.fulfill({ status: 500 });
  });
  await mockMessages(page);
  await page.goto("/e2e/chat-previews.html");
  await send(page, "Create a task");
  const web = page.getByRole("region", { name: "Web chat", exact: true });
  const telegram = page.getByRole("region", { name: "Telegram", exact: true });
  const whatsapp = page.getByRole("region", { name: "WhatsApp", exact: true });
  await expect(
    web.getByRole("button", { name: "Task: Baca buku" })
  ).toBeVisible();
  await expect(telegram.getByRole("article")).toContainText("*Baca buku*");
  await expect(telegram.locator("strong")).toHaveCount(0);
  await expect(whatsapp.locator("strong")).toHaveText("Baca buku");
  await expect(whatsapp.getByRole("listitem")).toHaveText(["One", "Two"]);
  await expect(whatsapp.locator("code")).toHaveText("my_task_id");
  await expect(whatsapp.locator("button[data-entity-kind]")).toHaveCount(0);
  await web.getByRole("button", { name: "Task: Baca buku" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Snapshot from this test response"
  );
  expect(entityReads).toBe(0);
});

test("starts all three channels fresh with one New session button", async ({
  page,
}) => {
  const requests = await mockMessages(page);
  await page.goto("/e2e/chat-previews.html");
  await send(page, "First session");
  const previousSession = requests[0]!.previewSessionId;
  await expect(page.getByRole("button", { name: "New session" })).toHaveCount(
    1
  );
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await send(page, "Second session");
  expect(requests.slice(3).map((request) => request.conversationId)).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  expect(requests[3]!.previewSessionId).not.toBe(previousSession);
  expect(
    new Set(requests.slice(3).map((request) => request.previewSessionId)).size
  ).toBe(1);
});

test("continues each channel in its own conversation", async ({ page }) => {
  const requests = await mockMessages(page);
  await page.goto("/e2e/chat-previews.html");
  await send(page, "First turn");
  await send(page, "Follow-up");
  expect(
    new Set(requests.slice(3).map((request) => request.conversationId)).size
  ).toBe(3);
  expect(
    requests
      .slice(3)
      .every(
        (request) =>
          request.conversationId ===
          `conversation-${request.previewChannel}-${request.previewSessionId}`
      )
  ).toBe(true);
});

test("keeps the selected inbox in view while all channels respond", async ({
  page,
}) => {
  await mockMessages(page);
  await page.goto("/e2e/chat-previews.html");
  await page.getByLabel("Web chat history", { exact: true }).focus();
  const before = await page
    .getByRole("region", { name: "Web chat", exact: true })
    .boundingBox();

  expect(before!.x).toBeGreaterThanOrEqual(0);
  await send(page, "Keep this inbox in view");
  await expect(page.getByRole("article")).toHaveCount(3);
  const after = await page
    .getByRole("region", { name: "Web chat", exact: true })
    .boundingBox();

  expect(after!.x).toBe(before!.x);
});

test("keeps successful panes visible and retries only the failed channel", async ({
  page,
}) => {
  const requests: SendMessageVariables[] = [];
  let rejectWhatsApp = true;
  await page.route("**/conversations/messages/stream", async (route) => {
    const values = route.request().postDataJSON() as SendMessageVariables;
    requests.push(values);
    if (values.previewChannel === "whatsapp" && rejectWhatsApp) {
      rejectWhatsApp = false;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "WhatsApp preview failed.",
          },
        },
      });
    } else await fulfill(route, values);
  });
  await page.goto("/e2e/chat-previews.html");
  await send(page, "Try all channels");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveText("WhatsApp preview failed.");
  await page.getByRole("button", { name: "Retry this channel" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  expect(requests).toHaveLength(4);
  const firstWhatsApp = requests.find(
    (request) => request.previewChannel === "whatsapp"
  )!;

  expect(requests[3]!.idempotencyKey).toBe(firstWhatsApp.idempotencyKey);
  expect(requests[3]!.previewChannel).toBe("whatsapp");
});

test("keeps the three panes side by side without overflowing the document on mobile", async ({
  page,
}) => {
  await page.goto("/e2e/chat-previews.html");
  const rectangles = await page.getByRole("region").evaluateAll((sections) =>
    sections.map((section) => {
      const rect = section.getBoundingClientRect();

      return { left: rect.left, top: rect.top };
    })
  );

  expect(rectangles[0]!.top).toBe(rectangles[1]!.top);
  expect(rectangles[1]!.top).toBe(rectangles[2]!.top);
  expect(rectangles[0]!.left).toBeLessThan(rectangles[1]!.left);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
