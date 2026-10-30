import { api, toApiError } from "../api";
import type { ApiListResponse, ApiResponse } from "../api.types";
import type {
  AdminOverview,
  AdminUser,
  AdminUserAction,
  AdminUsersInput,
  AdminGiftPlusInput,
  AdminGiftPlusResult,
} from "@/components/admin/types";

export async function giftAdminUserPlus(
  userId: string,
  input: AdminGiftPlusInput
): Promise<AdminGiftPlusResult> {
  try {
    const response = await api.post<ApiResponse<AdminGiftPlusResult>>(
      `/admin/users/${encodeURIComponent(userId)}/gift-plus`,
      input
    );

    return response.data.data;
  } catch (error) {
    console.error("Admin Sydia Plus gift failed", error);
    throw toApiError(
      error,
      "Hadiah Sydia Plus belum dapat diberikan. Coba lagi."
    );
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  try {
    const response =
      await api.get<ApiResponse<AdminOverview>>("/admin/overview");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Ringkasan pengguna tidak dapat dimuat.");
  }
}

export async function getAdminUsers(
  input: AdminUsersInput
): Promise<ApiListResponse<AdminUser>> {
  try {
    const response = await api.get<ApiListResponse<AdminUser>>("/admin/users", {
      params: {
        ...input,
        q: input.q.trim(),
        status: input.status === "all" ? undefined : input.status,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Admin users request failed", error);
    throw toApiError(error, "Daftar pengguna tidak dapat dimuat.");
  }
}

export async function updateAdminUser(
  userId: string,
  action: AdminUserAction
): Promise<void> {
  try {
    await api.patch<ApiResponse<{ success: true }>>(`/admin/users/${userId}`, {
      action,
    });
  } catch (error) {
    throw toApiError(error, "Aksi pengguna tidak dapat dijalankan.");
  }
}
