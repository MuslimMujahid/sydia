import { queryOptions, useMutation } from "@tanstack/react-query";
import {
  createContactGroup,
  deleteContactGroup,
  getContactGroups,
  updateContactGroup,
} from "./contact-groups.api";

export const contactGroupQueryKeys = { all: ["contact-groups"] as const };
export const contactGroupsQueryOptions = () =>
  queryOptions({
    queryKey: contactGroupQueryKeys.all,
    queryFn: getContactGroups,
    staleTime: 15_000,
  });

const invalidations = [contactGroupQueryKeys.all, ["contacts"] as const];

export function useCreateContactGroup() {
  return useMutation({
    mutationFn: createContactGroup,
    meta: { invalidateQueries: invalidations },
  });
}

export function useUpdateContactGroup() {
  return useMutation({
    mutationFn: updateContactGroup,
    meta: { invalidateQueries: invalidations },
  });
}

export function useDeleteContactGroup() {
  return useMutation({
    mutationFn: deleteContactGroup,
    meta: { invalidateQueries: invalidations },
  });
}
