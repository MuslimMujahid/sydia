import axios from "axios";
import type { ApiErrorResponse } from "./api.types";

const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl)
  throw new Error(
    "VITE_API_URL is not set. Configure it using the root .env.example."
  );

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

export const api = axios.create({
  baseURL: apiUrl,
  withCredentials: true,
});

export function toApiError(
  error: unknown,
  fallbackMessage: string
): ApiClientError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
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
  return axios.isAxiosError(error)
    ? error.response?.status === 401
    : error instanceof ApiClientError && error.status === 401;
}
