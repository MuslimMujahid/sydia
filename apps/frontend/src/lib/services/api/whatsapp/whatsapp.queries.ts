import { queryOptions, useMutation } from "@tanstack/react-query";
import {
  createWhatsAppLinkCode,
  createWhatsAppQr,
  getWhatsAppStatus,
  unlinkWhatsApp,
  reconnectWhatsApp,
  replaceWhatsAppOwner,
} from "./whatsapp.api";

export const whatsappQueryKeys = {
  all: ["whatsapp"] as const,
  status: () => ["whatsapp", "status"] as const,
};
export const whatsappStatusQueryOptions = () =>
  queryOptions({
    queryKey: whatsappQueryKeys.status(),
    queryFn: getWhatsAppStatus,
    staleTime: 5_000,
    refetchInterval: (query) =>
      ["pairing", "owner_verification"].includes(
        query.state.data?.setupPhase ?? ""
      )
        ? 3_000
        : 15_000,
  });
const meta = { invalidateQueries: [whatsappQueryKeys.all] };

export function useCreateWhatsAppLinkCode() {
  return useMutation({ mutationFn: createWhatsAppLinkCode, meta });
}

export function useCreateWhatsAppQr() {
  return useMutation({ mutationFn: createWhatsAppQr, meta });
}

export function useUnlinkWhatsApp() {
  return useMutation({ mutationFn: unlinkWhatsApp, meta });
}

export function useReconnectWhatsApp() {
  return useMutation({ mutationFn: reconnectWhatsApp, meta });
}

export function useReplaceWhatsAppOwner() {
  return useMutation({ mutationFn: replaceWhatsAppOwner, meta });
}
