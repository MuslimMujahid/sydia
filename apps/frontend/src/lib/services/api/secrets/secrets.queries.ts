import { queryOptions, useMutation } from "@tanstack/react-query";
import {
  createRevealLink,
  createSecret,
  deleteSecret,
  getSecrets,
  revealSecretInSession,
  unlockSecretVault,
} from "./secrets.api";

export const secretQueryKeys = {
  all: ["secrets"] as const,
  lists: () => ["secrets", "list"] as const,
  list: () => ["secrets", "list"] as const,
};

export const secretsQueryOptions = () =>
  queryOptions({
    queryKey: secretQueryKeys.list(),
    queryFn: () => getSecrets(),
    staleTime: 15_000,
  });

export function useCreateSecret() {
  return useMutation({
    mutationFn: createSecret,
    meta: { invalidateQueries: [secretQueryKeys.all] },
  });
}

export function useDeleteSecret() {
  return useMutation({
    mutationFn: deleteSecret,
    meta: { invalidateQueries: [secretQueryKeys.all] },
  });
}

export function useCreateRevealLink() {
  return useMutation({ mutationFn: createRevealLink });
}

export function useUnlockSecretVault() {
  return useMutation({ mutationFn: unlockSecretVault });
}

export function useRevealSecretInSession() {
  return useMutation({ mutationFn: revealSecretInSession });
}
