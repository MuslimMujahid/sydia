import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { AdminOverview, AdminUser, IAdminRepository } from '../interfaces';

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  banned: boolean;
  createdAt: Date;
  lastActivityAt: Date | null;
  activeSessions: bigint;
  storageBytes: bigint;
  llmCostUsd: Prisma.Decimal;
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

  async overview(now: Date): Promise<AdminOverview> {
    const [rows, costs] = await Promise.all([
      this.prisma.$queryRaw<OverviewRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "totalUsers",
          COUNT(*) FILTER (WHERE NOT u."banned")::bigint AS "activeUsers",
          COUNT(*) FILTER (WHERE u."banned")::bigint AS "bannedUsers",
          (SELECT COUNT(*) FROM "session" s WHERE s."expiresAt" > ${now})::bigint AS "activeSessions",
          COALESCE((SELECT SUM(f."size") FROM "file_asset" f), 0)::bigint AS "storageBytes",
          COALESCE((SELECT SUM(r."costUsd") FROM "assistant_run" r), 0)::decimal AS "llmCostUsd"
        FROM "user" u
      `),
      this.prisma.$queryRaw<CostRow[]>(Prisma.sql`
        SELECT r."model", COALESCE(SUM(r."costUsd"), 0)::decimal AS "costUsd"
        FROM "assistant_run" r
        WHERE r."costUsd" IS NOT NULL
        GROUP BY r."model"
        ORDER BY "costUsd" DESC
      `),
    ]);

    const row = rows[0];

    return {
      totalUsers: count(row?.totalUsers ?? 0n),
      activeUsers: count(row?.activeUsers ?? 0n),
      bannedUsers: count(row?.bannedUsers ?? 0n),
      activeSessions: count(row?.activeSessions ?? 0n),
      storageBytes: count(row?.storageBytes ?? 0n),
      llmCostUsd: money(row?.llmCostUsd ?? new Prisma.Decimal(0)),
      llmCostBreakdown: costs.map((entry) => ({
        model: entry.model,
        costUsd: money(entry.costUsd),
      })),
    };
  }

  async users(now: Date): Promise<AdminUser[]> {
    const rows = await this.prisma.$queryRaw<AdminUserRow[]>(Prisma.sql`
      SELECT
        u."id",
        u."name",
        u."email",
        u."banned",
        u."createdAt",
        GREATEST(
          MAX(m."createdAt"),
          MAX(s."updatedAt"),
          u."updatedAt"
        ) AS "lastActivityAt",
        COUNT(DISTINCT s."id") FILTER (WHERE s."expiresAt" > ${now})::bigint AS "activeSessions",
        COALESCE((SELECT SUM(x."size") FROM "file_asset" x WHERE x."userId" = u."id"), 0)::bigint AS "storageBytes",
        COALESCE((
          SELECT SUM(ar."costUsd")
          FROM "assistant_run" ar
          JOIN "conversation" ac ON ac."id" = ar."conversationId"
          WHERE ac."userId" = u."id"
        ), 0)::decimal AS "llmCostUsd",
        (SELECT COUNT(*) FROM "conversation" x WHERE x."userId" = u."id")::bigint AS "conversations",
        (SELECT COUNT(*) FROM "document" x WHERE x."userId" = u."id")::bigint AS "documents",
        (SELECT COUNT(*) FROM "memory" x WHERE x."userId" = u."id")::bigint AS "memories",
        (SELECT COUNT(*) FROM "reminder" x WHERE x."userId" = u."id")::bigint AS "reminders",
        (SELECT COUNT(*) FROM "task" x WHERE x."userId" = u."id")::bigint AS "tasks",
        (SELECT COUNT(*) FROM "contact" x WHERE x."userId" = u."id")::bigint AS "contacts",
        (SELECT COUNT(*) FROM "calendar_event" x WHERE x."userId" = u."id")::bigint AS "events"
      FROM "user" u
      LEFT JOIN "session" s ON s."userId" = u."id"
      LEFT JOIN "message" m ON m."userId" = u."id"
      GROUP BY u."id"
      ORDER BY u."createdAt" DESC
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      status: row.banned ? 'banned' : 'active',
      createdAt: row.createdAt,
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
    const result = await this.prisma.user.deleteMany({ where: { id: userId } });

    return result.count > 0;
  }

  async storageKeys(userId: string): Promise<string[]> {
    const assets = await this.prisma.fileAsset.findMany({
      where: { userId },
      select: { storageKey: true },
    });

    return assets.map((asset) => asset.storageKey);
  }
}
