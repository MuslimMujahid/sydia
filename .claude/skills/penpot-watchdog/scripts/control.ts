import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type { Health } from "./watchdog";

export type Snapshot = Health & { pid: number; updatedAt: string };

function isAbsent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "ECONNREFUSED"].includes(String(error.code))
  );
}

export async function controlRequest(
  stateDir: string,
  command: "status" | "stop"
): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(stateDir, "control.sock"));
    let body = "";
    socket.setTimeout(2000, () =>
      socket.destroy(new Error("Watchdog control socket timed out."))
    );
    socket.on("connect", () => socket.write(`${command}\n`));
    socket.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    socket.on("error", (error) => {
      // Explicit typed "not running" outcome; callers must display it or handle stale state.
      if (isAbsent(error)) resolve(undefined);
      else reject(error);
    });
    socket.on("end", () => {
      try {
        const snapshot: unknown = JSON.parse(body);
        if (
          !snapshot ||
          typeof snapshot !== "object" ||
          !("state" in snapshot) ||
          !("pid" in snapshot)
        ) {
          throw new Error("Invalid watchdog control response.");
        }
        resolve(snapshot as Snapshot);
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function openControl(
  stateDir: string,
  getSnapshot: () => Snapshot,
  stop: () => void
) {
  const path = join(stateDir, "control.sock");
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.setTimeout(2000, () => socket.destroy());
    let input = "";
    socket.on("error", (error) =>
      console.error(`WARN: local control client: ${error.message}`)
    );
    socket.on("data", (chunk: Buffer) => {
      input += chunk.toString();
      if (input.length > 128) {
        socket.destroy();
        return;
      }
      if (!input.includes("\n")) return;
      const command = input.trim();
      socket.end(JSON.stringify(getSnapshot()) + "\n");
      if (command === "stop") stop();
    });
  });
  const listen = () =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  try {
    await listen();
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ))
      throw error;
    if (await controlRequest(stateDir, "status"))
      throw new Error("A watchdog is already running in this state directory.");
    console.warn("WARN: removing a stale watchdog control socket.");
    await unlink(path);
    await listen();
  }
  return async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  };
}
