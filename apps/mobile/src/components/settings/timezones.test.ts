import { describe, expect, test } from "bun:test";
import {
  listTimeZones,
  searchTimeZones,
  timeZoneCity,
  timeZoneTitle,
  usableDeviceTimeZone,
  utcOffsetLabel,
} from "./timezones";

describe("usableDeviceTimeZone", () => {
  test("keeps real IANA zones and UTC", () => {
    expect(usableDeviceTimeZone("Asia/Makassar")).toBe("Asia/Makassar");
    expect(usableDeviceTimeZone("UTC")).toBe("UTC");
  });

  test("ignores placeholders the API would reject", () => {
    expect(usableDeviceTimeZone("Etc/Unknown")).toBeNull();
    expect(usableDeviceTimeZone("GMT+7")).toBeNull();
    expect(usableDeviceTimeZone("")).toBeNull();
  });
});

describe("utcOffsetLabel", () => {
  const now = new Date("2026-11-19T05:00:00Z");

  test("formats whole, half-hour, negative, and zero offsets", () => {
    expect(utcOffsetLabel("Asia/Jakarta", now)).toBe("GMT+7");
    expect(utcOffsetLabel("Asia/Makassar", now)).toBe("GMT+8");
    expect(utcOffsetLabel("Asia/Kolkata", now)).toBe("GMT+5:30");
    expect(utcOffsetLabel("America/Sao_Paulo", now)).toBe("GMT−3");
    expect(utcOffsetLabel("UTC", now)).toBe("GMT");
  });
});

describe("zone labels", () => {
  test("names Indonesian zones by their everyday abbreviation", () => {
    expect(timeZoneTitle("Asia/Jakarta")).toBe("WIB · Jakarta");
    expect(timeZoneTitle("Asia/Jayapura")).toBe("WIT · Jayapura");
  });

  test("turns zone ids into readable city names", () => {
    expect(timeZoneCity("Asia/Kuala_Lumpur")).toBe("Kuala Lumpur");
    expect(timeZoneCity("America/Argentina/Buenos_Aires")).toBe(
      "Argentina / Buenos Aires"
    );
    expect(timeZoneTitle("UTC")).toBe("UTC");
  });
});

describe("searchTimeZones", () => {
  const zones = ["Asia/Jakarta", "Asia/Makassar", "Asia/Kuala_Lumpur", "UTC"];

  test("matches cities with spaces and Indonesian abbreviations", () => {
    expect(searchTimeZones(zones, "kuala lumpur")).toEqual([
      "Asia/Kuala_Lumpur",
    ]);
    expect(searchTimeZones(zones, "wita")).toEqual(["Asia/Makassar"]);
  });

  test("returns everything for an empty query", () => {
    expect(searchTimeZones(zones, "  ")).toEqual(zones);
  });
});

describe("listTimeZones", () => {
  test("is sorted and always offers UTC", () => {
    const zones = listTimeZones();
    expect(zones).toContain("UTC");
    expect(zones).toContain("Asia/Jakarta");
    expect([...zones].sort((a, b) => a.localeCompare(b))).toEqual(zones);
  });
});
