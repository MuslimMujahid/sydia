import { api, toApiError } from "../api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: string;
  token?: string;
  createdAt?: string;
  updatedAt?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SessionResponse = {
  user: AuthUser;
  session: AuthSession;
};

export type SignUpVariables = { name: string; email: string; password: string };
export type SignInVariables = { email: string; password: string };
export type AuthResponse = {
  user: AuthUser;
  session?: AuthSession;
  token?: string | null;
};

export async function signUpWithEmail(
  values: SignUpVariables
): Promise<AuthResponse> {
  try {
    const response = await api.post<AuthResponse>(
      "/api/auth/sign-up/email",
      values
    );

    return response.data;
  } catch (error) {
    throw toApiError(
      error,
      "Akun Anda tidak dapat dibuat. Periksa data Anda, lalu coba lagi."
    );
  }
}

export async function signInWithEmail(
  values: SignInVariables
): Promise<AuthResponse> {
  try {
    const response = await api.post<AuthResponse>(
      "/api/auth/sign-in/email",
      values
    );

    return response.data;
  } catch (error) {
    throw toApiError(
      error,
      "Anda tidak dapat masuk. Periksa email dan kata sandi Anda."
    );
  }
}

export async function signOut(): Promise<void> {
  try {
    await api.post("/api/auth/sign-out");
  } catch (error) {
    throw toApiError(error, "Anda tidak dapat keluar. Silakan coba lagi.");
  }
}
