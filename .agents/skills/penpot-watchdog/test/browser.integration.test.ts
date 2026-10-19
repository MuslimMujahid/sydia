import { expect, test } from "bun:test";
import { wakeTab } from "../scripts/browser";

test("frozen-tab recovery activates the lifecycle and brings the page forward without reloading", async () => {
  const methods: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request, server) {
      if (new URL(request.url).pathname === "/devtools/page/penpot") {
        if (server.upgrade(request)) return;
        return new Response(null, { status: 400 });
      }
      return Response.json([
        {
          type: "page",
          url: "https://penpot.example/#/workspace",
          webSocketDebuggerUrl: `ws://127.0.0.1:${server.port}/devtools/page/penpot`,
        },
      ]);
    },
    websocket: {
      message(socket, data) {
        const message = JSON.parse(String(data)) as {
          id: number;
          method: string;
        };
        methods.push(message.method);
        socket.send(JSON.stringify({ id: message.id, result: {} }));
      },
    },
  });
  try {
    await wakeTab(
      String(server.url),
      "https://penpot.example/",
      1000,
      new AbortController().signal
    );
    expect(methods).toEqual(["Page.setWebLifecycleState", "Page.bringToFront"]);
  } finally {
    server.stop(true);
  }
});
