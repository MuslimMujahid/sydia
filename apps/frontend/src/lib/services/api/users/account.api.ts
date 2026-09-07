import { api, toApiError } from "../api";

export async function exportUserData(): Promise<Blob> {
  try {
    const response = await api.get<Blob>("/users/me/export", {
      responseType: "blob",
    });

    return response.data;
  } catch (error) {
    throw toApiError(error, "Data Anda tidak dapat diekspor.");
  }
}

export async function deleteCurrentAccount(): Promise<void> {
  try {
    await api.delete("/users/me");
  } catch (error) {
    throw toApiError(error, "Akun Anda tidak dapat dihapus.");
  }
}
