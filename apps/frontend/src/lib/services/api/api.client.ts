import axios from "axios";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "./api.types";

const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) throw new Error("VITE_API_URL is not set. Configure it using the root .env.example.");

export const api = axios.create({ baseURL: apiUrl, headers: { "Content-Type": "application/json" }, withCredentials: true });

function extractApiErrorMessage(error: AxiosError<ApiErrorResponse>): string | null {
  const responseMessage = error.response?.data?.error?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) return responseMessage;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  return null;
}

export function toApiError(error: unknown, fallbackMessage: string): Error {
  if (axios.isAxiosError<ApiErrorResponse>(error)) return new Error(extractApiErrorMessage(error) ?? fallbackMessage);
  if (error instanceof Error && error.message) return error;
  return new Error(fallbackMessage);
}

api.interceptors.response.use((response) => response, (error) => Promise.reject(error));
