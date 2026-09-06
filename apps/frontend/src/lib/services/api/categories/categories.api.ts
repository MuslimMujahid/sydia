import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type CategoryColor =
  "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "orange";
export type CategoryIconKey =
  | "briefcase"
  | "heart"
  | "wallet"
  | "book"
  | "health"
  | "family"
  | "shopping"
  | "star"
  | "home"
  | "travel";
export type Category = {
  id: string;
  name: string;
  color: CategoryColor;
  iconKey: CategoryIconKey;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
};
export type CategoryInput = Pick<Category, "name" | "color" | "iconKey">;

const getCategoriesServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Category[]>>("/categories", {
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Kategori tidak dapat dimuat.");
    }
  }
);

export async function getCategories(): Promise<Category[]> {
  if (typeof window === "undefined") return getCategoriesServer();

  try {
    const response = await api.get<ApiResponse<Category[]>>("/categories");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kategori tidak dapat dimuat.");
  }
}

export async function createCategory(values: CategoryInput): Promise<Category> {
  try {
    const response = await api.post<ApiResponse<Category>>(
      "/categories",
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kategori tidak dapat dibuat.");
  }
}

export async function updateCategory({
  categoryId,
  values,
}: {
  categoryId: string;
  values: Partial<CategoryInput>;
}): Promise<Category> {
  try {
    const response = await api.patch<ApiResponse<Category>>(
      `/categories/${encodeURIComponent(categoryId)}`,
      values
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kategori tidak dapat diperbarui.");
  }
}

export async function deleteCategory(categoryId: string): Promise<Category> {
  try {
    const response = await api.delete<ApiResponse<Category>>(
      `/categories/${encodeURIComponent(categoryId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Kategori tidak dapat dihapus.");
  }
}
