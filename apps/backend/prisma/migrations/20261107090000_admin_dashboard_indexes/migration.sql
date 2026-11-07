CREATE INDEX "user_createdAt_idx" ON "user"("createdAt");
CREATE INDEX "message_userId_createdAt_idx" ON "message"("userId", "createdAt");
CREATE INDEX "message_role_createdAt_idx" ON "message"("role", "createdAt");
CREATE INDEX "assistant_run_createdAt_idx" ON "assistant_run"("createdAt");
CREATE INDEX "billing_payment_environment_verifiedAt_idx" ON "billing_payment"("environment", "verifiedAt");
-- Receipt lookups join the immutable payment order ID stored in audit metadata.
CREATE INDEX "audit_event_payment_order_idx" ON "audit_event" ((metadata->>'orderId'))
WHERE "eventType" = 'billing.payment_applied';
