-- Contact groups: a contact may belong to zero or many user-scoped groups.
CREATE TABLE "contact_group" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_group_member" (
    "contactId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "contact_group_member_pkey" PRIMARY KEY ("contactId","groupId")
);

CREATE INDEX "contact_group_userId_name_idx" ON "contact_group"("userId", "name");
CREATE UNIQUE INDEX "contact_group_userId_normalizedName_key" ON "contact_group"("userId", "normalizedName");
CREATE INDEX "contact_group_member_groupId_idx" ON "contact_group_member"("groupId");

ALTER TABLE "contact_group" ADD CONSTRAINT "contact_group_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_group_member" ADD CONSTRAINT "contact_group_member_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_group_member" ADD CONSTRAINT "contact_group_member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "contact_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
