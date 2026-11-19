import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./env";

/**
 * Better Auth client for the native app. The Expo plugin keeps the session
 * cookie in SecureStore and attaches it to every auth request, since React
 * Native has no browser cookie jar.
 */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [
    expoClient({
      scheme: "sydia",
      storagePrefix: "sydia",
      storage: SecureStore,
    }),
  ],
});
