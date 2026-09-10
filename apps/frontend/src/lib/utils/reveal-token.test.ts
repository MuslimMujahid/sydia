import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRevealToken } from "./reveal-token";

describe("extractRevealToken", () => {
  it("reads a bare token fragment", () => {
    assert.equal(extractRevealToken("#abc123"), "abc123");
  });

  it("reads a keyed token fragment", () => {
    assert.equal(extractRevealToken("#token=abc123"), "abc123");
  });

  it("decodes an escaped bare token", () => {
    assert.equal(extractRevealToken("#a%2Fb%3Dc"), "a/b=c");
  });

  it("returns null when the fragment is empty", () => {
    assert.equal(extractRevealToken(""), null);
    assert.equal(extractRevealToken("#"), null);
  });

  it("returns null when the keyed token is empty or missing", () => {
    assert.equal(extractRevealToken("#token="), null);
    assert.equal(extractRevealToken("#other=abc123"), null);
  });
});
