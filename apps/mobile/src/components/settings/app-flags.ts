/**
 * Build-time settings for the settings screens. Expo inlines only
 * `EXPO_PUBLIC_*` variables, so these mirror the web's `VITE_*` flags.
 */

/** Mirrors the web's VITE_WHATSAPP_ENABLED: the WhatsApp channel is opt-in. */
export const WHATSAPP_INTEGRATION_ENABLED =
  process.env.EXPO_PUBLIC_WHATSAPP_ENABLED === "true";

const webUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/+$/, "");

/**
 * Optional public URL of the Sydia web app. Google's calendar consent must
 * finish in the browser that started it, so connecting happens on the web.
 */
export const WEB_APP_URL = webUrl ? webUrl : null;
