import { describe, expect, test } from "bun:test";
import {
  billingDiscountPercent,
  billingTermLeft,
  formatBillingDaysLeft,
  formatPaymentMethod,
  isBillingPhone,
} from "./billing-copy";

const now = Date.parse("2026-11-19T00:00:00Z");

describe("formatBillingDaysLeft", () => {
  test("rounds partial days up", () => {
    expect(formatBillingDaysLeft("2026-11-21T12:00:00Z", now, "id")).toBe(
      "3 hari"
    );
  });

  test("says less than a day for the final hours", () => {
    expect(formatBillingDaysLeft("2026-11-19T06:00:00Z", now, "id")).toBe(
      "kurang dari 1 hari"
    );
    expect(formatBillingDaysLeft("2026-11-19T06:00:00Z", now, "en")).toBe(
      "less than 1 day"
    );
  });

  test("uses the English singular for one day", () => {
    expect(formatBillingDaysLeft("2026-11-20T00:00:00Z", now, "en")).toBe(
      "1 day"
    );
  });
});

describe("billingTermLeft", () => {
  test("is the remaining share of the term, clamped to 0..1", () => {
    expect(billingTermLeft("2026-12-04T00:00:00Z", now, 30)).toBeCloseTo(0.5);
    expect(billingTermLeft("2026-11-01T00:00:00Z", now, 30)).toBe(0);
    expect(billingTermLeft("2027-06-01T00:00:00Z", now, 30)).toBe(1);
  });
});

describe("billingDiscountPercent", () => {
  test("floors the discount and ignores missing promotions", () => {
    expect(billingDiscountPercent(49_000, 99_000)).toBe(50);
    expect(billingDiscountPercent(99_000, 99_000)).toBe(0);
    expect(billingDiscountPercent(10, 0)).toBe(0);
  });
});

describe("formatPaymentMethod", () => {
  test("names the provider channels the way the web does", () => {
    expect(formatPaymentMethod("qris", "id")).toBe("QRIS");
    expect(formatPaymentMethod("ewallet/GOPAY", "id")).toBe("GoPay");
    expect(formatPaymentMethod("va/BCA", "id")).toBe("Transfer bank Bca");
    expect(formatPaymentMethod(null, "en")).toBe("Mayar");
  });
});

describe("isBillingPhone", () => {
  test("accepts international and local formats", () => {
    expect(isBillingPhone("+6281234567890")).toBe(true);
    expect(isBillingPhone("0812 3456 7890")).toBe(true);
  });

  test("rejects short or lettered input", () => {
    expect(isBillingPhone("0812")).toBe(false);
    expect(isBillingPhone("call me maybe")).toBe(false);
  });
});
