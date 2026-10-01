import { createHash } from 'node:crypto';

/** Credential material must never enter a memory provider, even through an explicit save. */
const CREDENTIAL_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-|gh[pousr]_|github_pat_|xox[baprs]-)[a-z0-9_-]{16,}/i,
  /\beyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|kata sandi|katasandi|secret key)\s*(?:is|adalah|[:=])\s*\S+/i,
  /\bBearer\s+[a-z0-9._~-]{16,}/i,
];

export function containsMemoryCredential(value: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value));
}

export function memoryChecksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
