import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authQueryKeys } from "../auth/auth.queries";
import { conversationQueryKeys } from "../conversations/conversations.queries";
import { deleteCurrentAccount } from "./account.api";
import { userQueryKeys } from "./users.queries";

export function useDeleteCurrentAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCurrentAccount,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: authQueryKeys.all });
      queryClient.removeQueries({ queryKey: userQueryKeys.all });
      queryClient.removeQueries({ queryKey: conversationQueryKeys.all });
    },
  });
}
