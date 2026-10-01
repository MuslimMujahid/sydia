/** Avoid sending secret-management dialogue, including raw values that do not
 * have recognizable token prefixes, to an additional classification provider. */
export function containsDecisionCredential(value: string): boolean {
  return [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:sk-|gh[pousr]_|github_pat_|xox[baprs]-)[a-z0-9_-]{16,}/i,
    /\beyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+/i,
    /\bBearer\s+[a-z0-9._~-]{16,}/i,
    /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passphrase|kata sandi|katasandi|secret(?: key)?|credential|private key|recovery code|kode pemulihan)\b/i,
  ].some((pattern) => pattern.test(value));
}
