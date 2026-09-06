import { Injectable } from '@nestjs/common';
import type { CalendarEvent as PrismaCalendarEvent, CalendarIntegration as PrismaCalendarIntegration } from '../../generated/prisma/client';
import { TokenCipher } from '../../infra/crypto';
import { PrismaService } from '../../infra/prisma';
import type { CalendarEvent, CalendarEventWrite, CalendarIntegration } from '../entities';
import type { ICalendarRepository } from '../interfaces';

const eventSelect = { id: true, provider: true, providerEventId: true, title: true, description: true, location: true, startAt: true, endAt: true, timezone: true, attendees: true, status: true, createdAt: true, updatedAt: true } as const;
const integrationSelect = { id: true, provider: true, status: true, accessTokenExpiresAt: true, scope: true, calendarId: true, updatedAt: true } as const;
type EventRow = Pick<PrismaCalendarEvent, keyof typeof eventSelect>;
type IntegrationRow = Pick<PrismaCalendarIntegration, keyof typeof integrationSelect>;
function event(row: EventRow): CalendarEvent { return { ...row, status: row.status as CalendarEvent['status'] }; }
function integration(row: IntegrationRow): CalendarIntegration { return row; }
@Injectable()
export class PrismaCalendarRepository implements ICalendarRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCipher: TokenCipher,
  ) {}
  async status(userId: string): Promise<CalendarIntegration | null> { const row = await this.prisma.calendarIntegration.findUnique({ where: { userId_provider: { userId, provider: 'google' } }, select: integrationSelect }); return row ? integration(row) : null; }
  integrationCredentials(userId: string) {
    return this.prisma.calendarIntegration
      .findUnique({
        where: {
          userId_provider: { userId, provider: 'google' },
        },
        select: {
          accessToken: true,
          refreshToken: true,
          accessTokenExpiresAt: true,
          calendarId: true,
        },
      })
      .then((row) =>
        row
          ? {
              accessToken: row.accessToken
                ? this.tokenCipher.decrypt(row.accessToken)
                : row.accessToken,
              refreshToken: row.refreshToken
                ? this.tokenCipher.decrypt(row.refreshToken)
                : row.refreshToken,
              expiresAt: row.accessTokenExpiresAt,
              calendarId: row.calendarId,
            }
          : null,
      );
  }
  async saveIntegration(
    userId: string,
    input: {
      accessToken: string;
      refreshToken?: string | null;
      expiresAt: Date;
      scope?: string | null;
    },
  ): Promise<void> {
    await this.prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId, provider: 'google' } },
      create: {
        userId,
        provider: 'google',
        status: 'connected',
        accessToken: this.tokenCipher.encrypt(input.accessToken),
        refreshToken:
          input.refreshToken != null
            ? this.tokenCipher.encrypt(input.refreshToken)
            : input.refreshToken,
        accessTokenExpiresAt: input.expiresAt,
        scope: input.scope,
      },
      update: {
        status: 'connected',
        accessToken: this.tokenCipher.encrypt(input.accessToken),
        ...(input.refreshToken != null
          ? { refreshToken: this.tokenCipher.encrypt(input.refreshToken) }
          : {}),
        accessTokenExpiresAt: input.expiresAt,
        scope: input.scope,
      },
    });
  }
  async updateAccessToken(
    userId: string,
    accessToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.calendarIntegration.update({
      where: { userId_provider: { userId, provider: 'google' } },
      data: {
        accessToken: this.tokenCipher.encrypt(accessToken),
        accessTokenExpiresAt: expiresAt,
        status: 'connected',
      },
    });
  }
  async disconnect(userId: string): Promise<void> { await this.prisma.calendarIntegration.updateMany({ where: { userId, provider: 'google' }, data: { status: 'disconnected', accessToken: null, refreshToken: null, accessTokenExpiresAt: null } }); }
  async list(userId: string, from: Date, to: Date): Promise<CalendarEvent[]> { return (await this.prisma.calendarEvent.findMany({ where: { userId, status: 'confirmed', startAt: { lt: to }, endAt: { gt: from } }, orderBy: { startAt: 'asc' }, select: eventSelect })).map(event); }
  async findById(userId: string, id: string): Promise<CalendarEvent | null> { const row = await this.prisma.calendarEvent.findFirst({ where: { id, userId }, select: eventSelect }); return row ? event(row) : null; }
  async create(userId: string, input: CalendarEventWrite & { provider?: string; providerEventId?: string | null }): Promise<CalendarEvent> { return event(await this.prisma.calendarEvent.create({ data: { userId, ...input }, select: eventSelect })); }
  async update(userId: string, id: string, input: Partial<CalendarEventWrite> & { provider?: string; providerEventId?: string | null; status?: 'confirmed' | 'cancelled' }): Promise<CalendarEvent | null> { const found = await this.prisma.calendarEvent.findFirst({ where: { id, userId }, select: { id: true } }); if (!found) return null; return event(await this.prisma.calendarEvent.update({ where: { id }, data: input, select: eventSelect })); }
}
