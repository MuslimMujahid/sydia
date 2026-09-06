import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { conversationQueryKeys } from "../conversations/conversations.queries";
import {
  deleteDocument,
  getDocument,
  getDocuments,
  uploadDocument,
  type Document,
} from "./documents.api";

export const documentQueryKeys = {
  all: ["documents"] as const,
  lists: () => ["documents", "list"] as const,
  list: () => ["documents", "list"] as const,
  details: () => ["documents", "detail"] as const,
  detail: (documentId: string) => ["documents", "detail", documentId] as const,
};

export const documentsQueryOptions = () =>
  queryOptions({
    queryKey: documentQueryKeys.list(),
    queryFn: getDocuments,
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.some((document) => document.status === "processing")
        ? 3_000
        : false,
  });

export const documentQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: documentQueryKeys.detail(documentId),
    queryFn: () => getDocument(documentId),
    enabled: Boolean(documentId),
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 3_000 : false,
  });


function cacheDocument(queryClient: QueryClient, document: Document) {
  queryClient.setQueryData(documentQueryKeys.detail(document.id), document);
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadDocument,
    onSuccess: (document) => cacheDocument(queryClient, document),
    meta: {
      invalidateQueries: [
        documentQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: (_, documentId) => {
      queryClient.removeQueries({
        queryKey: documentQueryKeys.detail(documentId),
      });
    },
    meta: {
      invalidateQueries: [
        documentQueryKeys.all,
        conversationQueryKeys.all,
      ],
    },
  });
}
