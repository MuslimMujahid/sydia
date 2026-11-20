import { queryOptions, useMutation } from "@tanstack/react-query";
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

export async function getCategories(): Promise<Category[]> {
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

export const categoryQueryKeys = {
  all: ["categories"] as const,
  list: () => ["categories", "list"] as const,
};

export const categoriesQueryOptions = () =>
  queryOptions({
    queryKey: categoryQueryKeys.list(),
    queryFn: getCategories,
    staleTime: 30_000,
  });

// Category changes also rename or recolor the chips on cached tasks.
const invalidated = [
  categoryQueryKeys.all,
  ["tasks"] as const,
  ["today"] as const,
];

export function useCreateCategory() {
  return useMutation({
    mutationFn: createCategory,
    meta: { invalidateQueries: invalidated },
  });
}

export function useUpdateCategory() {
  return useMutation({
    mutationFn: updateCategory,
    meta: { invalidateQueries: invalidated },
  });
}

export function useDeleteCategory() {
  return useMutation({
    mutationFn: deleteCategory,
    meta: { invalidateQueries: invalidated },
  });
}
