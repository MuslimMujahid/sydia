import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import { CreateAuditEvent } from '../entities';
import type { IAuditEventRepository } from '../interfaces';

@Injectable()
export class PrismaAuditEventRepository implements IAuditEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: CreateAuditEvent): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        userId: event.userId ?? null,
        eventType: event.eventType,
        metadata: event.metadata,
      },
    });
  }
}
