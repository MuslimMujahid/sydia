import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  AdminAnalyticsInput,
  AdminBucket,
  AdminPeriod,
  IAdminAnalyticsRepository,
} from '../interfaces/admin-analytics.repository.interface';
import { userActivitySql, verifiedPaymentsSql } from './admin-analytics.sql';

const DAY = 86_400_000;
const JAKARTA_OFFSET = 7 * 3_600_000;
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

export type AdminPeriodWindow = {
  from: Date;
  previousFrom: Date;
  previousUntil: Date;
  bucket: AdminBucket;
};

/**
 * The reporting window for a period and the equal-length window before it.
 * "today" starts at midnight in Asia/Jakarta and compares with yesterday up to
 * the same time; "24h" is rolling. Day periods end with today, inclusive.
 */
export function adminPeriodWindow(
  now: Date,
  period: AdminPeriod,
): AdminPeriodWindow {
  const local = new Date(now.getTime() + JAKARTA_OFFSET);
  const midnight =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    JAKARTA_OFFSET;

  if (period === 'today')
    return {
      from: new Date(midnight),
      previousFrom: new Date(midnight - DAY),
      previousUntil: new Date(now.getTime() - DAY),
      bucket: 'hour',
    };

  if (period === '24h')
    return {
      from: new Date(now.getTime() - DAY),
      previousFrom: new Date(now.getTime() - 2 * DAY),
      previousUntil: new Date(now.getTime() - DAY),
      bucket: 'hour',
    };

  const days = PERIOD_DAYS[period];
  const from = new Date(midnight - (days - 1) * DAY);

  return {
    from,
    previousFrom: new Date(from.getTime() - days * DAY),
    previousUntil: new Date(now.getTime() - days * DAY),
    bucket: 'day',
  };
}

type DashboardRow = Awaited<ReturnType<IAdminAnalyticsRepository['dashboard']>>;

@Injectable()
export class PrismaAdminAnalyticsRepository implements IAdminAnalyticsRepository {
  private readonly logger = new Logger(PrismaAdminAnalyticsRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async dashboard({
    now,
    period,
    environment,
    rolloutAt,
  }: AdminAnalyticsInput): Promise<DashboardRow> {
    const { from, previousFrom, previousUntil, bucket } = adminPeriodWindow(
      now,
      period,
    );

    // Short periods count users active in the period; day periods keep the
    // 30-day definition used across the admin.
    const hourly = bucket === 'hour';
    const activeFrom = hourly ? from : new Date(now.getTime() - 30 * DAY);
    const previousActiveFrom = hourly
      ? previousFrom
      : new Date(now.getTime() - 60 * DAY);

    const previousActiveUntil = hourly ? previousUntil : activeFrom;
    const monthAgo = new Date(now.getTime() - 30 * DAY);
    const activityFrom = new Date(
      Math.min(
        previousFrom.getTime(),
        previousActiveFrom.getTime(),
        from.getTime() - 30 * DAY,
      ),
    );

    const unit = Prisma.raw(`'${bucket}'`);
    const step = Prisma.raw(`interval '1 ${bucket}'`);
    const local = (column: Prisma.Sql) =>
      Prisma.sql`date_trunc(${unit}, ${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')`;

    const yesterday = new Date(now.getTime() - DAY);
    const twoDaysAgo = new Date(now.getTime() - 2 * DAY);
    const weekLater = new Date(now.getTime() + 7 * DAY);
    const rows = await this.prisma.$queryRaw<
      Array<{ dashboard: DashboardRow; missingReceipts: bigint }>
    >(Prisma.sql`
      WITH activity AS MATERIALIZED (${userActivitySql(activityFrom, now)}),
      feature_tools(name, feature) AS (VALUES
        ('create_task','tasks'),('update_task','tasks'),('list_tasks','tasks'),
        ('create_reminder','reminders'),('update_reminder','reminders'),('list_reminders','reminders'),('acknowledge_reminder','reminders'),('snooze_reminder','reminders'),
        ('save_memory','memories'),('update_memory','memories'),('search_memories','memories'),
        ('write_daily_note','notes'),('read_daily_note','notes'),('search_daily_notes','notes'),
        ('create_custom_note','notes'),('update_custom_note','notes'),('read_custom_note','notes'),('search_notes','notes'),
        ('create_record_note','notes'),('change_record_schema','notes'),('add_record_rows','notes'),('update_record_rows','notes'),('delete_record_rows','notes'),('read_record_note_content','notes'),('query_record_notes','notes'),
        ('save_contact','contacts'),('resolve_contact','contacts'),('list_contacts','contacts'),
        ('create_calendar_event','calendar'),('update_calendar_event','calendar'),('list_calendar_events','calendar'),
        ('save_attached_files','documents'),('read_document','documents'),('search_documents','documents')
      ), feature_activity AS (
        SELECT "userId",feature FROM activity WHERE "occurredAt">=${monthAgo} AND feature<>'chat'
        UNION ALL
        SELECT m."userId", f.feature FROM tool_invocation t JOIN feature_tools f ON f.name=t.name
          JOIN assistant_run r ON r.id=t."assistantRunId" JOIN message m ON m.id=r."inputMessageId"
        WHERE r."createdAt">=${monthAgo} AND t.status='completed' AND t."createdAt">=${monthAgo} AND t."createdAt"<${now}
          AND m.role='user' AND m."createdAt">=${monthAgo} AND m."createdAt"<${now}
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
        SELECT * FROM assistant_run WHERE "createdAt">=${twoDaysAgo} AND "createdAt"<${now}
      ),
      usage AS MATERIALIZED (
        SELECT * FROM model_usage WHERE "createdAt">=${previousFrom} AND "createdAt"<${now}
      ),
      period_usage AS MATERIALIZED (SELECT * FROM usage WHERE "createdAt">=${from}),
      buckets AS (SELECT generate_series(${local(Prisma.sql`${from}::timestamp`)},
        ${local(Prisma.sql`${now}::timestamp`)}, ${step}) AS day),
      registrations_daily AS (
        SELECT ${local(Prisma.sql`"createdAt"`)} AS day, COUNT(*) AS registrations
        FROM "user" WHERE "createdAt">=${from} AND "createdAt"<${now} GROUP BY 1
      ), activity_daily AS (
        SELECT ${local(Prisma.sql`"occurredAt"`)} AS day, COUNT(DISTINCT "userId") AS active
        FROM activity WHERE "occurredAt">=${from} GROUP BY 1
      ), messages_daily AS (
        SELECT ${local(Prisma.sql`"createdAt"`)} AS day, COUNT(*) AS messages
        FROM messages WHERE "createdAt">=${from} GROUP BY 1
      ), usage_daily AS (
        SELECT ${local(Prisma.sql`"createdAt"`)} AS day, SUM("costUsd") AS cost
        FROM period_usage GROUP BY 1
      ), payments_daily AS (
        SELECT ${local(Prisma.sql`"verifiedAt"`)} AS day, SUM(amount) AS revenue
        FROM payments WHERE "verifiedAt">=${from} AND "verifiedAt"<${now} GROUP BY 1
      ), daily AS MATERIALIZED (
        SELECT d.day, COALESCE(u.registrations,0) AS registrations, COALESCE(a.active,0) AS active,
          COALESCE(m.messages,0) AS messages, COALESCE(r.cost,0) AS cost, COALESCE(p.revenue,0) AS revenue
        FROM buckets d LEFT JOIN registrations_daily u USING(day) LEFT JOIN activity_daily a USING(day)
          LEFT JOIN messages_daily m USING(day) LEFT JOIN usage_daily r USING(day) LEFT JOIN payments_daily p USING(day)
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
          COALESCE((SELECT SUM(u."costUsd") FROM usage u WHERE u."createdAt">=w.start AND u."createdAt"<w.finish),0) AS cost
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
          'generatedAt',${now.toISOString()}::text, 'from',${from.toISOString()}::text, 'until',${now.toISOString()}::text, 'period',${period}::text,'bucket',${bucket}::text, 'timezone','Asia/Jakarta','environment',${environment}::text,
          'overview', json_build_object(
            'totalUsers',(SELECT COUNT(*) FROM accounts), 'allowedUsers',(SELECT COUNT(*) FROM accounts WHERE NOT banned),
            'activeUsers',(SELECT COUNT(DISTINCT "userId") FROM activity WHERE "occurredAt">=${monthAgo}),
            'subscribedUsers',(SELECT COUNT(*) FROM accounts WHERE subscribed), 'bannedUsers',(SELECT COUNT(*) FROM accounts WHERE banned),
            'activeSessions',(SELECT COUNT(*) FROM session WHERE "expiresAt">${now}),
            'storageBytes',COALESCE((SELECT SUM(size) FROM file_asset),0), 'llmCostUsd',COALESCE((SELECT SUM("costUsd") FROM model_usage),0),
            'llmCostBreakdown',COALESCE((SELECT json_agg(x) FROM (SELECT model,SUM("costUsd") AS "costUsd" FROM model_usage WHERE "costUsd" IS NOT NULL GROUP BY model ORDER BY SUM("costUsd") DESC) x),'[]'::json)),
          'metrics',json_build_object(
            'registrations',json_build_object('value',c.registrations,'previous',p.registrations,'series',(SELECT json_agg(registrations ORDER BY day) FROM daily)),
            'activeUsers',json_build_object('value',(SELECT COUNT(DISTINCT "userId") FROM activity WHERE "occurredAt">=${activeFrom}), 'previous',(SELECT COUNT(DISTINCT "userId") FROM activity WHERE "occurredAt">=${previousActiveFrom} AND "occurredAt"<${previousActiveUntil}),'series','[]'::json),
            'conversion',json_build_object('value',CASE WHEN c.trials>0 THEN c.converted*100.0/c.trials ELSE 0 END,'previous',CASE WHEN p.trials>0 THEN p.converted*100.0/p.trials ELSE 0 END,'converted',c.converted,'trials',c.trials,'series','[]'::json),
            'revenue',json_build_object('value',c.revenue,'previous',p.revenue,'payments',c.payments,'series',(SELECT json_agg(revenue ORDER BY day) FROM daily)),
            'cost',json_build_object('value',c.cost,'previous',p.cost,'series',(SELECT json_agg(cost ORDER BY day) FROM daily)),
            'reliability',json_build_object('value',CASE WHEN r.completed+r.failed>0 THEN r.completed*100.0/(r.completed+r.failed) ELSE 0 END,'previous',CASE WHEN r."previousCompleted"+r."previousFailed">0 THEN r."previousCompleted"*100.0/(r."previousCompleted"+r."previousFailed") ELSE 0 END,'completed',r.completed,'failed',r.failed,'series','[]'::json)),
          'attention',json_build_object('failedRuns',r.failed,'totalRuns',r.completed+r.failed,
            'expiringTrials',(SELECT COUNT(*) FROM accounts WHERE "trialEndsAt">${now} AND "trialEndsAt"<=${weekLater} AND ("paidUntil" IS NULL OR "paidUntil"<=${now})),
            'activeExpiringTrials',(SELECT COUNT(*) FROM accounts a WHERE a."trialEndsAt">${now} AND a."trialEndsAt"<=${weekLater} AND (a."paidUntil" IS NULL OR a."paidUntil"<=${now}) AND EXISTS(SELECT 1 FROM activity x WHERE x."userId"=a.id AND x."occurredAt">=${monthAgo})),
            'expiringPlus',(SELECT COUNT(*) FROM accounts WHERE subscribed AND "paidUntil">${now} AND "paidUntil"<=${weekLater})),
          'failures',COALESCE((SELECT json_agg(x) FROM (SELECT id,model,("createdAt" AT TIME ZONE 'UTC') AS "createdAt",left("errorMessage",300) AS "errorMessage" FROM runs WHERE status='failed' AND "createdAt">=${yesterday} ORDER BY "createdAt" DESC LIMIT 25) x),'[]'::json),
          'timeline',COALESCE((SELECT json_agg(json_build_object('start',to_char(day,'YYYY-MM-DD"T"HH24:MI:SS"+07:00"'),'registrations',registrations,'activeUsers',active,'messages',messages,'costUsd',cost) ORDER BY day) FROM daily),'[]'::json),
          'costs',json_build_object(
            'byKind',COALESCE((SELECT json_agg(x) FROM (SELECT kind,COALESCE(SUM("costUsd"),0) AS "costUsd",COUNT(*) AS calls FROM period_usage GROUP BY kind ORDER BY SUM("costUsd") DESC NULLS LAST) x),'[]'::json),
            'breakdown',COALESCE((SELECT json_agg(x) FROM (SELECT kind,job,stage,COALESCE(SUM("costUsd"),0) AS "costUsd",COUNT(*) AS calls,
                COUNT(*) FILTER (WHERE status='failed') AS "failedCalls",COUNT(*) FILTER (WHERE "costMissing") AS "unpricedCalls"
              FROM period_usage GROUP BY kind,job,stage ORDER BY SUM("costUsd") DESC NULLS LAST LIMIT 40) x),'[]'::json),
            'topAccounts',COALESCE((SELECT json_agg(x) FROM (SELECT u.id AS "userId",u.name,u.email,SUM(p."costUsd") AS "costUsd",COUNT(*) AS calls,
                (SELECT COUNT(*) FROM messages m WHERE m."userId"=u.id AND m."createdAt">=${from}) AS messages
              FROM period_usage p JOIN "user" u ON u.id=p."userId" GROUP BY u.id,u.name,u.email
              ORDER BY SUM(p."costUsd") DESC NULLS LAST,u.id LIMIT 10) x),'[]'::json),
            'unattributedUsd',COALESCE((SELECT SUM("costUsd") FROM period_usage WHERE "userId" IS NULL AND kind<>'hindsight'),0),
            'failedUsd',COALESCE((SELECT SUM("costUsd") FROM period_usage WHERE status='failed'),0),
            'unpricedCalls',(SELECT COUNT(*) FROM period_usage WHERE "costMissing"),
            'trackedSince',(SELECT to_char(MIN("createdAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM model_usage WHERE left(id, 9)<>'backfill_')),
          'channels',COALESCE((SELECT json_agg(x) FROM (SELECT channel,COUNT(*) AS messages FROM messages WHERE "createdAt">=${from} GROUP BY channel ORDER BY COUNT(*) DESC) x),'[]'::json),
          'adoption',COALESCE((SELECT json_agg(x) FROM (SELECT feature,COUNT(DISTINCT "userId") AS users FROM feature_activity GROUP BY feature ORDER BY COUNT(DISTINCT "userId") DESC) x),'[]'::json),
          'acquisition',COALESCE((SELECT json_agg(x) FROM (SELECT COALESCE(NULLIF(ua."utmSource",''),'langsung') AS source,COUNT(*) AS users,COUNT(f."userId") AS converted FROM accounts a LEFT JOIN user_attribution ua ON ua."userId"=a.id LEFT JOIN first_payments f ON f."userId"=a.id AND f.at<${now} WHERE a."createdAt">=${from} AND a."createdAt"<${now} GROUP BY COALESCE(NULLIF(ua."utmSource",''),'langsung') ORDER BY COUNT(*) DESC LIMIT 8) x),'[]'::json),
          'models',COALESCE((SELECT json_agg(x) FROM (SELECT model,SUM("costUsd") AS "costUsd" FROM period_usage WHERE "costUsd" IS NOT NULL AND kind<>'hindsight' GROUP BY model ORDER BY SUM("costUsd") DESC) x),'[]'::json),
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
