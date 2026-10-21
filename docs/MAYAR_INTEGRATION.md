# Sydia — Mayar Integration Research

| Field  | Value                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date   | 21 October 2026                                                                                                                                                 |
| Scope  | Mayar as a payment provider for Sydia subscriptions: API, webhooks, fees, account verification, and auto-debit alternatives                                     |
| Status | API key, payment link, webhook registration, webhook authentication, and one QRIS payment verified in sandbox. Membership, renewal, and production not verified |

Read this before writing billing code. It records what was tested, what came from documentation, and what is still open.

Evidence labels used below:

- **[sandbox]** tested against the Mayar sandbox API with a real key.
- **[docs]** read from docs.mayar.id or mayar.id pages through a summarizer. Not checked byte-for-byte.
- **[web]** from search snippets or third-party pages. Treat as unverified.
- **[open]** not established by any source.

## 1. Summary

- Mayar memberships create one invoice per billing term. The customer pays that invoice through a link. Nothing in the docs describes automatic charging of a saved card or e-wallet **[open]**.
- Automatic monthly charging needs a tokenization provider. Candidates are Midtrans Subscription API and Xendit Subscriptions. Neither is integrated.
- Mayar's platform fee on memberships is 4% on Starter and 3% on Business, on top of channel fees. For subscriptions it is the most expensive option compared in this research.
- Billing is not built. BE-0903 (billing integration boundary) in `docs/Sydia_Implementation_Roadmap.md` is unchecked. No billing module exists under `apps/backend`.

## 2. Environments and authentication

| Environment | Dashboard            | API base                   |
| ----------- | -------------------- | -------------------------- |
| Production  | https://web.mayar.id | https://api.mayar.id/hl/v2 |
| Sandbox     | https://web.mayar.io | https://api.mayar.io/hl/v2 |

- Header: `Authorization: Bearer <API key>` **[sandbox]**.
- Keys are created at `/api-keys` on the dashboard for each environment **[docs]**.
- Key types: **Read Only** allows GET. **Read & Write** allows GET and POST **[docs]**. Sydia needs Read & Write for invoices, payment links, and webhook registration.
- Rate limit: 50 requests per minute per API key. Exceeding it returns 429 with `Retry-After` **[docs]**.
- V1 API (`/hl/v1`): documentation says it is deprecated from 1 October 2026. Use V2 **[docs]**.
- Changing the merchant domain or subdomain requires a new key **[docs]**.
- Mode identification: payment link URLs use the merchant's shop domain in both modes **[sandbox]**. Do not identify the mode from the link domain. Confirm the dashboard origin (`web.mayar.io` or `web.mayar.id`) before anyone pays a link.
- Secrets: `MAYAR_API_KEY` and `MAYAR_WEBHOOK_TOKEN` are in the root `.env`, which is git-ignored. They are not yet listed in `.env.example`. Never print them. Read them from the file in shell without echoing.

## 3. Endpoints

### Verified in sandbox **[sandbox]**

| Method | Path                            | Notes                                                                                                                                                                                                                      |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/transactions`                 | Query: `status`, `customerId`, `type`, `paymentLinkId`, `startAt`, `endAt`, `fields`, `limit` (max 50), `startingAfter`. Returns balance-history rows, not every payment. Paginate with `hasMore` and `nextStartingAfter`. |
| POST   | `/products/payment-link/create` | Body: `name` (required), `amount`, `description`, `expiredAt` (ISO 8601), `redirectUrl`, `notes`, `tax`, `limit`. Response: `data.id`, `data.link`. New links default to Published.                                        |
| POST   | `/webhooks/update`              | Body: `urlHook` (required), `webhookConfig` (optional). Replaces the registered URL. No delete endpoint was found.                                                                                                         |
| POST   | `/webhooks/test`                | Body: `urlHook`. Sends a test event with top-level `event` set to `testing`.                                                                                                                                               |

### Documented, not tested **[docs]**

| Method | Path                                                         | Notes                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/invoices/create`                                           | Body: `name`, `email`, `mobile`, `items` (each with `quantity`, `rate`, `description`) required. Also `description`, `expiredAt`, `tax`, `paymentMethod`, `extraData`. No `amount` field: the total comes from items. Response: `data.id`, `data.link`. |
| POST   | `/memberships/members/{memberId}/invoice/create`             | Body or query: `productId`. Returns the invoice for the member's current billing term. Repeat calls in the same term return the same unpaid invoice. Response includes `data.membershipBillUrl` and `expiredAt`.                                        |
| POST   | `/webhooks/retry`                                            | Body: `webhookHistoryId`. Retries a logged delivery.                                                                                                                                                                                                    |
| GET    | `/webhooks/new-history`                                      | Delivery history. Fields include `status` (e.g. `SUCCESS`), `source` (e.g. `AUTOMATIC`), `nextDelivery`, `responsePayload`. Cursor pagination with `limit` (max 50) and `startingAfter`.                                                                |
| GET    | transaction detail                                           | See `docs.mayar.id/api-reference-v2/transaction/detail.md`. Intended for server-side status checks.                                                                                                                                                     |
| —      | membership: tiers, members, register, update, cancel         | See `docs.mayar.id/api-reference-v2/membership/*`.                                                                                                                                                                                                      |
| —      | credit-based membership: balance, spend, add-credit, history | See `docs.mayar.id/api-reference-v2/credit/*`. Usage-based membership.                                                                                                                                                                                  |

## 4. Webhooks

### Registration and authentication

- Register with `POST /webhooks/update` and `urlHook` **[sandbox]**.
- Mayar sends `POST` with `Content-Type: application/json` **[sandbox]**.
- Authentication header: **`X-Callback-Token`**. Its value equals the Webhook token shown in the dashboard, which is `MAYAR_WEBHOOK_TOKEN` **[sandbox]**. The header name is not in the documentation. It came from testing.
- Verification: compare the header with `MAYAR_WEBHOOK_TOKEN` using a constant-time comparison (for example `hmac.compare_digest` in Python). Verified for both the test event and a real payment **[sandbox]**.
- The token is a static shared secret sent as-is. It is not a signature over the body, so it gives no replay protection. Require HTTPS and keep the token out of logs.
- Retry behavior after a failed delivery: not documented beyond the retry endpoint and delivery status fields **[open]**.
- Response code Mayar expects from the receiver: **[open]**. The test receiver returned 200 with a JSON body.

### Payload observed for `payment.received` **[sandbox]**

Shape with values replaced by placeholders. No customer values are recorded here.

```json
{
  "event": "payment.received",
  "data": {
    "id": "<string>",
    "transactionId": "<string>",
    "status": "SUCCESS",
    "transactionStatus": "created",
    "createdAt": "<ISO 8601 string>",
    "updatedAt": "<ISO 8601 string>",
    "merchantId": "<string>",
    "merchantName": "<string>",
    "merchantEmail": "<string>",
    "customerId": "<string>",
    "customerName": "<string>",
    "customerEmail": "<string>",
    "customerMobile": "<string>",
    "amount": 10000,
    "paymentLinkAmount": 10000,
    "nettAmount": 10000,
    "qty": 1,
    "isAdminFeeBorneByCustomer": false,
    "isChannelFeeBorneByCustomer": false,
    "productId": "<string>",
    "productName": "<string>",
    "productDescription": "<string>",
    "productType": "generic_link",
    "paymentMethod": "QRIS",
    "couponUsed": null,
    "pixelFbp": null,
    "pixelFbc": null
  }
}
```

Points to watch:

- The event name is a top-level string field, `event`. The docs describe it as `event.received` **[docs]**. The observed format is the one above.
- Use `data.status` to decide whether a payment succeeded. `transactionStatus` was `created` while `status` was `SUCCESS`.
- `nettAmount` equalled `amount` (10,000) even though a 4% platform fee applies to membership and SaaS **[sandbox]**. Do not use `nettAmount` as net revenue. Reconcile fees from the transactions API instead. The transaction docs show a `fee` array with `balanceHistoryType: "mayar_fee"` **[docs]**. This was not verified for the test payment.
- The test event (`webhooks/test`) has a different shape: `createdAt` was an integer, and the body included `custom_field`. Do not treat the test payload as the schema.
- Other event names listed in the docs **[docs]**: `payment.reminder` (sent when unpaid after 29 minutes), `shipper.status`, `membership.newMemberRegistered`, `membership.changeTierMemberRegistered`, `membership.memberExpired`, `membership.memberUnsubscribed`. Only `payment.received` has been observed **[sandbox]**.
- Payloads contain customer name, email, and phone. Do not log raw bodies in production.

### Reproducing the webhook test

1. Run a local HTTP receiver on `127.0.0.1`. It should log header names, a truncated SHA-256 of each value, and flags for whether a value equals or contains the token. It should not store the token itself. Store logs outside the repository.
2. Expose it with a quick tunnel, for example `cloudflared tunnel --url http://127.0.0.1:8787` (Homebrew, version 2026.10.2 at the time of testing).
3. A new quick-tunnel hostname may not resolve on the local resolver for a while. Check it against a public resolver with `dig +short @1.1.1.1 <host>`. `curl --resolve <host>:443:<ip>` reaches the tunnel meanwhile.
4. Register the URL with `POST /webhooks/update`. Trigger either `POST /webhooks/test` or a real payment on a payment link.
5. Afterwards stop the receiver and tunnel, unpublish test links, and replace the registered URL. No delete endpoint was found.

## 5. Payment links, status, and expiry

- Status options in the dashboard: Published, Unpublished, Unlisted, and Hapus (delete) **[sandbox]**.
- Unpublished blocks payment. Hapus is permanent. Whether the API can delete a product was not established **[open]**.
- A link created with `expiredAt` in the past or near-term expires. The dashboard states that products with expired dates are switched to Unpublished automatically **[sandbox]**. Set `expiredAt` deliberately.
- The product page has a Transaksi tab for checking payments made through a link **[sandbox]**.
- Settlement timing for payment methods **[docs]**: virtual account instant; QRIS and e-wallet H+3 working days; cards and retail outlets H+5 working days.

## 6. Fees

### Platform fee (admin fee) by plan **[docs]**

| Category                                                 | Starter | Business | Enterprise |
| -------------------------------------------------------- | ------- | -------- | ---------- |
| Payment links, invoicing, PayMe, pay requests            | 1.5%    | 1%       | 0%         |
| Physical products, webinars, events, coaching, bootcamps | 3%      | 2%       | 0%         |
| Bundles, travel packages, hotel/villa bookings           | 3%      | 2%       | 0%         |
| Digital goods (e-books, podcasts, audiobooks, software)  | 4%      | 3%       | 0%         |
| Fundraising, online classes, **membership, SaaS**        | **4%**  | **3%**   | 0%         |

Plan prices: Starter Rp 0; Business Rp 349,000 per month; Enterprise by quote **[docs]**. The pricing page has no feature matrix **[sandbox/docs]**.

### Channel fees (same for every plan) **[docs]**

| Method             | Fee              |
| ------------------ | ---------------- |
| Virtual account    | Rp 4,000         |
| Credit card        | 2.60% + Rp 2,000 |
| E-wallet           | 1.5% (Jenius 2%) |
| QRIS               | 0.7%             |
| Minimarket         | Rp 5,000–7,500   |
| PayLater (Akulaku) | 1.7%             |

All channel fees exclude tax. Channel fee tiers are not split by plan.

### Withdrawal

- Flat Rp 2,775 per withdrawal, regardless of amount **[docs]**.
- Maximum Rp 250 million per withdrawal, with OTP confirmation **[web]** (FAQ snippet).

### Who pays

- By default the merchant pays platform and channel fees **[docs]**.
- Both can be charged to the buyer under Settings → Payment Methods. The docs say the transaction amount stays intact and the fees are added to the buyer's total **[docs]**. Whether this applies per payment method or per product is **[open]**.
- Webhook flags `isAdminFeeBorneByCustomer` and `isChannelFeeBorneByCustomer` show who bore the fee for each transaction **[sandbox]**.

### Open fee questions **[open]**

- Is the platform fee charged only on successful payments?
- Is it calculated on the product price or on the total paid?
- Does a plan change take effect immediately?
- Are fees returned on refund? The service policy says refunds are deducted from the merchant balance and does not mention fees.
- Fee changes require at least 14 working days' notice **[docs]** (service policy dated 20 March 2021).

### Cost comparison: Rp 49,000 monthly membership

Assumes platform and channel fees are both added, excluding tax **[docs]**.

| Method           | Mayar Starter | Midtrans          | Xendit (search snippets) |
| ---------------- | ------------- | ----------------- | ------------------------ |
| QRIS             | Rp 2,303      | Rp 343            | Rp 309–343               |
| Credit card      | Rp 5,234      | Rp 3,421          | Rp 3,421                 |
| GoPay / e-wallet | Rp 2,695      | Rp 980 (GoPay 2%) | Rp 735 (DANA/OVO 1.5%)   |
| Virtual account  | Rp 5,960      | Rp 4,000          | Rp 4,000                 |

- Mayar Business: platform fee 3% plus the Rp 349,000 monthly plan. It is cheaper than Starter only above about Rp 34.9 million of membership revenue per month. Below that, Starter is cheaper.
- If the buyer pays the fees: a QRIS payment of Rp 49,000 becomes Rp 51,303 for the buyer (49,000 + 1,960 + 343), and Sydia receives Rp 49,000 **[docs]**. Not verified in practice.

## 7. Plans and API access

- The API key works on the account used for testing **[sandbox]**. The account's plan was not confirmed.
- No documentation found restricts API access, API keys, or webhooks to Business or Enterprise **[docs]**.
- The FAQ intro describes "API & tools lengkap untuk tim developer" without naming a plan. Its answers are collapsed **[docs]**.

## 8. Account verification

Form types **[docs]**: Individual, Business, Foundation, PT, PT Perorangan.

- **Individual:** KTP (own), selfie holding KTP, and bank account proof are required. NPWP is optional. The name must match the ID.
- **Business, Foundation, PT, PT Perorangan:** more documents are required, such as NIB, company deed, and tax number.
- Withdrawal and disbursement conditions before verification are not stated **[open]**. The docs say features are available "without any verification restrictions" after approval.
- Statuses: Pending, Revision Required, Rejected.
- Selling requires verification: "Before you can start selling, you need to verify your account" **[docs]**.

### Account review (merchant of record) **[docs]**

- Mayar acts as merchant of record and monitors transactions for fraud and policy violations.
- Asynchronous reviews pause payouts. Customers can still pay.
- Mayar's chargeback threshold is 0.4%. Card networks treat 0.7% as excessive.
- Policy violations can block processing and cancel subscriptions with refunds **[docs]**.

## 9. Recurring billing on Mayar

- Membership tiers can bill for 1, 3, 6, or 12 months, or a lifetime option **[docs]**.
- A grace period setting deactivates the account when payment is not received. Its available lengths and the reminder behavior are not stated **[docs]**.
- `memberships/.../invoice/create` produces one invoice per billing term, paid through `membershipBillUrl` **[docs]**. It was not called in sandbox.
- Automatic charging of a saved card or e-wallet: **not described** **[open]**. The membership feature page does not say whether renewals are automatic.
- Conclusion for now: Mayar memberships look like manual payment per term, not auto-debit.
- The SaaS product type has activate and deactivate endpoints **[docs]**. They were not analyzed.
- Credit-based membership has balance, spend, and add-credit endpoints **[docs]**. The PRD requires entitlements to stay in Sydia (`docs/Sydia_PRD.md`, section 9.14), so Mayar credits should not replace Sydia's own quota model.

## 10. Auto-debit alternatives

| Aspect        | Midtrans Subscription API                                                                                                                                                                                                      | Xendit Subscriptions                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment types | `credit_card` and `gopay` **[docs]**                                                                                                                                                                                           | Overview does not name channels **[docs]**. Pricing page mentions e-wallets, cards, and direct debit **[web]**                                                |
| Create        | `POST /v1/subscriptions` with `name`, `amount`, `currency` (IDR only), `payment_type`, `token`, `schedule` (`interval`, `interval_unit`, `start_time`), optional `retry_schedule`, and `gopay.account_id` for GoPay **[docs]** | Plans and cycles (`create-recurring-plan`), cycle cancel, force attempt, webhooks such as `recurring.cycle.retrying` and `recurring.cycle.failed` **[docs]**  |
| Retries       | 3 retries, one hour apart by default, then `inactive`. Setting `max_interval` to 0 disables retries **[docs]**                                                                                                                 | Statuses `Retrying` and `Failed`. Retry count comes from the schedule **[docs]**                                                                              |
| Enablement    | Recurring must be enabled by Midtrans support or sales **[docs]**                                                                                                                                                              | Whether MIT approval is needed for cards is unclear **[open]**                                                                                                |
| Card rules    | First transaction must succeed in 3DS mode. Token is valid only for this merchant **[docs]**                                                                                                                                   | Card recurring uses MIT. The page does not state approval steps **[docs]**                                                                                    |
| GoPay rules   | No PIN challenge for recurring charges, only for authorized merchants **[docs]**                                                                                                                                               | Not confirmed **[open]**                                                                                                                                      |
| Fees          | Standard channel fees. No monthly fee and no subscription fee stated **[docs]**                                                                                                                                                | No subscription fee per help center **[web]**. A Rp 2,500 per active plan per month fee appears on the pricing page but could not be verified (403) **[web]** |

Midtrans fees **[docs]**: VA Rp 4,000; GoPay 2%; QRIS 0.7%; ShopeePay 2% (1.5% in an Indonesian article); DANA and OVO 1.5%; cards 2.9% + Rp 2,000; over-the-counter Rp 5,000; Akulaku 1.7%; Kredivo 2%; payout to bank Rp 5,000. The English page and the Indonesian article conflict on some rows and on VAT for QRIS, GoPay, and ShopeePay.

Xendit fees **[web]**: cards 2.9% + Rp 2,000; QRIS 0.63% on the help center and 0.7% in a docs snippet; DANA and OVO 1.5% (OVO up to 3.18% for some categories); VA Rp 4,000 on the aggregator route; direct debit BRI 1.9%, Mandiri Rp 4,500, BCA KlikPay Rp 2,500. GoPay was not confirmed. Xendit's pricing page, help center, and docs returned HTTP 403 when fetched, so these figures are not verified.

## 11. Open questions for Mayar support

Contact: `bantuan@mayar.id`, listed on the dashboard's API Keys page.

1. Is membership renewal automatic with a saved card or e-wallet, or is a new invoice created each term? Is there an API to create, change, or cancel a saved payment method?
2. Is the platform fee charged only on successful payments? Is it calculated on the price or on the total paid?
3. Where can net settlement per transaction be read? Does `nettAmount` ever include fees?
4. Is `X-Callback-Token` the documented verification method? What is the retry policy, and what response code should the receiver return?
5. Which plan includes API access? Can sandbox be used before account verification?
6. For an Individual account: what are the withdrawal limits before verification, and which documents are needed?
7. Is there a refund API? How are fees treated on refunds?
8. Do `membership.*` events use the same payload shape as `payment.received`?

## 12. Decisions still open for Sydia

1. **Billing model.** Manual payment per term through Mayar invoices, or automatic monthly charging through Midtrans or Xendit as a second provider.
2. **Account type.** Individual or Business/PT. This decides the verification form and whose name receives the funds and appears on invoices.
3. **Fee bearer.** Sydia pays the platform fee, or the buyer pays it.
4. **Plan.** Starter or Business.

## 13. Implementation notes for BE-0903

- Keep the provider behind the billing boundary. The architecture puts the billing provider behind an application interface (`docs/Sydia_System_Architecture.md`, around line 195). The PRD requires entitlements to stay in the domain model (`docs/Sydia_PRD.md`, section 9.14).
- Store provider identifiers and subscription state in Sydia's database. Entitlements stay in Sydia (`apps/frontend/PRODUCT.md`, line 36).
- Webhook handler: verify `X-Callback-Token` with a constant-time comparison, respond quickly, make processing idempotent by transaction ID, and re-check status through the API before granting access.
- Do not log raw webhook bodies. They contain personal data.
- Add `MAYAR_API_KEY` and `MAYAR_WEBHOOK_TOKEN` to `.env.example` when the integration lands. Not done yet.

## 14. Sandbox state at the time of writing (21 October 2026)

- The registered sandbox webhook URL points to a tunnel that has been stopped. Replace it in the dashboard (Integrasi → Webhook) or register a new one.
- Test products: "Tes webhook Sydia" (Unpublished) and "Tes payment webhook Sydia" (Published, paid once). Unpublish both.
- Local receiver logs in the agent scratchpad contain test customer data. Delete them when no longer needed.

## Sources

- Mayar API V1 introduction: https://docs.mayar.id/api-reference/introduction
- Mayar API V2 introduction: https://docs.mayar.id/api-reference-v2/introduction
- Mayar rate limit V2: https://docs.mayar.id/api-reference-v2/rate-limit.md
- Mayar webhook integration: https://docs.mayar.id/integration/webhook
- Mayar webhook registration V2: https://docs.mayar.id/api-reference-v2/webhook/registerurlhook.md
- Mayar webhook test V2: https://docs.mayar.id/api-reference-v2/webhook/testurlhook.md
- Mayar webhook history V2: https://docs.mayar.id/api-reference-v2/webhook/newhistory.md
- Mayar webhook retry V2: https://docs.mayar.id/api-reference-v2/webhook/retryhistory.md
- Mayar invoice create V2: https://docs.mayar.id/api-reference-v2/invoice/create.md
- Mayar payment link create V2: https://docs.mayar.id/api-reference-v2/genericlink/createpaymentlink.md
- Mayar membership invoice V2: https://docs.mayar.id/api-reference-v2/membership/createinvoice.md
- Mayar membership feature: https://docs.mayar.id/features/productpage/membership.md
- Mayar transaction fees: https://docs.mayar.id/mor/fees
- Mayar pricing: https://mayar.id/pricing
- Mayar FAQ: https://mayar.id/faq
- Mayar service policy: https://mayar.id/kebijakan-layanan
- Mayar account review: https://docs.mayar.id/mor/accountreview.md
- Mayar account verification: https://docs.mayar.id/businessverify.md, https://docs.mayar.id/accountsetup.md
- Mayar headless commerce: https://mayar.id/headless-commerce
- Midtrans pricing: https://midtrans.com/pricing
- Midtrans create subscription: https://docs.midtrans.com/reference/create-subscription
- Xendit subscriptions overview: https://docs.xendit.co/docs/subscriptions-overview.md
- Xendit cards recurring and MIT: https://docs.xendit.co/docs/cards-recurring-and-merchant-initiated-transactions.md
- Xendit pricing (returned 403): https://xendit.co/en-id/pricing/
- Xendit help center pricing (returned 403): https://help.xendit.co/hc/en-us/articles/360039086452-What-are-the-pricing-for-Xendit-products
