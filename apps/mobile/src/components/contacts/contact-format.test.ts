import { describe, expect, test } from "bun:test";
import type { Contact } from "@/lib/services/api/contacts/contacts.api";
import {
  contactSections,
  contactSubtitle,
  dialableNumber,
  isValidEmail,
  parseAliases,
  sectionLetter,
  whatsappNumber,
} from "./contact-format";

function contact(name: string, extra: Partial<Contact> = {}): Contact {
  return {
    id: name,
    name,
    aliases: [],
    email: null,
    phone: null,
    notes: null,
    groups: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

describe("whatsappNumber", () => {
  test("turns a local Indonesian number into the international form", () => {
    expect(whatsappNumber("0812-3456-7890")).toBe("6281234567890");
  });

  test("keeps an international number's digits", () => {
    expect(whatsappNumber("+62 812 3456 7890")).toBe("6281234567890");
    expect(whatsappNumber("+1 (415) 555-0100")).toBe("14155550100");
  });

  test("rejects numbers too short to dial", () => {
    expect(whatsappNumber("12-34")).toBeNull();
  });
});

describe("dialableNumber", () => {
  test("strips formatting but keeps a leading plus", () => {
    expect(dialableNumber("+62 812-3456")).toBe("+628123456");
    expect(dialableNumber("(021) 555 0199")).toBe("0215550199");
  });
});

describe("parseAliases", () => {
  test("splits on commas, trims, and removes duplicates", () => {
    expect(parseAliases("Pak Budi, Budi kantor,  , Pak Budi")).toEqual([
      "Pak Budi",
      "Budi kantor",
    ]);
  });
});

describe("isValidEmail", () => {
  test("accepts a normal address and rejects partial ones", () => {
    expect(isValidEmail("rina@sekolah.sch.id")).toBe(true);
    expect(isValidEmail("rina@sekolah")).toBe(false);
  });
});

describe("contact sections", () => {
  test("groups names by first letter and puts symbols last", () => {
    const sections = contactSections([
      contact("budi"),
      contact("Ani"),
      contact("123 Laundry"),
      contact("Bu Rina"),
      contact("Élodie"),
    ]);

    expect(sections.map((section) => section.title)).toEqual([
      "A",
      "B",
      "E",
      "#",
    ]);
    expect(sections[1]!.data.map((item) => item.name)).toEqual([
      "Bu Rina",
      "budi",
    ]);
  });

  test("uses the base letter of accented names", () => {
    expect(sectionLetter("Élodie")).toBe("E");
    expect(sectionLetter("  ")).toBe("#");
  });
});

describe("contactSubtitle", () => {
  test("prefers the phone, then the email", () => {
    expect(contactSubtitle({ phone: "0812", email: "a@b.co" })).toBe("0812");
    expect(contactSubtitle({ phone: null, email: "a@b.co" })).toBe("a@b.co");
    expect(contactSubtitle({ phone: null, email: null })).toBe(
      "Belum ada detail kontak"
    );
  });
});
