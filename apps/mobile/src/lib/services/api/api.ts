import { create, isAxiosError } from "axios";
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/env";
import type { ApiErrorResponse } from "./api.types";

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = options?.status;
    this.code = options?.code;
    this.details = options?.details;
  }
}

/**
 * Axios client for the Sydia REST API. React Native has no cookie jar, so the
 * session cookie stored by the Better Auth Expo client is attached manually.
 */
export const api = create({ baseURL: API_URL, timeout: 30_000 });

api.interceptors.request.use(async (config) => {
  const cookie = await authClient.getCookie();
  if (cookie) config.headers.set("Cookie", cookie);

  return config;
});

let lastSessionCheck = 0;

/**
 * A 401 means the stored session died (expired or signed out elsewhere).
 * Signalling Better Auth refetches the session; when it is gone the root
 * layout's protected routes return the user to sign-in.
 */
export function recheckSession() {
  const now = Date.now();
  if (now - lastSessionCheck < 5_000) return;
  lastSessionCheck = now;
  authClient.$store.notify("$sessionSignal");
}

api.interceptors.response.use(undefined, (error: unknown) => {
  if (isAxiosError(error) && error.response?.status === 401) recheckSession();

  return Promise.reject(error);
});

/** Headers for requests made outside Axios (streaming fetch, downloads). */
export async function authHeaders(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();

  return cookie ? { Cookie: cookie } : {};
}

export function toApiError(
  error: unknown,
  fallbackMessage: string
): ApiClientError {
  if (isAxiosError<ApiErrorResponse>(error)) {
    const payload = error.response?.data?.error;

    return new ApiClientError(payload?.message?.trim() || fallbackMessage, {
      status: error.response?.status,
      code: payload?.code,
      details: payload?.details,
    });
  }

  if (error instanceof ApiClientError) return error;
  if (error instanceof Error && error.message)
    return new ApiClientError(error.message);

  return new ApiClientError(fallbackMessage);
}

export function isUnauthorizedError(error: unknown): boolean {
  return isAxiosError(error)
    ? error.response?.status === 401
    : error instanceof ApiClientError && error.status === 401;
}
