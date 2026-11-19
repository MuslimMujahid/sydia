const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl)
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. Run `bun run setup-env` from the repository root, then set it in the root .env."
  );

/** Base URL of the Sydia backend, without a trailing slash. */
export const API_URL = apiUrl.replace(/\/+$/, "");
