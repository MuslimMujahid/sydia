import { expect, test } from "bun:test";
import {
  connectionFromConfig,
  makeRedactor,
  parseOptions,
} from "../scripts/config";
import { selectTarget } from "../scripts/browser";

test("reads the configured URL and resolves environment-based authorization", () => {
  const connection = connectionFromConfig(
    {
      mcp_servers: {
        penpot: {
          url: "https://penpot.example/mcp/stream?userToken=secret",
          http_headers: { "X-Client": "watchdog" },
          env_http_headers: { "X-Key": "KEY" },
          bearer_token_env_var: "TOKEN",
        },
      },
    },
    "penpot",
    { KEY: "header-key", TOKEN: "bearer-token" }
  );
  expect(connection.headers).toEqual({
    "X-Client": "watchdog",
    "X-Key": "header-key",
    Authorization: "Bearer bearer-token",
  });
});

test("missing credential environment variable fails instead of connecting anonymously", () => {
  expect(() =>
    connectionFromConfig(
      {
        mcp_servers: {
          penpot: {
            url: "https://penpot.example/mcp",
            bearer_token_env_var: "TOKEN",
          },
        },
      },
      "penpot",
      {}
    )
  ).toThrow("TOKEN is missing");
});

test("redacts both query tokens and authorization headers from transport errors", () => {
  const redact = makeRedactor({
    url: new URL("https://penpot.example/mcp?userToken=private-token"),
    headers: { Authorization: "Bearer header-secret" },
  });
  expect(
    redact(
      new Error(
        "Failed https://penpot.example/mcp?userToken=private-token Bearer header-secret private-token"
      )
    )
  ).toBe("Failed [redacted] [redacted] [redacted]");
});

test("rejects intervals at the plugin stale threshold", () => {
  expect(() => parseOptions(["run", "--interval", "30"])).toThrow("below");
});

test("browser recovery requires a specific site", () => {
  expect(() => parseOptions(["run", "--cdp", "http://localhost:9222"])).toThrow(
    "--page-url"
  );
});

test("tab selection does not match a host with a Penpot-looking prefix", () => {
  expect(
    selectTarget(
      [
        {
          type: "page",
          url: "https://penpot.example.evil.test/",
          webSocketDebuggerUrl: "ws://wrong",
        },
        {
          type: "page",
          url: "https://penpot.example/#/workspace",
          webSocketDebuggerUrl: "ws://correct",
        },
      ],
      "https://penpot.example/"
    ).webSocketDebuggerUrl
  ).toBe("ws://correct");
});

test("ambiguous tabs fail rather than activating the wrong document", () => {
  expect(() =>
    selectTarget(
      [
        {
          type: "page",
          url: "https://penpot.example/#/one",
          webSocketDebuggerUrl: "ws://one",
        },
        {
          type: "page",
          url: "https://penpot.example/#/two",
          webSocketDebuggerUrl: "ws://two",
        },
      ],
      "https://penpot.example/"
    )
  ).toThrow("found 2");
});
