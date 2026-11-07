import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  AdminAnalyticsInput,
  AdminDashboard,
  IAdminAnalyticsRepository,
} from '../interfaces/admin-analytics.repository.interface';
import { userActivitySql, verifiedPaymentsSql } from './admin-analytics.sql';

const DAY = 86_400_000;
const JAKARTA_OFFSET = 7 * 3_600_000;

@Injectable()
export class PrismaAdminAnalyticsRepository implements IAdminAnalyticsRepository {
  private readonly logger = new Logger(PrismaAdminAnalyticsRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async dashboard({
    now,
    period,
    environment,
    rolloutAt,
  }: AdminAnalyticsInput): Promise<AdminDashboard> {
    const local = new Date(now.getTime() + JAKARTA_OFFSET);
    const from = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      ) -
        JAKARTA_OFFSET -
        (period - 1) * DAY,
    );

    const previousFrom = new Date(from.getTime() - period * DAY);
    const previousUntil = new Date(now.getTime() - period * DAY);
    const activeFrom = new Date(now.getTime() - 30 * DAY);
    const previousActiveFrom = new Date(now.getTime() - 60 * DAY);
    const activityFrom = new Date(
      Math.min(
        previousFrom.getTime(),
        previousActiveFrom.getTime(),
        from.getTime() - 30 * DAY,
      ),
    );

    const yesterday = new Date(now.getTime() - DAY);
    const twoDaysAgo = new Date(now.getTime() - 2 * DAY);
    const weekLater = new Date(now.getTime() + 7 * DAY);
    const rows = await this.prisma.$queryRaw<
      Array<{ dashboard: AdminDashboard; missingReceipts: bigint }>
    >(Prisma.sql`
      WITH activity AS MATERIALIZED (${userActivitySql(activityFrom, now)}),
      feature_tools(name, feature) AS (VALUES
        ('create_task','tasks'),('update_task','tasks'),('list_tasks','tasks'),
        ('create_reminder','reminders'),('update_reminder','reminders'),('list_reminders','reminders'),
        ('save_memory','memories'),('update_memory','memories'),('search_memories','memories'),
        ('write_daily_note','notes'),('read_daily_note','notes'),('search_daily_notes','notes'),
        ('create_custom_note','notes'),('update_custom_note','notes'),('read_custom_note','notes'),('search_notes','notes'),
        ('create_record_note','notes'),('change_record_schema','notes'),('add_record_rows','notes'),('update_record_rows','notes'),('delete_record_rows','notes'),('read_record_note_content','notes'),('query_record_notes','notes'),
        ('save_contact','contacts'),('resolve_contact','contacts'),('list_contacts','contacts'),
        ('create_calendar_event','calendar'),('update_calendar_event','calendar'),('list_calendar_events','calendar'),
        ('save_attached_files','documents'),('read_document','documents'),('search_documents','documents')
      ), feature_activity AS (
        SELECT "userId",feature FROM activity WHERE "occurredAt">=${activeFrom} AND feature<>'chat'
        UNION ALL
        SELECT m."userId", f.feature FROM tool_invocation t JOIN feature_tools f ON f.name=t.name
          JOIN assistant_run r ON r.id=t."assistantRunId" JOIN message m ON m.id=r."inputMessageId"
        WHERE r."createdAt">=${activeFrom} AND t.status='completed' AND t."createdAt">=${activeFrom} AND t."createdAt"<${now}
          AND m.role='user' AND m."createdAt">=${activeFrom} AND m."createdAt"<${now}
      ),
      payments AS MATERIALIZED (${verifiedPaymentsSql(environment)}),
      first_payments AS MATERIALIZED (SELECT "userId", MIN("verifiedAt") AS at FROM payments GROUP BY "userId"),
      accounts AS MATERIALIZED (
        SELECT u.id, u.name, u.email, u."createdAt", u.banned, u."onboardingCompleted", b."paidUntil",
          COALESCE(b."trialStartsAt", CASE WHEN ${rolloutAt}::timestamp IS NOT NULL THEN GREATEST(u."createdAt", ${rolloutAt}::timestamp) END) AS "trialStartsAt",
          COALESCE(b."trialEndsAt", CASE WHEN ${rolloutAt}::timestamp IS NOT NULL THEN GREATEST(u."createdAt", ${rolloutAt}::timestamp) + (${BILLING_TRIAL_DAYS} * interval '1 day') END) AS "trialEndsAt",
          EXISTS (SELECT 1 FROM payments p WHERE p."userId"=u.id AND p."verifiedAt" < ${now} AND p."paidThrough" > ${now}) AS subscribed
        FROM "user" u LEFT JOIN billing_account b ON b."userId"=u.id
      ),
      messages AS MATERIALIZED (
        SELECT m.*, c.channel FROM message m JOIN conversation c ON c.id=m."conversationId"
        WHERE m.role='user' AND m."createdAt">=${previousFrom} AND m."createdAt"<${now}
      ),
      runs AS MATERIALIZED (
        SELECT * FROM assistant_run WHERE "createdAt">=${new Date(Math.min(previousFrom.getTime(), twoDaysAgo.getTime()))} AND "createdAt"<${now}
      ),
      days AS (SELECT generate_series((${from}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date,
        (${now}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date, interval '1 day')::date AS day),
      registrations_daily AS (
        SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date AS day, COUNT(*) AS registrations
        FROM "user" WHERE "createdAt">=${from} AND "createdAt"<${now} GROUP BY 1
      ), activity_daily AS (
        SELECT ("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date AS day, COUNT(DISTINCT "userId") AS active
        FROM activity WHERE "occurredAt">=${from} GROUP BY 1
      ), messages_daily AS (
        SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date AS day, COUNT(*) AS messages
        FROM messages WHERE "createdAt">=${from} GROUP BY 1
      ), runs_daily AS (
        SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date AS day, SUM("costUsd") AS cost
        FROM runs WHERE "createdAt">=${from} GROUP BY 1
      ), payments_daily AS (
        SELECT ("verifiedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date AS day, SUM(amount) AS revenue
        FROM payments WHERE "verifiedAt">=${from} AND "verifiedAt"<${now} GROUP BY 1
      ), daily AS MATERIALIZED (
        SELECT d.day, COALESCE(u.registrations,0) AS registrations, COALESCE(a.active,0) AS active,
          COALESCE(m.messages,0) AS messages, COALESCE(r.cost,0) AS cost, COALESCE(p.revenue,0) AS revenue
        FROM days d LEFT JOIN registrations_daily u USING(day) LEFT JOIN activity_daily a USING(day)
          LEFT JOIN messages_daily m USING(day) LEFT JOIN runs_daily r USING(day) LEFT JOIN payments_daily p USING(day)
      ),
      periods AS (SELECT ${from}::timestamp AS start, ${now}::timestamp AS finish, 'current' AS name
        UNION ALL SELECT ${previousFrom}::timestamp, ${previousUntil}::timestamp, 'previous'),
      totals AS MATERIALIZED (
        SELECT w.name,
          (SELECT COUNT(*) FROM "user" u WHERE u."createdAt">=w.start AND u."createdAt"<w.finish) AS registrations,
          (SELECT COUNT(*) FROM accounts a WHERE a."trialEndsAt">=w.start AND a."trialEndsAt"<w.finish) AS trials,
          (SELECT COUNT(*) FROM accounts a JOIN first_payments f ON f."userId"=a.id WHERE a."trialEndsAt">=w.start AND a."trialEndsAt"<w.finish AND f.at>=a."trialStartsAt" AND f.at<w.finish) AS converted,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."verifiedAt">=w.start AND p."verifiedAt"<w.finish),0) AS revenue,
          (SELECT COUNT(*) FROM payments p WHERE p."verifiedAt">=w.start AND p."verifiedAt"<w.finish) AS payments,
          COALESCE((SELECT SUM(r."costUsd") FROM runs r WHERE r."createdAt">=w.start AND r."createdAt"<w.finish),0) AS cost
        FROM periods w
      ),
      reliability AS (
        SELECT COUNT(*) FILTER (WHERE status='completed' AND "createdAt">=${yesterday}) AS completed,
          COUNT(*) FILTER (WHERE status='failed' AND "createdAt">=${yesterday}) AS failed,
          COUNT(*) FILTER (WHERE status='completed' AND "createdAt">=${twoDaysAgo} AND "createdAt"<${yesterday}) AS "previousCompleted",
          COUNT(*) FILTER (WHERE status='failed' AND "createdAt">=${twoDaysAgo} AND "createdAt"<${yesterday}) AS "previousFailed"
        FROM runs
      )
      SELECT
        (SELECT COUNT(*) FROM billing_payment p JOIN billing_order o ON o.id=p."orderId"
          WHERE p.environment=${environment} AND o.status='paid' AND o."userId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM payments verified WHERE verified."orderId"=p."orderId" AND verified."paidThrough" IS NOT NULL))::bigint AS "missingReceipts",
        json_build_object(
          'generatedAt',${now.toISOString()}::text, 'from',${from.toISOString()}::text, 'until',${now.toISOString()}::text, 'period',${period}::int, 'timezone','Asia/Jakarta','environment',${environment}::text,
          'overview', json_build_object(
            'totalUsers',(SELECT COUNT(*) FROM accounts), 'allowedUsers',(SELECT COUNT(*) FROM accounts WHERE NOT banned),
            'activeUsers',(SELECT COUNT(DISTINCT "userId") FROM activity WHERE "occurredAt">=${activeFrom}),
            'subscribedUsers',(SELECT COUNT(*) FROM accounts WHERE subscribed), 'bannedUsers',(SELECT COUNT(*) FROM accounts WHERE banned),
            'activeSessions',(SELECT COUNT(*) FROM session WHERE "expiresAt">${now}),
            'storageBytes',COALESCE((SELECT SUM(size) FROM file_asset),0), 'llmCostUsd',COALESCE((SELECT SUM("costUsd") FROM assistant_run),0),
            'llmCostBreakdown',COALESCE((SELECT json_agg(x) FROM (SELECT model,SUM("costUsd") AS "costUsd" FROM assistant_run WHERE "costUsd" IS NOT NULL GROUP BY model ORDER BY SUM("costUsd") DESC) x),'[]'::json)),
          'metrics',json_build_object(
            'registrations',json_build_object('value',c.registrations,'previous',p.registrations,'series',(SELECT json_agg(registrations ORDER BY day) FROM daily)),
            'activeUsers',json_build_object('value',(SELECT COUNT(DISTINCT "userId") FROM activity WHERE "occurredAt">=${activeFrom}), 'previous',(SELECT COUNT(DISTINCT "userId") FROM activity WHERE "occurredAt">=${previousActiveFrom} AND "occurredAt"<${activeFrom}),'series','[]'::json),
            'conversion',json_build_object('value',CASE WHEN c.trials>0 THEN c.converted*100.0/c.trials ELSE 0 END,'previous',CASE WHEN p.trials>0 THEN p.converted*100.0/p.trials ELSE 0 END,'converted',c.converted,'trials',c.trials,'series','[]'::json),
            'revenue',json_build_object('value',c.revenue,'previous',p.revenue,'payments',c.payments,'series',(SELECT json_agg(revenue ORDER BY day) FROM daily)),
            'cost',json_build_object('value',c.cost,'previous',p.cost,'series',(SELECT json_agg(cost ORDER BY day) FROM daily)),
            'reliability',json_build_object('value',CASE WHEN r.completed+r.failed>0 THEN r.completed*100.0/(r.completed+r.failed) ELSE 0 END,'previous',CASE WHEN r."previousCompleted"+r."previousFailed">0 THEN r."previousCompleted"*100.0/(r."previousCompleted"+r."previousFailed") ELSE 0 END,'completed',r.completed,'failed',r.failed,'series','[]'::json)),
          'attention',json_build_object('failedRuns',r.failed,'totalRuns',r.completed+r.failed,
            'expiringTrials',(SELECT COUNT(*) FROM accounts WHERE "trialEndsAt">${now} AND "trialEndsAt"<=${weekLater} AND ("paidUntil" IS NULL OR "paidUntil"<=${now})),
            'activeExpiringTrials',(SELECT COUNT(*) FROM accounts a WHERE a."trialEndsAt">${now} AND a."trialEndsAt"<=${weekLater} AND (a."paidUntil" IS NULL OR a."paidUntil"<=${now}) AND EXISTS(SELECT 1 FROM activity x WHERE x."userId"=a.id AND x."occurredAt">=${activeFrom})),
            'expiringPlus',(SELECT COUNT(*) FROM accounts WHERE subscribed AND "paidUntil">${now} AND "paidUntil"<=${weekLater})),
          'failures',COALESCE((SELECT json_agg(x) FROM (SELECT id,model,("createdAt" AT TIME ZONE 'UTC') AS "createdAt",left("errorMessage",300) AS "errorMessage" FROM runs WHERE status='failed' AND "createdAt">=${yesterday} ORDER BY "createdAt" DESC LIMIT 25) x),'[]'::json),
          'daily',COALESCE((SELECT json_agg(json_build_object('date',to_char(day,'YYYY-MM-DD'),'registrations',registrations,'activeUsers',active,'messages',messages,'costUsd',cost) ORDER BY day) FROM daily),'[]'::json),
          'channels',COALESCE((SELECT json_agg(x) FROM (SELECT channel,COUNT(*) AS messages FROM messages WHERE "createdAt">=${from} GROUP BY channel ORDER BY COUNT(*) DESC) x),'[]'::json),
          'adoption',COALESCE((SELECT json_agg(x) FROM (SELECT feature,COUNT(DISTINCT "userId") AS users FROM feature_activity GROUP BY feature ORDER BY COUNT(DISTINCT "userId") DESC) x),'[]'::json),
          'acquisition',COALESCE((SELECT json_agg(x) FROM (SELECT COALESCE(NULLIF(ua."utmSource",''),'langsung') AS source,COUNT(*) AS users,COUNT(f."userId") AS converted FROM accounts a LEFT JOIN user_attribution ua ON ua."userId"=a.id LEFT JOIN first_payments f ON f."userId"=a.id AND f.at<${now} WHERE a."createdAt">=${from} AND a."createdAt"<${now} GROUP BY COALESCE(NULLIF(ua."utmSource",''),'langsung') ORDER BY COUNT(*) DESC LIMIT 8) x),'[]'::json),
          'models',COALESCE((SELECT json_agg(x) FROM (SELECT model,SUM("costUsd") AS "costUsd" FROM runs WHERE "createdAt">=${from} AND "costUsd" IS NOT NULL GROUP BY model ORDER BY SUM("costUsd") DESC) x),'[]'::json),
          'recentUsers',COALESCE((SELECT json_agg(x) FROM (SELECT id,name,email,("createdAt" AT TIME ZONE 'UTC') AS "createdAt","onboardingCompleted",CASE WHEN "paidUntil">${now} THEN 'plus' WHEN "trialEndsAt">${now} THEN 'trial' WHEN "trialEndsAt" IS NULL THEN 'disabled' ELSE 'expired' END AS plan FROM accounts ORDER BY "createdAt" DESC,id DESC LIMIT 5) x),'[]'::json)
        ) AS dashboard
      FROM totals c CROSS JOIN totals p CROSS JOIN reliability r WHERE c.name='current' AND p.name='previous'
    `);

    const row = rows[0];

    if (!row || row.missingReceipts > 0n) {
      this.logger.error(
        `Dashboard payment ledger incomplete: ${row ? row.missingReceipts.toString() : 'missing result'}`,
      );
      throw new Error('Dashboard requires complete verified payment receipts');
    }

    return row.dashboard;
  }
}
