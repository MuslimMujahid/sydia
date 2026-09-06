import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { conversationQueryKeys } from "../conversations/conversations.queries";
import {
  createContact,
  deleteContact,
  getContact,
  getContacts,
  updateContact,
  type Contact,
} from "./contacts.api";

export const contactQueryKeys = {
  all: ["contacts"] as const,
  lists: () => ["contacts", "list"] as const,
  list: (query: string) => ["contacts", "list", query] as const,
  details: () => ["contacts", "detail"] as const,
  detail: (contactId: string) => ["contacts", "detail", contactId] as const,
};

export const contactsQueryOptions = (query = "") =>
  queryOptions({
    queryKey: contactQueryKeys.list(query.trim()),
    queryFn: () => getContacts(query),
    staleTime: 15_000,
  });

export const contactQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: contactQueryKeys.detail(contactId),
    queryFn: () => getContact(contactId),
    enabled: Boolean(contactId),
    staleTime: 15_000,
  });

function cacheContact(queryClient: QueryClient, contact: Contact) {
  queryClient.setQueryData(contactQueryKeys.detail(contact.id), contact);
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onSuccess: (contact) => cacheContact(queryClient, contact),
    meta: {
      invalidateQueries: [contactQueryKeys.all, conversationQueryKeys.all],
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateContact,
    onSuccess: (contact) => cacheContact(queryClient, contact),
    meta: {
      invalidateQueries: [contactQueryKeys.all, conversationQueryKeys.all],
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteContact,
    onSuccess: (_, contactId) =>
      queryClient.removeQueries({ queryKey: contactQueryKeys.detail(contactId) }),
    meta: {
      invalidateQueries: [contactQueryKeys.all, conversationQueryKeys.all],
    },
  });
}
