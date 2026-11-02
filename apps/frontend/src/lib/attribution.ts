import {
  recordAttribution,
  type AttributionInput,
} from "@/lib/services/api/users/attribution.api";

/**
 * First-touch acquisition capture for the landing -> app handoff.
 *
 * The landing page (sydia.id) writes `sydia_vid` on the registrable domain and
 * appends `vid`, `utm_*`, and optionally `lp` to every signup link. This module
 * persists that data on the app origin until an authenticated request can store
 * it on the user record.
 */
const ATTRIBUTION_COOKIE = "sydia_attribution";
const ATTRIBUTED_COOKIE = "sydia_attributed";
const LANDING_VISITOR_COOKIE = "sydia_vid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const ATTRIBUTED_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9._~-]{8,64}$/;

const UTM_PARAMS = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmContent", "utm_content"],
  ["utmTerm", "utm_term"],
] as const;

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
  );

  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string, maxAge = MAX_AGE_SECONDS) {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function readAttribution(): AttributionInput | undefined {
  const raw = readCookie(ATTRIBUTION_COOKIE);
  if (!raw) return undefined;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;

    return sanitize(parsed as AttributionInput);
  } catch {
    return undefined;
  }
}

function sanitize(input: AttributionInput): AttributionInput {
  const result: AttributionInput = {};
  const visitorId = input.visitorId?.trim();

  if (visitorId && VISITOR_ID_PATTERN.test(visitorId))
    result.visitorId = visitorId;

  for (const field of [
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmContent",
    "utmTerm",
  ] as const) {
    const value = input[field]?.trim();

    if (value) result[field] = value.slice(0, 120);
  }

  const referrer = input.referrer?.trim();
  if (referrer) result.referrer = referrer.slice(0, 500);

  const landingPath = input.landingPath?.trim();
  if (landingPath) result.landingPath = landingPath.slice(0, 300);

  return result;
}

/** Runs on every app load; a first touch wins over later visits. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  // The landing cookie outlives the stored record; stop re-sending for it.
  if (readCookie(ATTRIBUTED_COOKIE)) return;

  const params = new URLSearchParams(window.location.search);
  const stored = readAttribution() ?? {};
  const next: AttributionInput = { ...stored };

  const visitingId = params.get("vid") ?? readCookie(LANDING_VISITOR_COOKIE);

  if (!next.visitorId && visitingId) {
    const candidate = sanitize({ visitorId: visitingId });

    if (candidate.visitorId) next.visitorId = candidate.visitorId;
  }

  for (const [field, param] of UTM_PARAMS) {
    const value = params.get(param)?.trim();
    if (!next[field] && value) next[field] = value.slice(0, 120);
  }

  const landingPath = params.get("lp")?.trim();
  if (!next.landingPath && landingPath)
    next.landingPath = landingPath.slice(0, 300);

  if (!next.referrer && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin)
        next.referrer = referrer.href;
    } catch {
      // Malformed referrers carry no signal.
    }
  }

  if (Object.keys(next).length === 0) return;

  writeCookie(ATTRIBUTION_COOKIE, JSON.stringify(next));
}

/**
 * Best-effort: analytics must never block or fail signup. The cookie is kept
 * on failure so the next authenticated visit retries.
 */
export async function sendAttribution(): Promise<boolean> {
  // Effects run child-first, so a direct app entry must capture before sending.
  captureAttribution();

  const attribution = readAttribution();
  if (!attribution) return false;

  try {
    await recordAttribution(attribution);
    clearCookie(ATTRIBUTION_COOKIE);
    writeCookie(ATTRIBUTED_COOKIE, "1", ATTRIBUTED_MAX_AGE_SECONDS);

    return true;
  } catch {
    return false;
  }
}
