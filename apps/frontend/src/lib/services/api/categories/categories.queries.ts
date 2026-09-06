import { queryOptions, useMutation } from "@tanstack/react-query";
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from "./categories.api";

export const categoryQueryKeys = { all: ["categories"] as const };
export const categoriesQueryOptions = () =>
  queryOptions({
    queryKey: categoryQueryKeys.all,
    queryFn: getCategories,
    staleTime: 15_000,
  });

const invalidations = [categoryQueryKeys.all, ["tasks"] as const];

export function useCreateCategory() {
  return useMutation({
    mutationFn: createCategory,
    meta: { invalidateQueries: invalidations },
  });
}

export function useUpdateCategory() {
  return useMutation({
    mutationFn: updateCategory,
    meta: { invalidateQueries: invalidations },
  });
}

export function useDeleteCategory() {
  return useMutation({
    mutationFn: deleteCategory,
    meta: { invalidateQueries: invalidations },
  });
}
