-- CreateTable
CREATE TABLE "billing_member" (
    "userId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_member_pkey" PRIMARY KEY ("userId","environment")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_member_environment_memberId_key" ON "billing_member"("environment", "memberId");

-- AddForeignKey
ALTER TABLE "billing_member" ADD CONSTRAINT "billing_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
