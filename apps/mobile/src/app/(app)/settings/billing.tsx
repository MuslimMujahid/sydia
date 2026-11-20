import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import {
  BILLING_COPY,
  BILLING_PITCH,
  formatBillingCurrency,
  formatBillingDay,
  formatBillingDaysLeft,
  formatGigabytes,
  formatPaymentMethod,
  isBillingPhone,
} from "@/components/settings/billing-copy";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { Button } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { ErrorState, InlineError, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import {
  billingKeys,
  billingOrdersQueryOptions,
  billingStatusQueryOptions,
  createBillingCheckout,
  refreshBillingOrder,
} from "@/lib/services/api/billing/billing.api";

export default function BillingSettingsScreen() {
  const router = useRouter();
  const { locale, timezone } = useProfile();
  const copy = BILLING_COPY[locale];
  const toast = useToast();
  const queryClient = useQueryClient();
  const billing = useQuery(billingStatusQueryOptions());
  const orders = useQuery(billingOrdersQueryOptions());
  const [mobile, setMobile] = useState("");
  const [now] = useState(Date.now);
  const request = useRef<{ mobile: string; key: string } | null>(null);
  const refreshQueries = {
    invalidateQueries: [billingKeys.orders, billingKeys.status],
  };
  const checkout = useMutation({
    mutationFn: createBillingCheckout,
    meta: refreshQueries,
  });
  const refresh = useMutation({
    mutationFn: refreshBillingOrder,
    meta: refreshQueries,
  });

  async function openPayment(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
      await queryClient.invalidateQueries({ queryKey: billingKeys.orders });
    } catch (error) {
      console.warn("Billing payment page could not be opened", error);
      toast(
        locale === "en"
          ? "Could not open the payment page."
          : "Halaman pembayaran tidak dapat dibuka.",
        { tone: "error" }
      );
    }
  }

  function createOrder() {
    const number = mobile.trim();
    if (!isBillingPhone(number) || checkout.isPending) return;
    if (request.current?.mobile !== number)
      request.current = { mobile: number, key: Crypto.randomUUID() };
    checkout.mutate(
      { mobile: number, idempotencyKey: request.current.key },
      {
        onSuccess: (order) => {
          request.current = null;
          if (order.paymentUrl) void openPayment(order.paymentUrl);
        },
        onError: (error) =>
          console.warn("Billing invoice could not be created", error),
      }
    );
  }

  if (billing.isPending) return <LoadingState label={copy.loading} />;
  if (billing.isError)
    return (
      <ErrorState
        title={copy.title}
        message={billing.error.message}
        onRetry={() => void billing.refetch()}
      />
    );

  const status = billing.data;
  const pending = orders.data?.find(
    (order) =>
      order.status === "pending" ||
      order.status === "creating" ||
      order.status === "review"
  );
  const currentUntil =
    status.state === "trial" ? status.trialEndsAt : status.paidUntil;
  const left = currentUntil
    ? formatBillingDaysLeft(currentUntil, now, locale)
    : null;
  const title =
    status.state === "paid"
      ? copy.settings.paidTitle
      : status.state === "trial" && left
        ? copy.settings.trialTitle(left)
        : status.state === "expired"
          ? copy.settings.expiredTitle
          : BILLING_PITCH[locale].disabled.title;

  return (
    <SettingsScroll
      refreshing={billing.isRefetching || orders.isRefetching}
      onRefresh={() => {
        void billing.refetch();
        void orders.refetch();
      }}
    >
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {status.state === "paid" && left ? (
        <Text tone="muted">{copy.settings.remaining(left)}</Text>
      ) : null}
      {status.state === "expired" ? (
        <Text tone="muted">{copy.settings.expiredBody}</Text>
      ) : null}
      {status.enforced && status.state !== "paid" ? (
        status.checkoutEnabled ? (
          <>
            <Text variant="headline">
              {formatBillingCurrency(status.price, locale)} /{" "}
              {status.durationDays} {locale === "en" ? "days" : "hari"}
            </Text>
            {status.environment === "sandbox" ? (
              <Text tone="muted">{copy.sandbox}</Text>
            ) : null}
            {!orders.isPending && !orders.isError && !pending ? (
              <>
                <TextField
                  label={copy.phone}
                  hint={copy.phoneHelp}
                  value={mobile}
                  onChangeText={setMobile}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={24}
                />
                <Button
                  label={copy.create}
                  onPress={createOrder}
                  loading={checkout.isPending}
                  disabled={!isBillingPhone(mobile)}
                />
              </>
            ) : null}
            {pending?.status === "review" ? (
              <Text tone="muted">{copy.review}</Text>
            ) : null}
            {pending?.status === "pending" && pending.paymentUrl ? (
              <Button
                label={copy.pay}
                onPress={() => {
                  if (pending.paymentUrl) void openPayment(pending.paymentUrl);
                }}
              />
            ) : null}
            {pending?.status === "pending" || pending?.status === "creating" ? (
              <Button
                label={copy.check}
                variant="outline"
                loading={refresh.isPending}
                onPress={() =>
                  refresh.mutate(pending.id, {
                    onError: (error) =>
                      console.warn("Billing invoice refresh failed", error),
                  })
                }
              />
            ) : null}
          </>
        ) : (
          <Text tone="muted">{copy.unavailable}</Text>
        )
      ) : null}
      <InlineError
        message={checkout.error?.message ?? refresh.error?.message}
      />
      <ListSection title={copy.storage}>
        <ListRow
          title={copy.settings.manageStorage}
          subtitle={`${formatGigabytes(status.storage.usedBytes, locale)} / ${formatGigabytes(status.storage.limitBytes, locale)} GB`}
          onPress={() => router.push("/files")}
        />
      </ListSection>
      <ListSection title={copy.history}>
        {orders.isPending ? (
          <ListRow title={copy.loading} />
        ) : orders.isError ? (
          <ListRow
            title={copy.retry}
            subtitle={orders.error.message}
            onPress={() => void orders.refetch()}
          />
        ) : orders.data.length ? (
          orders.data.map((order) => (
            <ListRow
              key={order.id}
              title={formatBillingCurrency(order.amount, locale)}
              value={copy.order[order.status]}
              subtitle={`${formatBillingDay(order.createdAt, locale, timezone)} · ${formatPaymentMethod(order.paymentMethod, locale)}`}
            />
          ))
        ) : (
          <ListRow title={copy.settings.emptyHistory} titleLines={3} />
        )}
      </ListSection>
    </SettingsScroll>
  );
}
