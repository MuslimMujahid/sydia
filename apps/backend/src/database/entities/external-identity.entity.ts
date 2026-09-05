import type { ExternalIdentity as PrismaExternalIdentity } from '../../generated/prisma/client';

export type ExternalIdentity = Pick<
  PrismaExternalIdentity,
  | 'id'
  | 'userId'
  | 'provider'
  | 'externalId'
  | 'verifiedAt'
  | 'createdAt'
  | 'updatedAt'
>;
