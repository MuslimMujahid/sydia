const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl)
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env."
  );

/** Base URL of the Sydia backend, without a trailing slash. */
export const API_URL = apiUrl.replace(/\/+$/, "");
