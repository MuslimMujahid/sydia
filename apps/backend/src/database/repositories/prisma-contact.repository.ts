import { Injectable } from '@nestjs/common';
import type { Contact as PrismaContact } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { Contact, ContactGroupRef, ContactWrite } from '../entities';
import type { ContactFilters, IContactRepository } from '../interfaces';

const select = {
  id: true,
  name: true,
  aliases: true,
  email: true,
  phone: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  groupMembers: {
    select: { group: { select: { id: true, name: true } } },
  },
} as const;

type ContactRow = Pick<
  PrismaContact,
  keyof Omit<typeof select, 'groupMembers'>
> & {
  groupMembers: Array<{ group: ContactGroupRef }>;
};

function present(row: ContactRow): Contact {
  const { groupMembers, ...contact } = row;

  return {
    ...contact,
    groups: groupMembers
      .map((member) => member.group)
      .sort((left, right) =>
        left.name.localeCompare(right.name, 'id-ID', { sensitivity: 'base' }),
      ),
  };
}

export function normalizeContactReference(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('id-ID')
    .replace(/\s+/g, ' ');
}

@Injectable()
export class PrismaContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, filters: ContactFilters = {}): Promise<Contact[]> {
    const q = filters.query?.trim();
    const rows = await this.prisma.contact.findMany({
      where: {
        userId,
        groupMembers: filters.groupId
          ? { some: { groupId: filters.groupId, group: { userId } } }
          : undefined,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { aliases: { has: normalizeContactReference(q) } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select,
    });

    return rows.map(present);
  }

  async findById(userId: string, id: string): Promise<Contact | null> {
    const row = await this.prisma.contact.findFirst({
      where: { id, userId },
      select,
    });

    return row ? present(row) : null;
  }

  async resolve(userId: string, reference: string): Promise<Contact[]> {
    const normalized = normalizeContactReference(reference);
    const rows = await this.prisma.contact.findMany({
      where: {
        userId,
        OR: [
          { normalizedName: normalized },
          { aliases: { has: normalized } },
          { email: { equals: reference.trim(), mode: 'insensitive' } },
          { phone: reference.trim() },
        ],
      },
      take: 5,
      select,
    });

    return rows.map(present);
  }

  async create(userId: string, input: ContactWrite): Promise<Contact> {
    const { groupIds, ...data } = input;
    const links = await this.groupIdsFor(userId, groupIds);
    const row = await this.prisma.contact.create({
      data: {
        userId,
        ...data,
        normalizedName: normalizeContactReference(input.name),
        aliases: (input.aliases ?? []).map(normalizeContactReference),
        ...(links ? { groupMembers: { create: links } } : {}),
      },
      select,
    });

    return present(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<ContactWrite>,
  ): Promise<Contact | null> {
    const found = await this.prisma.contact.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!found) return null;
    const { groupIds, ...data } = input;
    const links = await this.groupIdsFor(userId, groupIds);
    const row = await this.prisma.contact.update({
      where: { id },
      data: {
        ...data,
        ...(input.name
          ? { normalizedName: normalizeContactReference(input.name) }
          : {}),
        ...(input.aliases
          ? { aliases: input.aliases.map(normalizeContactReference) }
          : {}),
        ...(links
          ? {
              groupMembers: {
                deleteMany: {},
                create: links.map((group) => ({ groupId: group.groupId })),
              },
            }
          : {}),
      },
      select,
    });

    return present(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return (
      (await this.prisma.contact.deleteMany({ where: { id, userId } })).count >
      0
    );
  }

  /**
   * Validates that every requested group belongs to the user and returns the
   * join rows to write. Omitting the ids leaves memberships untouched; an empty
   * list clears them.
   */
  private async groupIdsFor(
    userId: string,
    groupIds: string[] | undefined,
  ): Promise<Array<{ groupId: string }> | undefined> {
    if (groupIds === undefined) return undefined;
    const ids = [...new Set(groupIds)];

    if (ids.length) {
      const count = await this.prisma.contactGroup.count({
        where: { id: { in: ids }, userId },
      });

      if (count !== ids.length) throw new Error('Grup tidak valid.');
    }

    return ids.map((groupId) => ({ groupId }));
  }
}
