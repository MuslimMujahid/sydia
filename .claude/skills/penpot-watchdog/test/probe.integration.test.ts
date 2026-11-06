import { afterEach, expect, test } from "bun:test";
import { PenpotProbe } from "../scripts/probe";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

function mcpFixture(
  options: {
    sse?: boolean;
    pluginError?: string;
    unexpected?: boolean;
    hang?: boolean;
  } = {}
) {
  const methods: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      if (request.method === "GET") return new Response(null, { status: 405 });
      const message = (await request.json()) as {
        id?: number;
        method: string;
        params?: { name?: string; arguments?: unknown };
      };
      methods.push(
        message.method === "tools/call"
          ? String(message.params?.name)
          : message.method
      );
      if (message.id === undefined) return new Response(null, { status: 202 });
      if (options.hang) return new Promise<Response>(() => {});
      let result: unknown;
      if (message.method === "initialize") {
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
        };
      } else if (message.params?.name === "high_level_overview") {
        result = {
          content: [
            {
              type: "text",
              text: "Use execute_code for read-only JavaScript.",
            },
          ],
        };
      } else {
        result = options.pluginError
          ? {
              isError: true,
              content: [{ type: "text", text: options.pluginError }],
            }
          : {
              content: [
                {
                  type: "text",
                  text: options.unexpected
                    ? "Execution failed"
                    : '{"watchdog":"penpot-watchdog","ok":true}',
                },
              ],
            };
      }
      const body = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
      return options.sse
        ? new Response(`event: message\ndata: ${body}\n\n`, {
            headers: { "Content-Type": "text/event-stream" },
          })
        : Response.json(JSON.parse(body));
    },
  });
  cleanup.push(() => server.stop(true));
  const logs: string[] = [];
  const probe = new PenpotProbe(
    { url: new URL(server.url), headers: {} },
    500,
    (_, message) => logs.push(message)
  );
  cleanup.push(() => probe.close());
  return { probe, methods };
}

test("reuses the MCP session and performs plugin calls after initialization and overview", async () => {
  const fixture = mcpFixture();
  await fixture.probe.check(new AbortController().signal);
  await fixture.probe.check(new AbortController().signal);
  expect(fixture.methods).toEqual([
    "initialize",
    "notifications/initialized",
    "high_level_overview",
    "execute_code",
    "execute_code",
  ]);
});

test("accepts a plugin confirmation delivered over SSE", async () => {
  const fixture = mcpFixture({ sse: true });
  await fixture.probe.check(new AbortController().signal);
  expect(fixture.methods).toContain("execute_code");
});

test("a responding MCP server with a frozen plugin fails the health check", async () => {
  const fixture = mcpFixture({
    pluginError: "The Penpot plugin tab has been frozen by the browser",
  });
  await expect(
    fixture.probe.check(new AbortController().signal)
  ).rejects.toThrow("frozen");
});

test("a successful tool envelope without plugin confirmation fails the health check", async () => {
  const fixture = mcpFixture({ unexpected: true });
  await expect(
    fixture.probe.check(new AbortController().signal)
  ).rejects.toThrow("did not confirm");
});

test("a server that never returns headers is bounded by the request timeout", async () => {
  const fixture = mcpFixture({ hang: true });
  await expect(
    fixture.probe.check(new AbortController().signal)
  ).rejects.toBeInstanceOf(Error);
}, 2000);
