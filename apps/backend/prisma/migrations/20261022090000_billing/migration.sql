-- CreateTable
CREATE TABLE "billing_account" (
    "userId" TEXT NOT NULL,
    "trialStartsAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "paidUntil" TIMESTAMP(3),
    "lastActivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_account_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "billing_order" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "environment" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "providerInvoiceId" TEXT,
    "providerTransactionId" TEXT,
    "paymentUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "transactionId" TEXT,
    "invoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,

    CONSTRAINT "billing_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_reservation" (
    "storageKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_reservation_pkey" PRIMARY KEY ("storageKey")
);

-- CreateIndex
CREATE INDEX "billing_order_status_nextCheckAt_idx" ON "billing_order"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "billing_order_userId_createdAt_idx" ON "billing_order"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_order_userId_idempotencyKey_key" ON "billing_order"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "billing_order_environment_providerInvoiceId_key" ON "billing_order"("environment", "providerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_order_environment_providerTransactionId_key" ON "billing_order"("environment", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payment_orderId_key" ON "billing_payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payment_environment_providerTransactionId_key" ON "billing_payment"("environment", "providerTransactionId");

-- CreateIndex
CREATE INDEX "billing_webhook_status_receivedAt_idx" ON "billing_webhook"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "storage_reservation_userId_idx" ON "storage_reservation"("userId");

-- AddForeignKey
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_order" ADD CONSTRAINT "billing_order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "billing_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_reservation" ADD CONSTRAINT "storage_reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backstop the account lock against alternate writers and unsafe manual edits.
CREATE UNIQUE INDEX billing_order_one_unresolved_per_user ON billing_order ("userId")
  WHERE status IN ('creating', 'pending', 'review');
ALTER TABLE billing_order ADD CONSTRAINT billing_order_positive_amount CHECK (amount > 0);
ALTER TABLE storage_reservation ADD CONSTRAINT storage_reservation_nonnegative CHECK (bytes >= 0);
