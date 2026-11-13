import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import {
  ACTIVITY_FEATURES,
  type AdminAnalyticsInput,
  type AdminBucket,
  type AdminCostsData,
  type AdminFeatureDetailData,
  type AdminPeriod,
  type AdminSummaryData,
  type AdminUsageData,
  type AdminUserInsightsData,
  type AdminWindow,
  type ActivityFeatureKey,
  type IAdminAnalyticsRepository,
} from '../interfaces/admin-analytics.repository.interface';
import {
  actionsSql,
  costRowsSql,
  planSql,
  reportQuery,
  verifiedPaymentsSql,
} from './admin-analytics.sql';

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

/** Bucket starts of a window, in Jakarta time with offset. */
export function windowBuckets(
  from: Date,
  now: Date,
  bucket: AdminBucket,
): string[] {
  const step = bucket === 'hour' ? 3_600_000 : DAY;

  const floor = (time: number) => {
    const local = time + JAKARTA_OFFSET;

    return local - (local % step) - JAKARTA_OFFSET;
  };

  const starts: string[] = [];

  for (let time = floor(from.getTime()); time <= now.getTime(); time += step) {
    const local = new Date(time + JAKARTA_OFFSET).toISOString().slice(0, 19);
    starts.push(`${local}+07:00`);
  }

  return starts;
}

/** Shared SQL pieces for one analytics read. */
function context(input: AdminAnalyticsInput) {
  const { now, period } = input;
  const window = adminPeriodWindow(now, period);
  const unit = Prisma.raw(`'${window.bucket}'`);
  const local = (column: Prisma.Sql) =>
    Prisma.sql`date_trunc(${unit}, ${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')`;

  const buckets = windowBuckets(window.from, now, window.bucket);
  const meta: AdminWindow = {
    generatedAt: now.toISOString(),
    from: window.from.toISOString(),
    until: now.toISOString(),
    period,
    bucket: window.bucket,
    timezone: 'Asia/Jakarta',
    buckets,
  };

  // Bucket starts as local timestamps, in order, for series aggregation.
  const bucketsSql = Prisma.sql`SELECT generate_series(${local(Prisma.sql`${window.from}::timestamp`)}, ${local(Prisma.sql`${now}::timestamp`)}, ${Prisma.raw(`interval '1 ${window.bucket}'`)}) AS b`;
  const day = (column: Prisma.Sql) =>
    Prisma.sql`date_trunc('day', ${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')`;

  return { ...window, now, local, day, meta, bucketsSql };
}

/** Totals over [start, end) from the `acts`, `msgs`, `costs`, `raw` and `payments` CTEs. */
function totalsSql(start: Date, end: Date): Prisma.Sql {
  const inWindow = (column: string) =>
    Prisma.sql`${Prisma.raw(column)} >= ${start} AND ${Prisma.raw(column)} < ${end}`;

  return Prisma.sql`json_build_object(
    'activeUsers',(SELECT COUNT(DISTINCT "userId") FROM acts WHERE ${inWindow('"occurredAt"')}),
    'messages',(SELECT COUNT(*) FROM msgs WHERE ${inWindow('"createdAt"')}),
    'costUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE ${inWindow('"createdAt"')}),0),
    'interactiveUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE NOT background AND ${inWindow('"createdAt"')}),0),
    'backgroundUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE background AND ${inWindow('"createdAt"')}),0),
    'wastedUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE wasted AND ${inWindow('"createdAt"')}),0),
    'revenueIdr',COALESCE((SELECT SUM(amount) FROM payments WHERE ${inWindow('"verifiedAt"')}),0),
    'payments',(SELECT COUNT(*) FROM payments WHERE ${inWindow('"verifiedAt"')}),
    'inputTokens',COALESCE((SELECT SUM("inputTokens") FROM raw WHERE kind='message' AND ${inWindow('"createdAt"')}),0),
    'cachedInputTokens',COALESCE((SELECT SUM("cachedInputTokens") FROM raw WHERE kind='message' AND ${inWindow('"createdAt"')}),0),
    'unpricedCalls',(SELECT COUNT(*) FROM raw WHERE "costMissing" AND ${inWindow('"createdAt"')})
  )`;
}

/** Feature → cost object over [start, end) from `costs`. */
function featureCostsSql(start: Date, end: Date): Prisma.Sql {
  return Prisma.sql`COALESCE((SELECT json_object_agg(feature, total) FROM (
    SELECT feature, SUM(cost) AS total FROM costs
    WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY feature HAVING SUM(cost) > 0
  ) x), '{}'::json)`;
}

@Injectable()
export class PrismaAdminAnalyticsRepository implements IAdminAnalyticsRepository {
  private readonly logger = new Logger(PrismaAdminAnalyticsRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async summary(input: AdminAnalyticsInput): Promise<AdminSummaryData> {
    const c = context(input);
    const { now, from, previousFrom, previousUntil, local, day } = c;
    const yesterday = new Date(now.getTime() - DAY);
    const weekLater = new Date(now.getTime() + 7 * DAY);
    const monthAgo = new Date(now.getTime() - 30 * DAY);
    const normalFrom = new Date(from.getTime() - 7 * DAY);
    const plan = planSql(now, input.rolloutAt);
    const trialEnd = Prisma.sql`COALESCE(b."trialEndsAt", CASE WHEN ${input.rolloutAt}::timestamp IS NOT NULL THEN GREATEST(u."createdAt", ${input.rolloutAt}::timestamp) + (${BILLING_TRIAL_DAYS} * interval '1 day') END)`;
    const hourly = c.bucket === 'hour';
    const historyFrom = hourly
      ? new Date(Math.min(previousFrom.getTime(), normalFrom.getTime()))
      : previousFrom;

    const normal = hourly
      ? Prisma.sql`(SELECT json_agg(json_build_object(
          'messages',json_build_array(n.m25,n.m75),'costUsd',json_build_array(n.c25,n.c75)) ORDER BY bk.b)
        FROM (${c.bucketsSql}) bk JOIN (
          SELECT h, percentile_cont(0.25) WITHIN GROUP (ORDER BY m) AS m25, percentile_cont(0.75) WITHIN GROUP (ORDER BY m) AS m75,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY cost) AS c25, percentile_cont(0.75) WITHIN GROUP (ORDER BY cost) AS c75
          FROM (
            SELECT s.h, s.d,
              (SELECT COUNT(*) FROM msgs WHERE ${day(Prisma.sql`"createdAt"`)} = s.d AND extract(hour FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta') = s.h) AS m,
              COALESCE((SELECT SUM(cost) FROM costs WHERE ${day(Prisma.sql`"createdAt"`)} = s.d AND extract(hour FROM "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta') = s.h),0) AS cost
            FROM generate_series(1,7) g(n), generate_series(0,23) s0(h),
              LATERAL (SELECT s0.h, ${day(Prisma.sql`${now}::timestamp`)} - g.n * interval '1 day' AS d) s
          ) samples GROUP BY h
        ) n ON n.h = extract(hour FROM bk.b))`
      : Prisma.sql`NULL`;

    const series = (expression: Prisma.Sql) =>
      Prisma.sql`COALESCE((SELECT json_agg(v ORDER BY bk.b) FROM (SELECT bk.b, ${expression} AS v FROM (${c.bucketsSql}) bk) bk),'[]'::json)`;

    const rows = await reportQuery<
      Array<{
        data: Omit<AdminSummaryData, keyof AdminWindow>;
        missingReceipts: bigint;
      }>
    >(
      this.prisma,
      Prisma.sql`
      WITH acts AS MATERIALIZED (${actionsSql(historyFrom, now)}),
      msgs AS MATERIALIZED (
        SELECT m."userId", m."createdAt", c.channel FROM message m JOIN conversation c ON c.id = m."conversationId"
        WHERE m.role = 'user' AND m."createdAt" >= ${historyFrom} AND m."createdAt" < ${now}
      ),
      costs AS MATERIALIZED (${costRowsSql(historyFrom, now)}),
      raw AS MATERIALIZED (SELECT * FROM model_usage WHERE "createdAt" >= ${previousFrom} AND "createdAt" < ${now}),
      payments AS MATERIALIZED (${verifiedPaymentsSql(input.environment)}),
      people AS MATERIALIZED (
        SELECT u.id, u.name, u.email, u."createdAt", u."onboardingCompleted", ${plan} AS plan,
          ${trialEnd} AS "trialEndsAt", b."paidUntil",
          EXISTS (SELECT 1 FROM payments p WHERE p."userId" = u.id AND p."verifiedAt" < ${now} AND p."paidThrough" > ${now}) AS subscribed
        FROM "user" u LEFT JOIN billing_account b ON b."userId" = u.id
      ),
      active_ids AS (
        SELECT "userId" FROM acts WHERE "occurredAt" >= ${previousFrom}
        UNION SELECT "userId" FROM costs WHERE "userId" IS NOT NULL AND "createdAt" >= ${previousFrom}
      ),
      runs AS MATERIALIZED (SELECT * FROM assistant_run WHERE "createdAt" >= ${yesterday} AND "createdAt" < ${now})
      SELECT
        (SELECT COUNT(*) FROM billing_payment p JOIN billing_order o ON o.id = p."orderId"
          WHERE p.environment = ${input.environment} AND o.status = 'paid' AND o."userId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM payments v WHERE v."orderId" = p."orderId" AND v."paidThrough" IS NOT NULL))::bigint AS "missingReceipts",
        json_build_object(
          'totalAccounts',(SELECT COUNT(*) FROM people),
          'current',${totalsSql(from, now)},
          'previous',${totalsSql(previousFrom, previousUntil)},
          'series',json_build_object(
            'activeUsers',${series(Prisma.sql`(SELECT COUNT(DISTINCT "userId") FROM acts WHERE ${local(Prisma.sql`"occurredAt"`)} = bk.b AND "occurredAt" >= ${from})`)},
            'messages',${series(Prisma.sql`(SELECT COUNT(*) FROM msgs WHERE ${local(Prisma.sql`"createdAt"`)} = bk.b AND "createdAt" >= ${from})`)},
            'costUsd',${series(Prisma.sql`COALESCE((SELECT SUM(cost) FROM costs WHERE ${local(Prisma.sql`"createdAt"`)} = bk.b AND "createdAt" >= ${from}),0)`)},
            'interactiveUsd',${series(Prisma.sql`COALESCE((SELECT SUM(cost) FROM costs WHERE NOT background AND ${local(Prisma.sql`"createdAt"`)} = bk.b AND "createdAt" >= ${from}),0)`)},
            'backgroundUsd',${series(Prisma.sql`COALESCE((SELECT SUM(cost) FROM costs WHERE background AND ${local(Prisma.sql`"createdAt"`)} = bk.b AND "createdAt" >= ${from}),0)`)},
            'revenueIdr',${series(Prisma.sql`COALESCE((SELECT SUM(amount) FROM payments WHERE ${local(Prisma.sql`"verifiedAt"`)} = bk.b AND "verifiedAt" >= ${from} AND "verifiedAt" < ${now}),0)`)},
            'featureCosts',${series(Prisma.sql`COALESCE((SELECT json_object_agg(feature, total) FROM (SELECT feature, SUM(cost) AS total FROM costs WHERE ${local(Prisma.sql`"createdAt"`)} = bk.b AND "createdAt" >= ${from} GROUP BY feature HAVING SUM(cost) > 0) x),'{}'::json)`)}),
          'normal',${normal},
          'featureCosts',json_build_object('current',${featureCostsSql(from, now)},'previous',${featureCostsSql(previousFrom, previousUntil)}),
          'users',COALESCE((SELECT json_agg(x) FROM (
            SELECT p.id AS "userId", p.name, p.email, p.plan,
              (SELECT COUNT(*) FROM acts a WHERE a."userId" = p.id AND a."occurredAt" >= ${from}) AS actions,
              (SELECT COUNT(*) FROM acts a WHERE a."userId" = p.id AND a."occurredAt" >= ${previousFrom} AND a."occurredAt" < ${previousUntil}) AS "previousActions",
              (SELECT COUNT(DISTINCT ${day(Prisma.sql`a."occurredAt"`)}) FROM acts a WHERE a."userId" = p.id AND a."occurredAt" >= ${from}) AS "activeDays",
              COALESCE((SELECT SUM(cost) FROM costs k WHERE k."userId" = p.id AND k."createdAt" >= ${from}),0) AS "costUsd",
              COALESCE((SELECT SUM(cost) FROM costs k WHERE k."userId" = p.id AND k."createdAt" >= ${previousFrom} AND k."createdAt" < ${previousUntil}),0) AS "previousCostUsd",
              COALESCE((SELECT SUM(cost) FROM costs k WHERE k."userId" = p.id AND k.background AND k."createdAt" >= ${from}),0) AS "backgroundUsd",
              (SELECT feature FROM costs k WHERE k."userId" = p.id AND k."createdAt" >= ${previousFrom}
                GROUP BY feature
                HAVING SUM(cost) FILTER (WHERE k."createdAt" >= ${from}) > COALESCE(SUM(cost) FILTER (WHERE k."createdAt" < ${previousUntil}),0)
                ORDER BY SUM(cost) FILTER (WHERE k."createdAt" >= ${from}) - COALESCE(SUM(cost) FILTER (WHERE k."createdAt" < ${previousUntil}),0) DESC
                LIMIT 1) AS "growthFeature",
              (SELECT to_char(MIN(m."createdAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM message m WHERE m."userId" = p.id AND m.role = 'user') AS "firstMessageAt"
            FROM people p WHERE p.id IN (SELECT "userId" FROM active_ids)
          ) x),'[]'::json),
          'wastedTopStage',(SELECT stage FROM costs WHERE wasted AND "createdAt" >= ${from} GROUP BY stage ORDER BY SUM(cost) DESC LIMIT 1),
          'runs',json_build_object(
            'failed',(SELECT COUNT(*) FROM runs WHERE status = 'failed'),
            'total',(SELECT COUNT(*) FROM runs WHERE status IN ('completed','failed')),
            'lastFailedAt',(SELECT to_char(MAX("createdAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM runs WHERE status = 'failed'),
            'lastError',(SELECT left("errorMessage",300) FROM runs WHERE status = 'failed' ORDER BY "createdAt" DESC LIMIT 1)),
          'failures',COALESCE((SELECT json_agg(x) FROM (SELECT id, model, to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", left("errorMessage",300) AS "errorMessage" FROM runs WHERE status = 'failed' ORDER BY "createdAt" DESC LIMIT 25) x),'[]'::json),
          'expiring',json_build_object(
            'trials',(SELECT COUNT(*) FROM people WHERE "trialEndsAt" > ${now} AND "trialEndsAt" <= ${weekLater} AND ("paidUntil" IS NULL OR "paidUntil" <= ${now})),
            'activeTrials',(SELECT COUNT(*) FROM people p WHERE p."trialEndsAt" > ${now} AND p."trialEndsAt" <= ${weekLater} AND (p."paidUntil" IS NULL OR p."paidUntil" <= ${now}) AND EXISTS (SELECT 1 FROM message m WHERE m."userId" = p.id AND m.role = 'user' AND m."createdAt" >= ${monthAgo})),
            'plus',(SELECT COUNT(*) FROM people WHERE subscribed AND "paidUntil" > ${now} AND "paidUntil" <= ${weekLater})),
          'channels',COALESCE((SELECT json_agg(x ORDER BY x.messages DESC) FROM (SELECT channel, COUNT(*) AS messages, COUNT(DISTINCT "userId") AS users FROM msgs WHERE "createdAt" >= ${from} GROUP BY channel) x),'[]'::json),
          'newAccounts',COALESCE((SELECT json_agg(x ORDER BY x."createdAt" DESC) FROM (
            SELECT p.id, p.name, p.email, to_char(p."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
              (SELECT a."utmSource" FROM user_attribution a WHERE a."userId" = p.id) AS source,
              p."onboardingCompleted",
              (SELECT COUNT(*) FROM msgs m WHERE m."userId" = p.id) AS messages,
              (SELECT COUNT(DISTINCT feature) FROM acts a WHERE a."userId" = p.id) AS features
            FROM people p WHERE p."createdAt" >= ${from} AND p."createdAt" < ${now} ORDER BY p."createdAt" DESC LIMIT 10) x),'[]'::json)
        ) AS data
    `,
    );

    const row = rows[0];

    if (!row || row.missingReceipts > 0n) {
      this.logger.error(
        `Admin summary payment ledger incomplete: ${row ? row.missingReceipts.toString() : 'missing result'}`,
      );
      throw new Error(
        'Admin summary requires complete verified payment receipts',
      );
    }

    return { ...c.meta, ...row.data };
  }

  async usage(input: AdminAnalyticsInput): Promise<AdminUsageData> {
    const c = context(input);
    const { now, from, local, day } = c;
    const plan = planSql(now, input.rolloutAt);
    const features = Prisma.join(
      ACTIVITY_FEATURES.map((feature) => Prisma.sql`(${feature}::text)`),
    );

    const rows = await reportQuery<
      Array<{ data: Omit<AdminUsageData, keyof AdminWindow> }>
    >(
      this.prisma,
      Prisma.sql`
      WITH acts AS MATERIALIZED (${actionsSql(from, now)}),
      costs AS MATERIALIZED (${costRowsSql(from, now)}),
      feature_list(feature) AS (VALUES ${features})
      SELECT json_build_object(
        'totalAccounts',(SELECT COUNT(*) FROM "user"),
        'dormantAccounts',(SELECT COUNT(*) FROM "user" u
          WHERE EXISTS (SELECT 1 FROM message m WHERE m."userId" = u.id AND m.role = 'user' AND m."createdAt" < ${from})
          AND NOT EXISTS (SELECT 1 FROM acts a WHERE a."userId" = u.id)),
        'neverActiveAccounts',(SELECT COUNT(*) FROM "user" u
          WHERE NOT EXISTS (SELECT 1 FROM message m WHERE m."userId" = u.id AND m.role = 'user' AND m."createdAt" < ${now})),
        'users',COALESCE((SELECT json_agg(x) FROM (
          SELECT u.id AS "userId", u.name, u.email, ${plan} AS plan,
            (SELECT COUNT(DISTINCT ${day(Prisma.sql`a."occurredAt"`)}) FROM acts a WHERE a."userId" = u.id) AS "activeDays",
            (SELECT json_object_agg(feature, n) FROM (SELECT feature, COUNT(*) AS n FROM acts a WHERE a."userId" = u.id GROUP BY feature) f) AS actions,
            COALESCE((SELECT SUM(cost) FROM costs k WHERE k."userId" = u.id),0) AS "costUsd",
            COALESCE((SELECT json_object_agg(feature, total) FROM (SELECT feature, SUM(cost) AS total FROM costs k WHERE k."userId" = u.id GROUP BY feature HAVING SUM(cost) > 0) f),'{}'::json) AS costs,
            (SELECT json_agg(v ORDER BY bk.b) FROM (SELECT bk.b, (SELECT COUNT(*) FROM acts a WHERE a."userId" = u.id AND ${local(Prisma.sql`a."occurredAt"`)} = bk.b) AS v FROM (${c.bucketsSql}) bk) bk) AS activity
          FROM "user" u LEFT JOIN billing_account b ON b."userId" = u.id
          WHERE u.id IN (SELECT "userId" FROM acts)
        ) x),'[]'::json),
        'features',(SELECT json_agg(json_build_object(
            'feature',fl.feature,
            'users',(SELECT COUNT(DISTINCT "userId") FROM acts a WHERE a.feature = fl.feature),
            'actions',(SELECT COUNT(*) FROM acts a WHERE a.feature = fl.feature),
            'returning',(SELECT COUNT(*) FROM (SELECT "userId" FROM acts a WHERE a.feature = fl.feature GROUP BY "userId" HAVING COUNT(DISTINCT ${day(Prisma.sql`a."occurredAt"`)}) >= 2) r),
            'perUser',COALESCE((SELECT json_agg(n ORDER BY n) FROM (SELECT COUNT(*) AS n FROM acts a WHERE a.feature = fl.feature GROUP BY "userId") p),'[]'::json),
            'series',(SELECT json_agg(v ORDER BY bk.b) FROM (SELECT bk.b, (SELECT COUNT(*) FROM acts a WHERE a.feature = fl.feature AND ${local(Prisma.sql`a."occurredAt"`)} = bk.b) AS v FROM (${c.bucketsSql}) bk) bk)
          )) FROM feature_list fl),
        'featureCosts',COALESCE((SELECT json_object_agg(feature, total) FROM (SELECT feature, SUM(cost) AS total FROM costs GROUP BY feature HAVING SUM(cost) > 0) x),'{}'::json),
        'pooledMemoryUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE kind = 'hindsight'),0)
      ) AS data
    `,
    );

    return { ...c.meta, ...rows[0]!.data };
  }

  async featureDetail(
    input: AdminAnalyticsInput & { feature: ActivityFeatureKey },
  ): Promise<AdminFeatureDetailData> {
    const c = context(input);
    const { now, from, local, day } = c;
    const { feature } = input;

    const rows = await reportQuery<
      Array<{
        data: Omit<AdminFeatureDetailData, keyof AdminWindow | 'feature'>;
      }>
    >(
      this.prisma,
      Prisma.sql`
      WITH acts AS MATERIALIZED (SELECT * FROM (${actionsSql(from, now)}) a WHERE a.feature = ${feature}),
      costs AS MATERIALIZED (SELECT * FROM (${costRowsSql(from, now)}) k WHERE k.feature = ${feature})
      SELECT json_build_object(
        'sources',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC) FROM (
          SELECT stage, MIN(kind) AS kind, COUNT(DISTINCT id) AS calls,
            COUNT(DISTINCT id) FILTER (WHERE attempt > 1) AS retried, SUM(cost) AS "costUsd"
          FROM costs GROUP BY stage) x),'[]'::json),
        'series',(SELECT json_agg(v ORDER BY bk.b) FROM (SELECT bk.b, (SELECT COUNT(*) FROM acts a WHERE ${local(Prisma.sql`a."occurredAt"`)} = bk.b) AS v FROM (${c.bucketsSql}) bk) bk),
        'users',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC, x.actions DESC) FROM (
          SELECT u.id AS "userId", u.name,
            (SELECT COUNT(*) FROM acts a WHERE a."userId" = u.id) AS actions,
            (SELECT COUNT(DISTINCT ${day(Prisma.sql`a."occurredAt"`)}) FROM acts a WHERE a."userId" = u.id) AS "activeDays",
            COALESCE((SELECT SUM(cost) FROM costs k WHERE k."userId" = u.id),0) AS "costUsd"
          FROM "user" u
          WHERE u.id IN (SELECT "userId" FROM acts UNION SELECT "userId" FROM costs WHERE "userId" IS NOT NULL)
          LIMIT 50) x),'[]'::json)
      ) AS data
    `,
    );

    return { ...c.meta, feature, ...rows[0]!.data };
  }

  async costs(input: AdminAnalyticsInput): Promise<AdminCostsData> {
    const c = context(input);
    const { now, from, previousFrom, previousUntil, local } = c;
    const plan = planSql(now, input.rolloutAt);

    const rows = await reportQuery<
      Array<{ data: Omit<AdminCostsData, keyof AdminWindow> }>
    >(
      this.prisma,
      Prisma.sql`
      WITH acts AS MATERIALIZED (${actionsSql(previousFrom, now)}),
      msgs AS MATERIALIZED (
        SELECT m."userId", m."createdAt" FROM message m
        WHERE m.role = 'user' AND m."createdAt" >= ${previousFrom} AND m."createdAt" < ${now}
      ),
      costs AS MATERIALIZED (${costRowsSql(previousFrom, now)}),
      raw AS MATERIALIZED (SELECT * FROM model_usage WHERE "createdAt" >= ${previousFrom} AND "createdAt" < ${now}),
      payments AS MATERIALIZED (${verifiedPaymentsSql(input.environment)}),
      cur AS MATERIALIZED (SELECT * FROM costs WHERE "createdAt" >= ${from}),
      cur_raw AS MATERIALIZED (SELECT * FROM raw WHERE "createdAt" >= ${from})
      SELECT json_build_object(
        'current',${totalsSql(from, now)},
        'previous',${totalsSql(previousFrom, previousUntil)},
        'series',json_build_object('featureCosts',COALESCE((SELECT json_agg(v ORDER BY bk.b) FROM (SELECT bk.b,
          COALESCE((SELECT json_object_agg(feature, total) FROM (SELECT feature, SUM(cost) AS total FROM cur WHERE ${local(Prisma.sql`"createdAt"`)} = bk.b GROUP BY feature HAVING SUM(cost) > 0) x),'{}'::json) AS v
          FROM (${c.bucketsSql}) bk) bk),'[]'::json)),
        'featureCosts',json_build_object('current',${featureCostsSql(from, now)},'previous',${featureCostsSql(previousFrom, previousUntil)}),
        'processes',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC) FROM (
          SELECT r.stage,
            (SELECT k.feature FROM cur k WHERE k.stage = r.stage GROUP BY k.feature ORDER BY SUM(k.cost) DESC, k.feature LIMIT 1) AS feature,
            MIN(r.kind) AS kind,
            COUNT(*) AS calls,
            COALESCE(SUM(r."costUsd"),0) AS "costUsd",
            COALESCE(SUM(r."inputTokens"),0) AS "inputTokens",
            COALESCE(SUM(r."outputTokens"),0) AS "outputTokens",
            COALESCE(SUM(r."cachedInputTokens"),0) AS "cachedInputTokens",
            COALESCE(SUM(r."costUsd") FILTER (WHERE r.status = 'failed' OR r.attempt > 1),0) AS "wastedUsd",
            COUNT(*) FILTER (WHERE r.attempt > 1) AS retried,
            COUNT(*) FILTER (WHERE r.status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE r."costMissing") AS unpriced,
            (SELECT json_agg(m ORDER BY m."costUsd" DESC) FROM (
              SELECT q.model, (q.attempt > 1) AS retry, COUNT(*) AS calls, COALESCE(SUM(q."costUsd"),0) AS "costUsd"
              FROM cur_raw q WHERE q.stage = r.stage GROUP BY q.model, (q.attempt > 1)) m) AS models,
            COALESCE((SELECT json_agg(a ORDER BY a."costUsd" DESC) FROM (
              SELECT u.id AS "userId", u.name, SUM(q."costUsd") AS "costUsd"
              FROM cur_raw q JOIN "user" u ON u.id = q."userId" WHERE q.stage = r.stage
              GROUP BY u.id, u.name HAVING SUM(q."costUsd") > 0 ORDER BY SUM(q."costUsd") DESC LIMIT 5) a),'[]'::json) AS accounts
          FROM cur_raw r GROUP BY r.stage ORDER BY SUM(r."costUsd") DESC NULLS LAST LIMIT 30) x),'[]'::json),
        'users',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC) FROM (
          SELECT u.id AS "userId", u.name, ${plan} AS plan,
            (SELECT COUNT(*) FROM acts a WHERE a."userId" = u.id AND a."occurredAt" >= ${from}) AS actions,
            COALESCE((SELECT SUM(cost) FROM cur k WHERE k."userId" = u.id),0) AS "costUsd",
            COALESCE((SELECT SUM(cost) FROM cur k WHERE k."userId" = u.id AND k.background),0) AS "backgroundUsd",
            COALESCE((SELECT json_object_agg(feature, n) FROM (SELECT feature, COUNT(*) AS n FROM acts a WHERE a."userId" = u.id AND a."occurredAt" >= ${from} GROUP BY feature) f),'{}'::json) AS "featureActions"
          FROM "user" u LEFT JOIN billing_account b ON b."userId" = u.id
          WHERE u.id IN (SELECT "userId" FROM acts WHERE "occurredAt" >= ${from} UNION SELECT "userId" FROM cur WHERE "userId" IS NOT NULL)
        ) x),'[]'::json),
        'unattributedUsd',COALESCE((SELECT SUM(cost) FROM cur WHERE "userId" IS NULL AND kind <> 'hindsight'),0),
        'pooledMemoryUsd',COALESCE((SELECT SUM(cost) FROM cur WHERE kind = 'hindsight'),0),
        'models',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC) FROM (
          SELECT model, SUM("costUsd") AS "costUsd" FROM cur_raw WHERE "costUsd" IS NOT NULL GROUP BY model HAVING SUM("costUsd") > 0) x),'[]'::json)
      ) AS data
    `,
    );

    return { ...c.meta, ...rows[0]!.data };
  }

  async userInsights(
    input: AdminAnalyticsInput & { userId: string },
  ): Promise<AdminUserInsightsData | null> {
    const c = context(input);
    const { now, from, previousFrom, previousUntil, local, day } = c;
    const { userId } = input;

    const rows = await reportQuery<
      Array<{
        data: Omit<AdminUserInsightsData, keyof AdminWindow | 'userId'> | null;
      }>
    >(
      this.prisma,
      Prisma.sql`
      WITH acts AS MATERIALIZED (SELECT * FROM (${actionsSql(previousFrom, now)}) a WHERE a."userId" = ${userId}),
      cur_acts AS (SELECT * FROM acts WHERE "occurredAt" >= ${from}),
      costs AS MATERIALIZED (SELECT * FROM (${costRowsSql(from, now)}) k WHERE k."userId" = ${userId})
      SELECT CASE WHEN EXISTS (SELECT 1 FROM "user" WHERE id = ${userId}) THEN json_build_object(
        'series',(SELECT json_agg(json_build_object(
            'actions',COALESCE((SELECT json_object_agg(feature, n) FROM (SELECT feature, COUNT(*) AS n FROM cur_acts a WHERE ${local(Prisma.sql`a."occurredAt"`)} = bk.b GROUP BY feature) f),'{}'::json),
            'costUsd',COALESCE((SELECT SUM(cost) FROM costs k WHERE ${local(Prisma.sql`k."createdAt"`)} = bk.b),0)) ORDER BY bk.b)
          FROM (${c.bucketsSql}) bk),
        'features',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC, x.actions DESC) FROM (
          SELECT f.feature,
            (SELECT COUNT(*) FROM cur_acts a WHERE a.feature = f.feature) AS actions,
            COALESCE((SELECT SUM(cost) FROM costs k WHERE k.feature = f.feature),0) AS "costUsd"
          FROM (SELECT feature FROM cur_acts UNION SELECT feature FROM costs WHERE cost > 0) f) x),'[]'::json),
        'interactiveUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE NOT background),0),
        'backgroundUsd',COALESCE((SELECT SUM(cost) FROM costs WHERE background),0),
        'previousActions',(SELECT COUNT(*) FROM acts WHERE "occurredAt" < ${previousUntil}),
        'activeDays',(SELECT COUNT(DISTINCT ${day(Prisma.sql`"occurredAt"`)}) FROM cur_acts),
        'conversations',COALESCE((SELECT json_agg(x ORDER BY x."costUsd" DESC) FROM (
          SELECT cv.id, cv.title,
            to_char((SELECT MAX(m."createdAt") FROM message m WHERE m."conversationId" = cv.id),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastMessageAt",
            (SELECT COUNT(*) FROM message m WHERE m."conversationId" = cv.id AND m.role = 'user' AND m."createdAt" >= ${from}) AS messages,
            (SELECT COUNT(*) FROM tool_invocation t JOIN assistant_run r ON r.id = t."assistantRunId" WHERE r."conversationId" = cv.id AND t."createdAt" >= ${from}) AS "toolSteps",
            k.total AS "costUsd"
          FROM (SELECT "conversationId", SUM(cost) AS total FROM costs WHERE "conversationId" IS NOT NULL GROUP BY "conversationId") k
            JOIN conversation cv ON cv.id = k."conversationId"
          ORDER BY k.total DESC LIMIT 5) x),'[]'::json)
      ) END AS data
    `,
    );

    const data = rows[0]?.data;

    return data ? { ...c.meta, userId, ...data } : null;
  }
}
