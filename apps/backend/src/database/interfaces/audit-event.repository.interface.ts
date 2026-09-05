import { CreateAuditEvent } from '../entities';

export interface IAuditEventRepository {
  record(event: CreateAuditEvent): Promise<void>;
}

export const AUDIT_EVENT_REPOSITORY = Symbol('IAuditEventRepository');
