import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infra/prisma';
import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { TOOL_FEATURE_RULES } from '../../shared/activity/usage-features';
import { ACTIVITY_FEATURES } from '../interfaces/admin-analytics.repository.interface';

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

/** The feature of a tool name, mirroring `toolFeature()`; NULL when no rule matches. */
export function toolFeatureSql(column: Prisma.Sql): Prisma.Sql {
  const cases = TOOL_FEATURE_RULES.map(
    ([pattern, feature]) =>
      Prisma.sql`WHEN ${column} ~ ${pattern.source} THEN ${feature}`,
  );

  return Prisma.sql`(CASE ${Prisma.join(cases, ' ')} END)`;
}

/**
 * One row per user action, by feature: their messages (chat), annotated app
 * writes, and tools the assistant completed for their own messages. Overhead
 * tools are not actions.
 */
export function actionsSql(from: Date, until: Date): Prisma.Sql {
  const feature = toolFeatureSql(Prisma.sql`t."name"`);

  return Prisma.sql`
    SELECT m."userId", m."createdAt" AS "occurredAt", 'chat'::text AS feature
    FROM message m WHERE m.role = 'user' AND m."createdAt" >= ${from} AND m."createdAt" < ${until}
    UNION ALL
    SELECT a."userId", a."createdAt",
      CASE WHEN a.metadata->>'feature' = 'memories' THEN 'memory' ELSE a.metadata->>'feature' END
    FROM audit_event a
    WHERE a."userId" IS NOT NULL AND a."eventType" = 'user.activity'
      AND a."createdAt" >= ${from} AND a."createdAt" < ${until}
    UNION ALL
    SELECT m."userId", t."createdAt", ${feature}
    FROM tool_invocation t
      JOIN assistant_run r ON r.id = t."assistantRunId"
      JOIN message m ON m.id = r."inputMessageId"
    WHERE t.status = 'completed' AND m.role = 'user'
      AND t."createdAt" >= ${from} AND t."createdAt" < ${until}
      AND ${feature} IN (${Prisma.join(ACTIVITY_FEATURES.filter((name) => name !== 'chat'))})
  `;
}

/**
 * Model spend rows with a multi-step generation expanded to one row per
 * feature. `cost` is the feature's share; every other column repeats, so count
 * calls on the unexpanded `model_usage` rows.
 */
export function costRowsSql(from: Date, until: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT u.id, u."createdAt", u."userId", u.kind, u.job, u.stage, u.status, u.attempt, u.model,
      u."conversationId",
      f.key AS feature,
      f.value::numeric AS cost,
      (u.kind <> 'message') AS background,
      (u.status = 'failed' OR u.attempt > 1) AS wasted
    FROM model_usage u
      CROSS JOIN LATERAL jsonb_each_text(
        COALESCE(u."featureCosts", jsonb_build_object(u.feature, COALESCE(u."costUsd", 0)))
      ) f
    WHERE u."createdAt" >= ${from} AND u."createdAt" < ${until}
  `;
}

/** An account's plan at `now`, as the admin user list reports it. */
export function planSql(now: Date, rolloutAt: Date | null): Prisma.Sql {
  const trialEnd = Prisma.sql`COALESCE(b."trialEndsAt", CASE WHEN ${rolloutAt}::timestamp IS NOT NULL THEN GREATEST(u."createdAt", ${rolloutAt}::timestamp) + (${BILLING_TRIAL_DAYS} * interval '1 day') END)`;

  return Prisma.sql`CASE WHEN b."paidUntil" > ${now} THEN 'plus' WHEN ${trialEnd} > ${now} THEN 'trial' WHEN ${trialEnd} IS NULL THEN 'disabled' ELSE 'expired' END`;
}

/**
 * Runs one admin report query with JIT compilation off. These reports nest many
 * correlated subqueries over CTEs, so the planner's cost estimate is enormous
 * even on small tables, and Postgres spends seconds compiling hundreds of
 * functions for a query that executes in milliseconds.
 */
export async function reportQuery<T>(
  prisma: PrismaService,
  sql: Prisma.Sql,
): Promise<T> {
  const [, rows] = await prisma.$transaction([
    prisma.$executeRaw`SET LOCAL jit = off`,
    prisma.$queryRaw<T>(sql),
  ]);

  return rows;
}
