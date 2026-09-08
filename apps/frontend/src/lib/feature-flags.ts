/**
 * Browser-exposed feature flags, inlined at build time from public
 * `VITE_*` environment variables. Never read `BACKEND_*` values here.
 */
export const WHATSAPP_INTEGRATION_ENABLED =
  import.meta.env.VITE_WHATSAPP_ENABLED === "true";
