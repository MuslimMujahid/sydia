import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ConnectionConfig } from "./config";

export type FailureKind = "frozen" | "authentication" | "connection";

export function classifyFailure(message: string): FailureKind {
  if (/frozen|suspended|no heartbeat/i.test(message)) return "frozen";
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(message))
    return "authentication";
  return "connection";
}

function resultText(result: Record<string, unknown>): string {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .flatMap((item: unknown) => {
      if (
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      )
        return [item.text];
      return [];
    })
    .join("\n");
}

export class PenpotProbe {
  private client?: Client;
  private transport?: StreamableHTTPClientTransport;
  private ready = false;

  constructor(
    private readonly config: ConnectionConfig,
    private readonly timeoutMs: number,
    private readonly log: (level: "WARN", message: string) => void,
    private readonly sessionId?: string
  ) {}

  async check(signal: AbortSignal): Promise<void> {
    if (!this.ready) {
      await this.close();
      const client = new Client({ name: "penpot-watchdog", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(this.config.url, {
        requestInit: { headers: this.config.headers },
        fetch: async (input, init) => {
          // Bound waiting for headers without expiring an established SSE stream.
          const deadline = new AbortController();
          const timer = setTimeout(() => deadline.abort(), this.timeoutMs);
          try {
            return await fetch(input, {
              ...init,
              signal: AbortSignal.any([
                signal,
                deadline.signal,
                ...(init?.signal ? [init.signal] : []),
              ]),
            });
          } finally {
            clearTimeout(timer);
          }
        },
        reconnectionOptions: {
          maxRetries: 0,
          initialReconnectionDelay: 1000,
          maxReconnectionDelay: 1000,
          reconnectionDelayGrowFactor: 1,
        },
      });
      this.client = client;
      this.transport = transport;
      client.onerror = (error) => {
        // Closing a retired transport intentionally aborts its SSE stream.
        if (this.client !== client) return;
        this.log("WARN", `MCP transport: ${error.message}`);
        this.ready = false;
      };
      client.onclose = () => {
        this.ready = false;
      };
      await client.connect(transport, { timeout: this.timeoutMs, signal });
      const overview = await client.callTool(
        { name: "high_level_overview", arguments: {} },
        undefined,
        { timeout: this.timeoutMs, signal }
      );
      if (overview.isError)
        throw new Error(
          resultText(overview) || "Penpot overview request failed."
        );
      this.ready = true;
    }
    if (!this.client) throw new Error("MCP client was not initialized.");
    const result = await this.client.callTool(
      {
        name: "execute_code",
        arguments: {
          // A full round trip through plugin JavaScript, without touching the document or storage.
          code: 'return { watchdog: "penpot-watchdog", ok: true };',
          ...(this.sessionId ? { sessionId: this.sessionId } : {}),
        },
      },
      undefined,
      { timeout: this.timeoutMs, signal }
    );
    const text = resultText(result);
    if (result.isError)
      throw new Error(text || "Penpot tool returned an error without details.");
    // Some plugin failures arrive inside an otherwise successful tool response.
    if (
      !/"watchdog"\s*:\s*"penpot-watchdog"/.test(text) ||
      !/"ok"\s*:\s*true/.test(text)
    ) {
      throw new Error(`Penpot did not confirm the plugin round trip: ${text}`);
    }
  }

  async close(): Promise<void> {
    this.ready = false;
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    if (transport) await transport.close();
  }
}
