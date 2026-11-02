import type { UserAttribution as PrismaUserAttribution } from '../../generated/prisma/client';

export type UserAttribution = Pick<
  PrismaUserAttribution,
  | 'userId'
  | 'visitorId'
  | 'utmSource'
  | 'utmMedium'
  | 'utmCampaign'
  | 'utmContent'
  | 'utmTerm'
  | 'referrer'
  | 'landingPath'
  | 'createdAt'
>;

export type RecordAttributionInput = Omit<UserAttribution, 'createdAt'>;
