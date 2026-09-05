import type {
  AuditEvent as PrismaAuditEvent,
  Prisma,
} from '../../generated/prisma/client';

export type AuditMetadata = Prisma.JsonValue;

export type AuditEvent = Pick<
  PrismaAuditEvent,
  'id' | 'userId' | 'eventType' | 'metadata' | 'createdAt'
>;

export type CreateAuditEvent = {
  userId?: string | null;
  eventType: string;
  metadata: Prisma.InputJsonValue;
};
