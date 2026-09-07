import { queryOptions, useMutation } from "@tanstack/react-query";
import {
  createWhatsAppLinkCode,
  getWhatsAppStatus,
  pairWhatsAppCompanion,
  unlinkWhatsApp,
} from "./whatsapp.api";

export const whatsappQueryKeys = {
  all: ["whatsapp"] as const,
  status: () => ["whatsapp", "status"] as const,
};

export const whatsappStatusQueryOptions = (pollWhile?: boolean) =>
  queryOptions({
    queryKey: whatsappQueryKeys.status(),
    queryFn: getWhatsAppStatus,
    staleTime: 15_000,
    refetchInterval: pollWhile ? 3_000 : false,
  });

export function useCreateWhatsAppLinkCode() {
  return useMutation({ mutationFn: createWhatsAppLinkCode });
}

export function usePairWhatsAppCompanion() {
  return useMutation({ mutationFn: pairWhatsAppCompanion });
}

export function useUnlinkWhatsApp() {
  return useMutation({
    mutationFn: unlinkWhatsApp,
    meta: { invalidateQueries: [whatsappQueryKeys.all] },
  });
}
