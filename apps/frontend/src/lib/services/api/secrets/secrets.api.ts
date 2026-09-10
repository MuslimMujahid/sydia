import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

/**
 * Metadata for a stored secret. The value itself is never returned by the
 * list or detail endpoints; it only leaves the backend through a one-time
 * reveal link consumed on the public `/secret-reveal` route.
 */
export type SecretMetadata = {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastRevealedAt: string | null;
  revealCount: number;
};

export type CreateSecretInput = {
  label: string;
  value: string;
};

export type RevealLink = {
  url: string;
  expiresAt: string;
};

export type RevealedSecret = {
  label: string;
  value: string;
  expiresAt: string;
};

const getSecretsServer = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cookie = getRequestHeader("cookie");
    const response = await api.get<ApiResponse<SecretMetadata[]>>("/secrets", {
      headers: cookie ? { cookie } : undefined,
    });

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar rahasia tidak dapat dimuat.");
  }
});

export async function getSecrets(): Promise<SecretMetadata[]> {
  if (typeof window === "undefined") return getSecretsServer();

  try {
    const response = await api.get<ApiResponse<SecretMetadata[]>>("/secrets");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar rahasia tidak dapat dimuat.");
  }
}

export async function createSecret(
  values: CreateSecretInput
): Promise<SecretMetadata> {
  try {
    const response = await api.post<ApiResponse<SecretMetadata>>(
      "/secrets",
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Rahasia tidak dapat disimpan.");
  }
}

export async function deleteSecret(secretId: string): Promise<void> {
  try {
    await api.delete(`/secrets/${encodeURIComponent(secretId)}`);
  } catch (error) {
    throw toApiError(error, "Rahasia tidak dapat dihapus.");
  }
}

export async function createRevealLink(secretId: string): Promise<RevealLink> {
  try {
    const response = await api.post<ApiResponse<RevealLink>>(
      `/secrets/${encodeURIComponent(secretId)}/reveal-links`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Tautan ungkap tidak dapat dibuat.");
  }
}

export async function unlockSecretVault(password: string): Promise<string> {
  try {
    const response = await api.post<ApiResponse<{ expiresAt: string }>>(
      "/secrets/unlock",
      { password }
    );

    return response.data.data.expiresAt;
  } catch (error) {
    throw toApiError(error, "Kata sandi tidak dapat dikonfirmasi.");
  }
}

export async function revealSecretInSession(
  secretId: string
): Promise<RevealedSecret> {
  try {
    const response = await api.post<ApiResponse<RevealedSecret>>(
      `/secrets/${encodeURIComponent(secretId)}/reveal`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Rahasia tidak dapat ditampilkan.");
  }
}

/**
 * Consumes a one-time reveal token. This is the only request that returns a
 * secret value; callers must keep the result in component-local state and
 * never place it in the query cache.
 */
export async function consumeSecretReveal(
  token: string
): Promise<RevealedSecret> {
  try {
    const response = await api.post<ApiResponse<RevealedSecret>>(
      "/secret-reveals/consume",
      { token }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(
      error,
      "Tautan ini tidak dapat dibuka. Mungkin sudah kedaluwarsa atau sudah digunakan."
    );
  }
}
