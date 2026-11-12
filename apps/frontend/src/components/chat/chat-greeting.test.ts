import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatGreeting, hourInZone } from "./chat-greeting";

describe("hourInZone", () => {
  it("reads the hour in the user's timezone, not UTC", () => {
    const now = new Date("2026-11-12T23:30:00.000Z");

    assert.equal(hourInZone(now, "Asia/Jakarta"), 6);
    assert.equal(hourInZone(now, "UTC"), 23);
  });

  it("reports midnight as hour 0", () => {
    const now = new Date("2026-11-12T17:05:00.000Z");

    assert.equal(hourInZone(now, "Asia/Jakarta"), 0);
  });
});

describe("chatGreeting", () => {
  const indonesian: Array<[number, string]> = [
    [3, "Selamat malam"],
    [4, "Selamat pagi"],
    [10, "Selamat pagi"],
    [11, "Selamat siang"],
    [15, "Selamat sore"],
    [18, "Selamat malam"],
  ];

  for (const [hour, expected] of indonesian)
    it(`greets in Indonesian at hour ${hour}`, () => {
      assert.equal(chatGreeting(hour, "id"), expected);
    });

  const english: Array<[number, string]> = [
    [3, "Good evening"],
    [4, "Good morning"],
    [12, "Good afternoon"],
    [18, "Good evening"],
  ];

  for (const [hour, expected] of english)
    it(`greets in English at hour ${hour}`, () => {
      assert.equal(chatGreeting(hour, "en"), expected);
    });

  it("addresses the user by first name", () => {
    assert.equal(
      chatGreeting(9, "id", "  Muslim Mujahid "),
      "Selamat pagi, Muslim"
    );
  });

  it("omits the name when it is blank", () => {
    assert.equal(chatGreeting(9, "id", "   "), "Selamat pagi");
  });
});
