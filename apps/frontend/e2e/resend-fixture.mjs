// Loaded only by the Playwright backend process. Never sends real email.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import process from "node:process";

const messages = [];
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url !== "https://api.resend.com/emails") return realFetch(input, init);

  const request = new Request(input, init);

  if (
    request.method !== "POST" ||
    request.headers.get("authorization") !== "Bearer re_playwright_fixture"
  ) {
    return Response.json({ name: "validation_error" }, { status: 401 });
  }

  const message = await request.json();
  const id = randomUUID();
  messages.unshift({ ...message, id });

  return Response.json({ id });
};

const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/messages") {
    response.writeHead(404).end();

    return;
  }

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ messages }));
});

server.on("error", (error) => {
  console.error("Playwright Resend fixture could not start:", error.code);
  process.exit(1);
});
server.listen(8026, "127.0.0.1");
server.unref();
