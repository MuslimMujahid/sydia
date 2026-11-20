import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type BillingStatus = {
  enforced: boolean;
  active: boolean;
  state: "disabled" | "trial" | "paid" | "expired";
  trialEndsAt: string | null;
  paidUntil: string | null;
  lastActivatedAt: string | null;
  checkoutEnabled: boolean;
  environment: "sandbox" | "production";
  normalPrice: number;
  price: number;
  durationDays: number;
  trialDays: number;
  storage: { usedBytes: number; limitBytes: number; maxFileBytes: number };
};
export type BillingOrder = {
  id: string;
  amount: number;
  durationDays: number;
  status: "creating" | "pending" | "review" | "failed" | "expired" | "paid";
  paymentUrl: string | null;
  paymentMethod: string | null;
  expiresAt: string;
  appliedAt: string | null;
  createdAt: string;
};

export type BillingGift = {
  id: string;
  durationDays: number;
  paidUntil: string;
};

async function billingRequest<T>(
  request: Promise<{ data: ApiResponse<T> }>
): Promise<T> {
  try {
    return (await request).data.data;
  } catch (error) {
    console.error("Billing request failed");
    throw toApiError(error, "Status pembayaran belum dapat dimuat. Coba lagi.");
  }
}

export const billingKeys = {
  status: ["billing", "status"] as const,
  orders: ["billing", "orders"] as const,
  gifts: (userId: string) => ["billing", "gifts", userId] as const,
};

export const billingGiftsQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: billingKeys.gifts(userId),
    queryFn: () =>
      billingRequest(api.get<ApiResponse<BillingGift[]>>("/billing/gifts")),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export function useAcknowledgeBillingGifts(userId: string) {
  const queryClient = useQueryClient();
  const queryKey = billingKeys.gifts(userId);

  return useMutation({
    mutationFn: (giftIds: string[]) =>
      billingRequest(
        api.post<ApiResponse<{ success: true }>>("/billing/gifts/acknowledge", {
          giftIds,
        })
      ),
    onSuccess: async (_, giftIds) => {
      queryClient.setQueryData<BillingGift[]>(queryKey, (gifts) =>
        gifts?.filter(({ id }) => !giftIds.includes(id))
      );
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}

export const billingStatusQueryOptions = () =>
  queryOptions({
    queryKey: billingKeys.status,
    queryFn: () =>
      billingRequest(api.get<ApiResponse<BillingStatus>>("/billing/me")),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
export const billingOrdersQueryOptions = () =>
  queryOptions({
    queryKey: billingKeys.orders,
    queryFn: () =>
      billingRequest(api.get<ApiResponse<BillingOrder[]>>("/billing/orders")),
    refetchInterval: (query) =>
      query.state.data?.some(
        (order) => order.status === "creating" || order.status === "pending"
      )
        ? 15_000
        : false,
  });

export function createBillingCheckout(input: {
  mobile: string;
  idempotencyKey: string;
}) {
  return billingRequest(
    api.post<ApiResponse<BillingOrder>>("/billing/checkouts", input)
  );
}

export function refreshBillingOrder(id: string) {
  return billingRequest(
    api.post<ApiResponse<BillingOrder>>(
      `/billing/orders/${encodeURIComponent(id)}/refresh`
    )
  );
}
