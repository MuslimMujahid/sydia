/** Deep-link scheme of the Sydia mobile app (`scheme` in apps/mobile/app.json). */
export const MOBILE_APP_SCHEME = 'sydia';

/**
 * Origins the Sydia mobile app sends to Better Auth through the Expo plugin.
 *
 * The app's own scheme is always trusted. Expo Go and development builds use
 * `exp://` origins with arbitrary LAN hosts, so those are trusted only in
 * development.
 */
export function getMobileOrigins(nodeEnv: string | undefined): string[] {
  const appOrigins = [`${MOBILE_APP_SCHEME}://`, `${MOBILE_APP_SCHEME}://*`];

  return nodeEnv === 'development'
    ? [...appOrigins, 'exp://', 'exp://**']
    : appOrigins;
}
