import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { userActivitySql, verifiedPaymentsSql } from './admin-analytics.sql';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  AdminOverview,
  AdminUsersInput,
  AdminUsersPage,
  IAdminRepository,
  AdminGiftPlusInput,
  AdminGiftPlusResult,
} from '../interfaces';

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  banned: boolean;
  createdAt: Date;
  paidUntil: Date | null;
  lastActivityAt: Date | null;
  activeSessions: bigint;
  storageBytes: bigint;
  llmCostUsd: Prisma.Decimal;
  details: Omit<
    import('../interfaces').AdminUser,
    | 'id'
    | 'name'
    | 'email'
    | 'status'
    | 'createdAt'
    | 'paidUntil'
    | 'lastActivityAt'
    | 'activeSessions'
    | 'storageBytes'
    | 'llmCostUsd'
    | 'usage'
    | 'trialEndsAt'
    | 'lastPaymentAt'
  > & { trialEndsAt: string | null; lastPaymentAt: string | null };
  conversations: bigint;
  documents: bigint;
  memories: bigint;
  reminders: bigint;
  tasks: bigint;
  contacts: bigint;
  events: bigint;
};

type OverviewRow = {
  totalUsers: bigint;
  activeUsers: bigint;
  allowedUsers: bigint;
  subscribedUsers: bigint;
  bannedUsers: bigint;
  activeSessions: bigint;
  storageBytes: bigint;
  llmCostUsd: Prisma.Decimal;
};

type CostRow = { model: string; costUsd: Prisma.Decimal };

function count(value: bigint): number {
  return Number(value);
}

function money(value: Prisma.Decimal): number {
  return value.toNumber();
}

@Injectable()
export class PrismaAdminRepository implements IAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async giftPlus(input: AdminGiftPlusInput): Promise<AdminGiftPlusResult> {
    return this.prisma.$transaction(async (tx) => {
      // Share the payment lock so gifts and verified payments cannot lose time.
      const users = await tx.$queryRaw<Array<{ createdAt: Date }>>`
        SELECT "createdAt" FROM "user" WHERE id = ${input.userId} FOR UPDATE
      `;

      const user = users[0];
      if (!user) return { status: 'not-found' };

      const previous = await tx.auditEvent.findFirst({
        where: {
          userId: input.userId,
          eventType: 'admin.user.gift-plus',
          metadata: { path: ['requestId'], equals: input.requestId },
        },
        select: { metadata: true },
      });

      if (previous) {
        const metadata = previous.metadata;
        if (
          !metadata ||
          typeof metadata !== 'object' ||
          Array.isArray(metadata) ||
          metadata.actorId !== input.actorId ||
          metadata.durationDays !== input.durationDays
        )
          return { status: 'conflict' };
        if (
          typeof metadata.paidUntil !== 'string' ||
          !Number.isFinite(Date.parse(metadata.paidUntil))
        )
          throw new Error('Gift audit event is missing a valid paidUntil');

        return { status: 'applied', paidUntil: new Date(metadata.paidUntil) };
      }

      const trialStartsAt = new Date(
        Math.max(user.createdAt.getTime(), input.rolloutAt.getTime()),
      );

      const account = await tx.billingAccount.upsert({
        where: { userId: input.userId },
        update: {},
        create: {
          userId: input.userId,
          trialStartsAt,
          trialEndsAt: new Date(
            trialStartsAt.getTime() + input.trialDays * 86_400_000,
          ),
          lastActivatedAt: trialStartsAt,
        },
      });

      const paidUntil = new Date(
        Math.max(
          input.now.getTime(),
          account.paidUntil?.getTime() ?? 0,
          account.trialEndsAt.getTime(),
        ) +
          input.durationDays * 86_400_000,
      );

      await tx.billingAccount.update({
        where: { userId: input.userId },
        data: {
          paidUntil,
          lastActivatedAt:
            (account.paidUntil && account.paidUntil > input.now) ||
            (account.trialStartsAt <= input.now &&
              account.trialEndsAt > input.now)
              ? account.lastActivatedAt
              : input.now,
        },
      });
      await tx.auditEvent.create({
        data: {
          userId: input.userId,
          eventType: 'admin.user.gift-plus',
          metadata: {
            actorId: input.actorId,
            requestId: input.requestId,
            durationDays: input.durationDays,
            paidUntil: paidUntil.toISOString(),
          },
        },
      });

      return { status: 'applied', paidUntil };
    });
  }

  async overview(now: Date): Promise<AdminOverview> {
    const [rows, costs] = await Promise.all([
      this.prisma.$queryRaw<OverviewRow[]>(Prisma.sql`
        WITH activity AS (${userActivitySql(new Date(now.getTime() - 30 * 86_400_000), now)}), payments AS (${verifiedPaymentsSql('production')})
        SELECT
          COUNT(*)::bigint AS "totalUsers",
          (SELECT COUNT(DISTINCT "userId") FROM activity)::bigint AS "activeUsers",
          COUNT(*) FILTER (WHERE NOT u."banned")::bigint AS "allowedUsers",
          (SELECT COUNT(DISTINCT "userId") FROM payments WHERE "paidThrough">${now} AND "verifiedAt"<${now})::bigint AS "subscribedUsers",
          COUNT(*) FILTER (WHERE u."banned")::bigint AS "bannedUsers",
          (SELECT COUNT(*) FROM "session" s WHERE s."expiresAt" > ${now})::bigint AS "activeSessions",
          COALESCE((SELECT SUM(f."size") FROM "file_asset" f), 0)::bigint AS "storageBytes",
          COALESCE((SELECT SUM(r."costUsd") FROM "model_usage" r), 0)::decimal AS "llmCostUsd"
        FROM "user" u
      `),
      this.prisma.$queryRaw<CostRow[]>(Prisma.sql`
        SELECT r."model", COALESCE(SUM(r."costUsd"), 0)::decimal AS "costUsd"
        FROM "model_usage" r
        WHERE r."costUsd" IS NOT NULL
        GROUP BY r."model"
        ORDER BY "costUsd" DESC
      `),
    ]);

    const row = rows[0];
    if (!row) throw new Error('Admin overview aggregate returned no result');

    return {
      totalUsers: count(row.totalUsers),
      allowedUsers: count(row.allowedUsers),
      subscribedUsers: count(row.subscribedUsers),
      activeUsers: count(row.activeUsers),
      bannedUsers: count(row.bannedUsers),
      activeSessions: count(row.activeSessions),
      storageBytes: count(row.storageBytes),
      llmCostUsd: money(row.llmCostUsd),
      llmCostBreakdown: costs.map((entry) => ({
        model: entry.model,
        costUsd: money(entry.costUsd),
      })),
    };
  }

  async users(now: Date, input: AdminUsersInput): Promise<AdminUsersPage> {
    const keyword = input.q?.trim() ?? '';
    const search = keyword
      ? Prisma.sql`AND (strpos(lower(u."name"), lower(${keyword})) > 0 OR strpos(lower(u."email"), lower(${keyword})) > 0)`
      : Prisma.empty;

    const status = input.status
      ? Prisma.sql`AND u."banned" = ${input.status === 'banned'}`
      : Prisma.empty;

    const weekLater = new Date(now.getTime() + 7 * 86_400_000);
    const lastActivity = Prisma.sql`(SELECT MAX(a."occurredAt") FROM (${userActivitySql(new Date(0), now)}) a WHERE a."userId"=u.id)`;
    const trialEnd = Prisma.sql`COALESCE((SELECT b."trialEndsAt" FROM billing_account b WHERE b."userId"=u.id), CASE WHEN ${input.rolloutAt ?? null}::timestamp IS NOT NULL THEN GREATEST(u."createdAt", ${input.rolloutAt ?? null}::timestamp) + (${BILLING_TRIAL_DAYS} * interval '1 day') END)`;
    const paidEnd = Prisma.sql`(SELECT b."paidUntil" FROM billing_account b WHERE b."userId"=u.id)`;
    const plan = Prisma.sql`CASE WHEN ${paidEnd}>${now} THEN 'plus' WHEN ${trialEnd}>${now} THEN 'trial' WHEN ${trialEnd} IS NULL THEN 'disabled' ELSE 'expired' END`;
    const planFilter = input.plan
      ? Prisma.sql`AND ${plan}=${input.plan}`
      : Prisma.empty;

    const activityFilter = input.activity
      ? Prisma.sql`AND EXISTS(SELECT 1 FROM (${userActivitySql(new Date(now.getTime() - 30 * 86_400_000), now)}) a WHERE a."userId"=u.id)=${input.activity === 'active'}`
      : Prisma.empty;

    const attentionFilter =
      input.attention === 'trial-expiring'
        ? Prisma.sql`AND ${plan}='trial' AND ${trialEnd}<=${weekLater}`
        : input.attention === 'plus-expiring'
          ? Prisma.sql`AND ${paidEnd}>${now} AND ${paidEnd}<=${weekLater} AND EXISTS(SELECT 1 FROM (${verifiedPaymentsSql(input.environment ?? 'production')}) p WHERE p."userId"=u.id AND p."paidThrough">${now})`
          : Prisma.empty;

    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
    const cost30Days = Prisma.sql`(SELECT SUM(mu."costUsd") FROM model_usage mu WHERE mu."userId"=u.id AND mu."createdAt">=${monthAgo} AND mu."createdAt"<${now})`;
    const order =
      input.sort === 'cost'
        ? Prisma.sql`${cost30Days} DESC NULLS LAST, u."id" DESC`
        : input.sort === 'oldest'
          ? Prisma.sql`u."createdAt" ASC, u."id" ASC`
          : input.sort === 'activity'
            ? Prisma.sql`${lastActivity} DESC NULLS LAST, u."id" DESC`
            : Prisma.sql`u."createdAt" DESC, u."id" DESC`;

    const where = Prisma.sql`WHERE TRUE ${search} ${status} ${planFilter} ${activityFilter} ${attentionFilter}`;
    const [countRow] = await this.prisma.$queryRaw<
      [{ total: bigint }]
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS total FROM "user" u ${where}
    `);

    const total = count(countRow.total);
    // Account deletion or a status change can remove the final page.
    const offset = Math.min(
      input.offset,
      Math.max(0, Math.ceil(total / input.limit) - 1) * input.limit,
    );

    const rows = await this.prisma.$queryRaw<AdminUserRow[]>(Prisma.sql`
      WITH page_users AS MATERIALIZED (
        SELECT u."id", u."name", u."email", u."banned", u."createdAt", u."updatedAt"
        FROM "user" u ${where}
        ORDER BY ${order}
        LIMIT ${input.limit} OFFSET ${offset}
      )
      SELECT
        u."id",
        u."name",
        u."email",
        u."banned",
        u."createdAt",
        json_build_object('trialEndsAt',(${trialEnd} AT TIME ZONE 'UTC'),'plan',${plan},
          'onboardingCompleted',(SELECT x."onboardingCompleted" FROM "user" x WHERE x.id=u.id),
          'acquisitionSource',(SELECT a."utmSource" FROM user_attribution a WHERE a."userId"=u.id),
          'channels',COALESCE((SELECT json_agg(DISTINCT c.channel) FROM conversation c WHERE c."userId"=u.id),'[]'::json),
          'payments',(SELECT COUNT(*) FROM billing_payment p JOIN billing_order o ON o.id=p."orderId" WHERE o."userId"=u.id AND p.environment=${input.environment ?? 'production'}),
          'paymentTotalIdr',COALESCE((SELECT SUM(p.amount) FROM billing_payment p JOIN billing_order o ON o.id=p."orderId" WHERE o."userId"=u.id AND p.environment=${input.environment ?? 'production'}),0),
          'lastPaymentAt',(SELECT MAX(p."verifiedAt") AT TIME ZONE 'UTC' FROM billing_payment p JOIN billing_order o ON o.id=p."orderId" WHERE o."userId"=u.id AND p.environment=${input.environment ?? 'production'}),
          'lastPaymentMethod',(SELECT o."paymentMethod" FROM billing_payment p JOIN billing_order o ON o.id=p."orderId" WHERE o."userId"=u.id AND p.environment=${input.environment ?? 'production'} ORDER BY p."verifiedAt" DESC LIMIT 1),
          'llmCost30DaysUsd',COALESCE(${cost30Days},0),
          'llmCost30DaysByKind',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC) FROM (SELECT mu.kind,COALESCE(SUM(mu."costUsd"),0) AS "costUsd",COUNT(*) AS calls FROM model_usage mu WHERE mu."userId"=u.id AND mu."createdAt">=${monthAgo} AND mu."createdAt"<${now} GROUP BY mu.kind) x),'[]'::json)
        ) AS details,
        (SELECT b."paidUntil" FROM "billing_account" b WHERE b."userId" = u."id") AS "paidUntil",
        ${lastActivity} AS "lastActivityAt",
        (SELECT COUNT(*) FROM "session" s WHERE s."userId" = u."id" AND s."expiresAt" > ${now})::bigint AS "activeSessions",
        COALESCE((SELECT SUM(x."size") FROM "file_asset" x WHERE x."userId" = u."id"), 0)::bigint AS "storageBytes",
        COALESCE((
          SELECT SUM(mu."costUsd") FROM "model_usage" mu WHERE mu."userId" = u."id"
        ), 0)::decimal AS "llmCostUsd",
        (SELECT COUNT(*) FROM "conversation" x WHERE x."userId" = u."id")::bigint AS "conversations",
        (SELECT COUNT(*) FROM "document" x WHERE x."userId" = u."id")::bigint AS "documents",
        (SELECT COUNT(*) FROM "memory" x WHERE x."userId" = u."id")::bigint AS "memories",
        (SELECT COUNT(*) FROM "reminder" x WHERE x."userId" = u."id")::bigint AS "reminders",
        (SELECT COUNT(*) FROM "task" x WHERE x."userId" = u."id")::bigint AS "tasks",
        (SELECT COUNT(*) FROM "contact" x WHERE x."userId" = u."id")::bigint AS "contacts",
        (SELECT COUNT(*) FROM "calendar_event" x WHERE x."userId" = u."id")::bigint AS "events"
      FROM page_users u
      ORDER BY ${order}
    `);

    const items = rows.map((row) => ({
      ...row.details,
      trialEndsAt: row.details.trialEndsAt
        ? new Date(row.details.trialEndsAt)
        : null,
      lastPaymentAt: row.details.lastPaymentAt
        ? new Date(row.details.lastPaymentAt)
        : null,
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.banned ? ('banned' as const) : ('active' as const),
      createdAt: row.createdAt,
      paidUntil: row.paidUntil,
      lastActivityAt: row.lastActivityAt,
      activeSessions: count(row.activeSessions),
      storageBytes: count(row.storageBytes),
      llmCostUsd: money(row.llmCostUsd),
      usage: {
        conversations: count(row.conversations),
        documents: count(row.documents),
        memories: count(row.memories),
        reminders: count(row.reminders),
        tasks: count(row.tasks),
        contacts: count(row.contacts),
        events: count(row.events),
      },
    }));

    return { items, total, offset };
  }

  async ban(userId: string, reason: string): Promise<boolean> {
    const result = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: { id: userId },
        data: { banned: true, banReason: reason, banExpires: null },
      });

      if (updated.count > 0) {
        await transaction.session.deleteMany({ where: { userId } });
      }

      return updated.count;
    });

    return result > 0;
  }

  async unban(userId: string): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { banned: false, banReason: null, banExpires: null },
    });

    return result.count > 0;
  }

  async revokeSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async deleteUser(userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const users = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`,
      );

      if (!users.length) return false;

      const files = await transaction.fileAsset.findMany({
        where: { userId },
        select: { storageKey: true },
      });

      const now = new Date();

      await transaction.documentArtifactCleanup.createMany({
        data: files.map(({ storageKey }) => ({ ownerId: userId, storageKey })),
        skipDuplicates: true,
      });
      await transaction.documentArtifactCleanup.updateMany({
        where: { ownerId: userId },
        data: { cleanupRequestedAt: now },
      });

      const result = await transaction.user.deleteMany({
        where: { id: userId },
      });

      return result.count === 1;
    });
  }

  async storageKeys(userId: string): Promise<string[]> {
    const assets = await this.prisma.fileAsset.findMany({
      where: { userId },
      select: { storageKey: true },
    });

    return assets.map((asset) => asset.storageKey);
  }
}
