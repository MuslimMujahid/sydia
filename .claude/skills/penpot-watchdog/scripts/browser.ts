type Target = { url: string; webSocketDebuggerUrl: string };

export function selectTarget(value: unknown, pageUrl: string): Target {
  if (!Array.isArray(value))
    throw new Error("CDP /json/list did not return a target list.");
  const wanted = new URL(pageUrl);
  const matches = value.filter((entry: unknown): entry is Target => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("type" in entry) ||
      entry.type !== "page" ||
      !("url" in entry) ||
      typeof entry.url !== "string" ||
      !("webSocketDebuggerUrl" in entry) ||
      typeof entry.webSocketDebuggerUrl !== "string"
    )
      return false;
    const url = new URL(entry.url);
    return (
      url.origin === wanted.origin &&
      (wanted.pathname === "/" || url.pathname === wanted.pathname) &&
      (!wanted.search || url.search === wanted.search) &&
      (!wanted.hash || url.hash === wanted.hash)
    );
  });
  if (matches.length !== 1)
    throw new Error(
      `Expected one Penpot browser tab, found ${matches.length}; use a more specific --page-url.`
    );
  return matches[0]!;
}

export async function wakeTab(
  cdpUrl: string,
  pageUrl: string,
  timeoutMs: number,
  signal: AbortSignal
): Promise<void> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  const response = await fetch(new URL("/json/list", cdpUrl), {
    signal: deadline,
  });
  if (!response.ok)
    throw new Error(`CDP target discovery failed (HTTP ${response.status}).`);
  const target = selectTarget(await response.json(), pageUrl);
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      deadline.removeEventListener("abort", abort);
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const abort = () =>
      finish(new Error("CDP tab activation was cancelled or timed out."));
    deadline.addEventListener("abort", abort, { once: true });
    if (deadline.aborted) {
      abort();
      return;
    }
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Page.setWebLifecycleState",
          params: { state: "active" },
        })
      );
    socket.onmessage = (event) => {
      try {
        const message: unknown = JSON.parse(String(event.data));
        if (!message || typeof message !== "object")
          throw new Error("Invalid CDP response.");
        if ("error" in message)
          throw new Error(
            `CDP rejected tab activation: ${JSON.stringify(message.error)}`
          );
        if ("id" in message && message.id === 1)
          socket.send(JSON.stringify({ id: 2, method: "Page.bringToFront" }));
        if ("id" in message && message.id === 2) finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };
    socket.onerror = () =>
      finish(
        new Error("CDP WebSocket failed; check the browser debugging endpoint.")
      );
    socket.onclose = () =>
      finish(
        new Error("CDP connection closed before tab activation completed.")
      );
  });
}
