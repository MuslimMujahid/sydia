import { Prisma } from '../../generated/prisma/client';

/** Only user-originated activity. Entity updatedAt and auth sessions are deliberately excluded. */
export function userActivitySql(from: Date, until: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT m."userId", m."createdAt" AS "occurredAt", 'chat'::text AS feature
    FROM message m WHERE m.role = 'user' AND m."createdAt" >= ${from} AND m."createdAt" < ${until}
    UNION ALL
    SELECT a."userId", a."createdAt", CASE
      WHEN a."eventType" = 'user.activity' THEN a.metadata->>'feature'
      WHEN a."eventType" LIKE 'task.%' THEN 'tasks'
      WHEN a."eventType" LIKE 'reminder.%' THEN 'reminders'
      WHEN a."eventType" LIKE 'memory.%' THEN 'memories'
      ELSE 'notes' END
    FROM audit_event a
    WHERE a."userId" IS NOT NULL AND a."createdAt" >= ${from} AND a."createdAt" < ${until}
      AND a."eventType" IN ('user.activity', 'task.created', 'task.updated', 'reminder.created', 'reminder.updated', 'memory.created', 'memory.updated', 'daily_note.saved')
    UNION ALL
    SELECT f."userId", f."createdAt", 'documents'::text FROM file_asset f
    WHERE f."createdAt" >= ${from} AND f."createdAt" < ${until}
  `;
}

/** Payment receipts retain their original paid-through date, so later gifts cannot inflate paid subscribers. */
export function verifiedPaymentsSql(environment: string): Prisma.Sql {
  return Prisma.sql`
    SELECT o."userId", p."verifiedAt", p.amount, o."paymentMethod", p."orderId",
      (a.metadata->>'paidUntil')::timestamp AS "paidThrough"
    FROM billing_payment p JOIN billing_order o ON o.id = p."orderId"
    JOIN audit_event a ON a."eventType" = 'billing.payment_applied' AND a.metadata->>'orderId' = o.id
    WHERE p.environment = ${environment} AND o.status = 'paid'
  `;
}
