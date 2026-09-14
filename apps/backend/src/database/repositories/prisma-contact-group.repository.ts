import { Injectable } from '@nestjs/common';
import type { ContactGroup as PrismaContactGroup } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import {
  normalizeContactGroupName,
  type ContactGroup,
  type ContactGroupWrite,
} from '../entities';
import type { IContactGroupRepository } from '../interfaces';

const groupSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } },
} as const;

type ContactGroupRow = Pick<
  PrismaContactGroup,
  'id' | 'name' | 'createdAt' | 'updatedAt'
> & { _count: { members: number } };

function present(row: ContactGroupRow): ContactGroup {
  return {
    id: row.id,
    name: row.name,
    contactCount: row._count.members,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaContactGroupRepository implements IContactGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ContactGroup[]> {
    const rows = await this.prisma.contactGroup.findMany({
      where: { userId },
      select: groupSelect,
    });

    return rows
      .map(present)
      .sort((left, right) =>
        left.name.localeCompare(right.name, 'id-ID', { sensitivity: 'base' }),
      );
  }

  async findById(userId: string, id: string): Promise<ContactGroup | null> {
    const row = await this.prisma.contactGroup.findFirst({
      where: { id, userId },
      select: groupSelect,
    });

    return row ? present(row) : null;
  }

  async findByNames(userId: string, names: string[]): Promise<ContactGroup[]> {
    if (names.length === 0) return [];
    const rows = await this.prisma.contactGroup.findMany({
      where: {
        userId,
        normalizedName: { in: names.map(normalizeContactGroupName) },
      },
      select: groupSelect,
    });

    return rows.map(present);
  }

  async create(
    userId: string,
    input: ContactGroupWrite,
  ): Promise<ContactGroup> {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const row = await this.prisma.contactGroup.create({
      data: {
        userId,
        name,
        normalizedName: normalizeContactGroupName(name),
      },
      select: groupSelect,
    });

    return present(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<ContactGroupWrite>,
  ): Promise<ContactGroup | null> {
    const owned = await this.prisma.contactGroup.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!owned) return null;
    const name = input.name?.trim().replace(/\s+/g, ' ');
    const row = await this.prisma.contactGroup.update({
      where: { id },
      data: {
        name,
        normalizedName: name ? normalizeContactGroupName(name) : undefined,
      },
      select: groupSelect,
    });

    return present(row);
  }

  async delete(userId: string, id: string): Promise<ContactGroup | null> {
    const owned = await this.prisma.contactGroup.findFirst({
      where: { id, userId },
      select: groupSelect,
    });

    if (!owned) return null;
    await this.prisma.contactGroup.delete({ where: { id } });

    return present(owned);
  }
}
