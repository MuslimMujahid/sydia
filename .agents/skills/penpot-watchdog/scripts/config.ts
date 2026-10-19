import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Options = {
  command: string;
  configPath: string;
  server: string;
  intervalMs: number;
  timeoutMs: number;
  maxFailures: number;
  stateDir: string;
  sessionId?: string;
  cdpUrl?: string;
  pageUrl?: string;
};

export type ConnectionConfig = { url: URL; headers: Record<string, string> };

function positiveNumber(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

export function parseOptions(args: string[], env = process.env): Options {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: "string" },
      server: { type: "string", default: "penpot" },
      interval: { type: "string", default: "10" },
      timeout: { type: "string", default: "8" },
      "max-failures": { type: "string", default: "12" },
      "state-dir": { type: "string" },
      "session-id": { type: "string" },
      cdp: { type: "string" },
      "page-url": { type: "string" },
      help: { type: "boolean" },
    },
  });
  const command = values.help ? "help" : (positionals[0] ?? "help");
  if (
    positionals.length > 1 ||
    !["help", "run", "start", "stop", "status", "check", "_worker"].includes(
      command
    )
  ) {
    throw new Error("Use run, start, stop, status, or check. See --help.");
  }
  if (values.cdp && !values["page-url"])
    throw new Error("--cdp requires --page-url to identify the Penpot tab.");
  if (values["page-url"] && !values.cdp)
    throw new Error("--page-url requires --cdp.");
  const intervalMs = positiveNumber(values.interval, "--interval") * 1000;
  const timeoutMs = positiveNumber(values.timeout, "--timeout") * 1000;
  if (intervalMs >= 30_000)
    throw new Error(
      "--interval must be below Penpot’s 30-second stale threshold."
    );
  return {
    command,
    configPath: resolve(
      values.config ??
        env.PENPOT_WATCHDOG_CONFIG ??
        join(env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml")
    ),
    server: values.server,
    intervalMs,
    timeoutMs,
    maxFailures: positiveNumber(values["max-failures"], "--max-failures"),
    stateDir: resolve(
      values["state-dir"] ??
        join(
          env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
          "penpot-watchdog"
        )
    ),
    sessionId: values["session-id"],
    cdpUrl: values.cdp,
    pageUrl: values["page-url"],
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  const entries = Object.entries(record(value, label));
  if (entries.some(([, entry]) => typeof entry !== "string"))
    throw new Error(`${label} values must be strings.`);
  return Object.fromEntries(entries) as Record<string, string>;
}

export function connectionFromConfig(
  document: unknown,
  serverName: string,
  env = process.env
): ConnectionConfig {
  const servers = record(
    record(document, "configuration").mcp_servers,
    "mcp_servers"
  );
  const server = record(servers[serverName], `mcp_servers.${serverName}`);
  if (typeof server.url !== "string")
    throw new Error(
      `mcp_servers.${serverName}.url is required; only Streamable HTTP is supported.`
    );
  const headers =
    server.http_headers === undefined
      ? {}
      : stringRecord(server.http_headers, "http_headers");
  const envHeaders =
    server.env_http_headers === undefined
      ? {}
      : stringRecord(server.env_http_headers, "env_http_headers");
  for (const [header, variable] of Object.entries(envHeaders)) {
    if (!env[variable])
      throw new Error(
        `Required header environment variable ${variable} is missing.`
      );
    headers[header] = env[variable];
  }
  if (server.bearer_token_env_var !== undefined) {
    if (typeof server.bearer_token_env_var !== "string")
      throw new Error("bearer_token_env_var must be a string.");
    const token = env[server.bearer_token_env_var];
    if (!token)
      throw new Error(
        `Required bearer token environment variable ${server.bearer_token_env_var} is missing.`
      );
    headers.Authorization = `Bearer ${token}`;
  }
  let url: URL;
  try {
    url = new URL(server.url);
  } catch {
    throw new Error(
      `Configured mcp_servers.${serverName}.url is invalid; check the URL syntax.`
    );
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("MCP URL must use HTTP or HTTPS.");
  return { url, headers };
}

export async function loadConnection(
  options: Options
): Promise<ConnectionConfig> {
  const text = await Bun.file(options.configPath).text();
  let document: unknown;
  try {
    document = Bun.TOML.parse(text);
  } catch {
    throw new Error(
      `Cannot parse ${options.configPath}; check TOML syntax. Source text is hidden to protect credentials.`
    );
  }
  return connectionFromConfig(document, options.server);
}

export function makeRedactor(
  config: ConnectionConfig
): (value: unknown) => string {
  const headerSecrets = Object.values(config.headers).flatMap((value) => [
    value,
    ...(value.startsWith("Bearer ") ? [value.slice(7)] : []),
  ]);
  const secrets = [
    config.url.href,
    ...config.url.searchParams.values(),
    ...headerSecrets,
    config.url.password,
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return (value) => {
    let message = value instanceof Error ? value.message : String(value);
    for (const secret of secrets)
      message = message.split(secret).join("[redacted]");
    return message.replace(/([?&][^=\s&]+)=([^\s&"')]+)/g, "$1=[redacted]");
  };
}
