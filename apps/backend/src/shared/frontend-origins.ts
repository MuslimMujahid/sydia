export const PRODUCTION_FRONTEND_ORIGIN = 'https://sydia.muslimmujahid.com';

export function getFrontendOrigins(frontendUrl: string): string[] {
  return [...new Set([frontendUrl, PRODUCTION_FRONTEND_ORIGIN])];
}
