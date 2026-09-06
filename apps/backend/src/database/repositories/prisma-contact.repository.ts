import { Injectable } from '@nestjs/common';
import type { Contact as PrismaContact } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { Contact, ContactWrite } from '../entities';
import type { IContactRepository } from '../interfaces';

const select = { id: true, name: true, aliases: true, email: true, phone: true, notes: true, createdAt: true, updatedAt: true } as const;
type ContactRow = Pick<PrismaContact, keyof typeof select>;
export function normalizeContactReference(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
}
@Injectable()
export class PrismaContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string, query?: string): Promise<ContactRow[]> {
    const q = query?.trim();
    return this.prisma.contact.findMany({ where: { userId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { aliases: { has: normalizeContactReference(q) } }] } : {}) }, orderBy: { name: 'asc' }, select });
  }
  findById(userId: string, id: string): Promise<ContactRow | null> { return this.prisma.contact.findFirst({ where: { id, userId }, select }); }
  resolve(userId: string, reference: string): Promise<ContactRow[]> {
    const normalized = normalizeContactReference(reference);
    return this.prisma.contact.findMany({ where: { userId, OR: [{ normalizedName: normalized }, { aliases: { has: normalized } }, { email: { equals: reference.trim(), mode: 'insensitive' } }, { phone: reference.trim() }] }, take: 5, select });
  }
  create(userId: string, input: ContactWrite): Promise<ContactRow> {
    return this.prisma.contact.create({ data: { userId, ...input, normalizedName: normalizeContactReference(input.name), aliases: (input.aliases ?? []).map(normalizeContactReference) }, select });
  }
  async update(userId: string, id: string, input: Partial<ContactWrite>): Promise<ContactRow | null> {
    const found = await this.prisma.contact.findFirst({ where: { id, userId }, select: { id: true } });
    if (!found) return null;
    return this.prisma.contact.update({ where: { id }, data: { ...input, ...(input.name ? { normalizedName: normalizeContactReference(input.name) } : {}), ...(input.aliases ? { aliases: input.aliases.map(normalizeContactReference) } : {}) }, select });
  }
  async delete(userId: string, id: string): Promise<boolean> { return (await this.prisma.contact.deleteMany({ where: { id, userId } })).count > 0; }
}
