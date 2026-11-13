import { api, toApiError } from "../api";
import type { ApiListResponse, ApiResponse } from "../api.types";
import type {
  ActivityFeature,
  AdminCostReport,
  AdminFeatureDetail,
  AdminOverview,
  AdminPeriod,
  AdminSummary,
  AdminUsageReport,
  AdminUserInsights,
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
    console.error("Admin overview request failed", error);
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
    console.error("Admin action failed", error);
    throw toApiError(error, "Aksi pengguna tidak dapat dijalankan.");
  }
}

async function getAnalytics<T>(
  path: string,
  period: AdminPeriod,
  fallback: string
): Promise<T> {
  try {
    return (await api.get<ApiResponse<T>>(path, { params: { period } })).data
      .data;
  } catch (error) {
    console.error(`Admin analytics request failed: ${path}`, error);
    throw toApiError(error, fallback);
  }
}

export function getAdminSummary(period: AdminPeriod): Promise<AdminSummary> {
  return getAnalytics(
    "/admin/summary",
    period,
    "Ringkasan tidak dapat dimuat."
  );
}

export function getAdminUsage(period: AdminPeriod): Promise<AdminUsageReport> {
  return getAnalytics(
    "/admin/usage",
    period,
    "Data penggunaan tidak dapat dimuat."
  );
}

export function getAdminFeatureDetail(
  period: AdminPeriod,
  feature: ActivityFeature
): Promise<AdminFeatureDetail> {
  return getAnalytics(
    `/admin/usage/features/${feature}`,
    period,
    "Rincian fitur tidak dapat dimuat."
  );
}

export function getAdminCosts(period: AdminPeriod): Promise<AdminCostReport> {
  return getAnalytics("/admin/costs", period, "Data biaya tidak dapat dimuat.");
}

export function getAdminUserInsights(
  period: AdminPeriod,
  userId: string
): Promise<AdminUserInsights> {
  return getAnalytics(
    `/admin/users/${encodeURIComponent(userId)}/insights`,
    period,
    "Rincian pengguna tidak dapat dimuat."
  );
}
