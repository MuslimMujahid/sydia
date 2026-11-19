import { create, isAxiosError } from "axios";
import { authClient } from "./auth-client";
import { API_URL } from "./env";

/** Error envelope returned by the Sydia backend (see apps/backend/src/shared/errors). */
type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

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
export const api = create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const cookie = await authClient.getCookie();
  if (cookie) config.headers.set("Cookie", cookie);
  return config;
});

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
