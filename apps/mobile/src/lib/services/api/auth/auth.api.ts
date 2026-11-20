import { isAxiosError } from "axios";
import { ApiClientError, api, toApiError } from "../api";

/** Maps Better Auth error codes to the web's Indonesian recovery copy. */
export function authError(error: unknown, fallback: string): ApiClientError {
  if (
    isAxiosError<{
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
      EMAIL_ALREADY_IN_USE: "Email sudah digunakan. Pilih alamat lain.",
    };

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

export type AuthMethods = {
  password: boolean;
  google: boolean;
  googleEmail: string | null;
};

export async function getAuthMethods(): Promise<AuthMethods> {
  try {
    return (await api.get<AuthMethods>("/api/auth/registration/methods")).data;
  } catch (error) {
    console.warn("Login methods could not be loaded", {
      isHttpError: isAxiosError(error),
    });
    throw authError(error, "Metode masuk tidak dapat dimuat.");
  }
}
