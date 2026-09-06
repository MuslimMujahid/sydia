import { Injectable } from '@nestjs/common';
import type { Category as PrismaCategory } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import {
  DEFAULT_CATEGORIES,
  normalizeCategoryName,
  type Category,
  type CategoryWrite,
} from '../entities';
import type { ICategoryRepository } from '../interfaces';

const categorySelect = {
  id: true,
  name: true,
  color: true,
  iconKey: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
} as const;

type CategoryRow = Pick<
  PrismaCategory,
  'id' | 'name' | 'color' | 'iconKey' | 'createdAt' | 'updatedAt'
> & { _count: { tasks: number } };

function present(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color as Category['color'],
    iconKey: row.iconKey as Category['iconKey'],
    taskCount: row._count.tasks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: categorySelect,
    });

    return rows
      .map(present)
      .sort((left, right) =>
        left.name.localeCompare(right.name, 'id-ID', { sensitivity: 'base' }),
      );
  }

  async findByNames(userId: string, names: string[]): Promise<Category[]> {
    if (names.length === 0) return [];
    const rows = await this.prisma.category.findMany({
      where: {
        userId,
        normalizedName: { in: names.map(normalizeCategoryName) },
      },
      select: categorySelect,
    });

    return rows.map(present);
  }

  async create(userId: string, input: CategoryWrite): Promise<Category> {
    const count = await this.prisma.category.count({ where: { userId } });
    if (count >= 25) throw new Error('Batas 25 kategori telah tercapai.');
    const row = await this.prisma.category.create({
      data: {
        userId,
        ...input,
        name: input.name.trim().replace(/\s+/g, ' '),
        normalizedName: normalizeCategoryName(input.name),
      },
      select: categorySelect,
    });

    return present(row);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<CategoryWrite>,
  ): Promise<Category | null> {
    const owned = await this.prisma.category.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!owned) return null;
    const name = input.name?.trim().replace(/\s+/g, ' ');
    const row = await this.prisma.category.update({
      where: { id },
      data: {
        ...input,
        name,
        normalizedName: name ? normalizeCategoryName(name) : undefined,
      },
      select: categorySelect,
    });

    return present(row);
  }

  async delete(userId: string, id: string): Promise<Category | null> {
    const owned = await this.prisma.category.findFirst({
      where: { id, userId },
      select: categorySelect,
    });

    if (!owned) return null;
    await this.prisma.category.delete({ where: { id } });

    return present(owned);
  }

  async provisionDefaults(userId: string): Promise<void> {
    await this.prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((category) => ({
        userId,
        ...category,
        normalizedName: normalizeCategoryName(category.name),
      })),
      skipDuplicates: true,
    });
  }
}
