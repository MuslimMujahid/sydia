import { api, toApiError } from "../api";
import axios from "axios";
import { ApiClientError } from "../api";

export function authError(error: unknown, fallback: string): ApiClientError {
  if (
    axios.isAxiosError<{
      code?: string;
      message?: string;
      retryAfter?: number;
      attemptsRemaining?: number;
    }>(error)
  ) {
    const payload = error.response?.data;
    const messages: Record<string, string> = {
      INVALID_OTP: "Kode belum cocok. Periksa kode atau minta kode baru.",
      OTP_EXPIRED: "Kode sudah kedaluwarsa. Minta kode baru untuk melanjutkan.",
      TOO_MANY_ATTEMPTS:
        "Batas percobaan tercapai. Minta kode baru untuk melanjutkan.",
      PROVIDER_NOT_FOUND:
        "Google belum tersedia. Silakan gunakan email dan kata sandi.",
      EMAIL_ALREADY_IN_USE: "Email sudah digunakan. Pilih alamat lain.",
    };

    console.warn("Authentication request failed", {
      status: error.response?.status,
      code: payload?.code,
    });

    return new ApiClientError(
      (payload?.code ? messages[payload.code] : undefined) ||
        payload?.message ||
        fallback,
      {
        status: error.response?.status,
        code: payload?.code,
        details: {
          retryAfter: payload?.retryAfter,
          attemptsRemaining: payload?.attemptsRemaining,
        },
      }
    );
  }

  console.warn("Authentication request failed before receiving a response");

  return toApiError(error, fallback);
}

export async function requestAuth<T>(
  path: string,
  values: unknown
): Promise<T> {
  try {
    return (await api.post<T>(`/api/auth/${path}`, values)).data;
  } catch (error) {
    throw authError(error, "Permintaan belum berhasil. Silakan coba lagi.");
  }
}

export type AuthMethods = {
  password: boolean;
  google: boolean;
  googleEmail: string | null;
  confirmed: boolean;
  confirmationMethod: "google" | "password" | null;
};

export async function getAuthMethods(cookie?: string): Promise<AuthMethods> {
  try {
    return (
      await api.get<AuthMethods>("/api/auth/registration/methods", {
        headers: cookie ? { cookie } : undefined,
      })
    ).data;
  } catch (error) {
    throw authError(
      error,
      "Metode masuk belum dapat dimuat. Silakan coba lagi."
    );
  }
}

export async function sendVerificationCode(email: string): Promise<void> {
  try {
    await api.post("/api/auth/email-otp/send-verification-otp", {
      email,
      type: "email-verification",
    });
  } catch (error) {
    throw authError(error, "Kode belum terkirim. Silakan coba lagi.");
  }
}

export async function verifyEmailCode(
  email: string,
  otp: string
): Promise<void> {
  try {
    await api.post("/api/auth/email-otp/verify-email", { email, otp });
  } catch (error) {
    throw authError(
      error,
      "Kode belum sesuai atau kedaluwarsa. Periksa kode atau minta kode baru."
    );
  }
}
