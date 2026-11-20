import type { Contact } from "@/lib/services/api/contacts/contacts.api";

/**
 * WhatsApp's click-to-chat number: digits only, international form. Local
 * Indonesian numbers ("0812…") become "62812…". Returns null when the phone
 * has too few digits to be a real number.
 */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("0")) return `62${digits.replace(/^0+/, "")}`;

  return digits;
}

/** Dialable form for tel: and sms: links, keeping a leading +. */
export function dialableNumber(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");

  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Comma-separated aliases, trimmed and de-duplicated in input order. */
export function parseAliases(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean)
    ),
  ];
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type ContactSection = { title: string; data: Contact[] };

/** Section letter for a name: its first letter, or "#" for digits and symbols. */
export function sectionLetter(name: string): string {
  const first = name.trim().normalize("NFD").replace(/[̀-ͯ]/g, "")[0];

  return first && /[a-z]/i.test(first) ? first.toUpperCase() : "#";
}

/** Alphabetical address-book sections; "#" collects names without a letter. */
export function contactSections(contacts: Contact[]): ContactSection[] {
  const sorted = [...contacts].sort((left, right) =>
    left.name.localeCompare(right.name, "id", { sensitivity: "base" })
  );
  const sections = new Map<string, Contact[]>();

  for (const contact of sorted) {
    const letter = sectionLetter(contact.name);
    sections.set(letter, [...(sections.get(letter) ?? []), contact]);
  }

  return [...sections.entries()]
    .sort(([left], [right]) =>
      left === "#" ? 1 : right === "#" ? -1 : left.localeCompare(right)
    )
    .map(([title, data]) => ({ title, data }));
}

/** The row's second line: phone first, then email, then a placeholder. */
export function contactSubtitle(
  contact: Pick<Contact, "phone" | "email">
): string {
  return contact.phone || contact.email || "Belum ada detail kontak";
}
