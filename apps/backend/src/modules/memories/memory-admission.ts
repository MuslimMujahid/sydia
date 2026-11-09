import { createHash } from 'node:crypto';

/** Credential material must never enter a memory provider, even through an explicit save. */
const CREDENTIAL_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-|gh[pousr]_|github_pat_|xox[baprs]-)[a-z0-9_-]{16,}/i,
  /\beyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|kata sandi|katasandi|secret key)\s*(?:is|adalah|[:=])\s*\S+/i,
  /\bBearer\s+[a-z0-9._~-]{16,}/i,
];

/** A PIN or CVV stated next to its label, e.g. "PIN ATM aku 482913" or "cvv 123". */
const PIN_PATTERN = /\b(?:pin|cvv|cvc)\b[^\d\n]{0,24}\d{3,8}\b/i;

/**
 * A card or bank account number stated next to its label, e.g. "credit card
 * number: 4111 1111 1111 1111" or "no rek BCA 1234567890". At least eight digits,
 * so amounts ("debit 150000") and unlabelled digit runs (phone numbers, order
 * IDs) stay rememberable.
 */
const ACCOUNT_NUMBER_PATTERN =
  /\b(?:card|kartu|cc|credit|kredit|debit|visa|mastercard|amex|rekening|rek|account number|account no|iban)\b[^\d\n]{0,30}\d(?:[ -]?\d){7,18}\b/i;

export function containsMemoryCredential(value: string): boolean {
  return (
    CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value)) ||
    PIN_PATTERN.test(value) ||
    ACCOUNT_NUMBER_PATTERN.test(value)
  );
}

export function memoryChecksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
