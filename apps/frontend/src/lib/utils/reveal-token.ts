/**
 * Extracts the one-time reveal token from a URL fragment.
 *
 * Accepts both the bare form (`#<token>`) and the keyed form
 * (`#token=<token>`). Returns `null` when no usable token is present.
 */
export function extractRevealToken(hash: string): string | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!fragment) return null;

  const candidate = fragment.includes("=")
    ? (new URLSearchParams(fragment).get("token") ?? "")
    : fragment;

  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    return decodeURIComponent(trimmed) || null;
  } catch {
    return trimmed;
  }
}
