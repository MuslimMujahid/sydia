import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";
import type {
  AdminOverview,
  AdminUser,
  AdminUserAction,
} from "@/components/admin/types";

export async function getAdminOverview(): Promise<AdminOverview> {
  try {
    const response =
      await api.get<ApiResponse<AdminOverview>>("/admin/overview");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Ringkasan pengguna tidak dapat dimuat.");
  }
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const response = await api.get<ApiResponse<AdminUser[]>>("/admin/users");

    return response.data.data;
  } catch (error) {
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
