import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("background start, live status, duplicate rejection, stop, and saved status work together", async () => {
  const directory = await mkdtemp(join(tmpdir(), "penpot-watchdog-"));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method === "GET") return new Response(null, { status: 405 });
      const message = (await request.json()) as { id?: number; method: string };
      if (message.id === undefined) return new Response(null, { status: 202 });
      return Response.json({
        jsonrpc: "2.0",
        id: message.id,
        result:
          message.method === "initialize"
            ? {
                protocolVersion: "2025-03-26",
                capabilities: { tools: {} },
                serverInfo: { name: "fixture", version: "1" },
              }
            : {
                content: [
                  {
                    type: "text",
                    text: '{"watchdog":"penpot-watchdog","ok":true}',
                  },
                ],
              },
      });
    },
  });
  const config = join(directory, "config.toml");
  await Bun.write(config, `[mcp_servers.penpot]\nurl = "${server.url}"\n`);
  const stateDir = join(directory, "state");
  async function cli(command: string) {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "../scripts/cli.ts"),
        command,
        "--config",
        config,
        "--state-dir",
        stateDir,
        "--interval",
        "1",
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  async function waitForState(running: boolean, state: string) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await cli("status");
      const status = JSON.parse(result.stdout) as {
        running: boolean;
        state?: string;
        lastRun?: { state: string };
      };
      if (
        status.running === running &&
        (status.state === state || status.lastRun?.state === state)
      )
        return status;
    }
    throw new Error(
      `Worker did not reach ${state}; log: ${await Bun.file(join(stateDir, "watchdog.log")).text()}`
    );
  }
  try {
    expect(await cli("start")).toMatchObject({ code: 0, stderr: "" });
    expect(await waitForState(true, "healthy")).toMatchObject({
      state: "healthy",
    });
    expect(await cli("start")).toMatchObject({ code: 1 });
    expect(await cli("stop")).toMatchObject({
      code: 0,
      stdout: "Stop requested.\n",
    });
    expect(await waitForState(false, "stopped")).toMatchObject({
      running: false,
      lastRun: { state: "stopped" },
    });
  } finally {
    await cli("stop");
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
