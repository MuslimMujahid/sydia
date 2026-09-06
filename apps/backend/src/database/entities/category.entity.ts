import type { Category as PrismaCategory } from '../../generated/prisma/client';

export const CATEGORY_COLORS = [
  'blue',
  'violet',
  'emerald',
  'amber',
  'rose',
  'cyan',
  'orange',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_ICON_KEYS = [
  'briefcase',
  'heart',
  'wallet',
  'book',
  'health',
  'family',
  'shopping',
  'star',
  'home',
  'travel',
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export type Category = Pick<
  PrismaCategory,
  'id' | 'name' | 'createdAt' | 'updatedAt'
> & {
  color: CategoryColor;
  iconKey: CategoryIconKey;
  taskCount: number;
};

export type CategoryWrite = {
  name: string;
  color: CategoryColor;
  iconKey: CategoryIconKey;
};

export const DEFAULT_CATEGORIES: readonly CategoryWrite[] = [
  { name: 'Kerja', color: 'blue', iconKey: 'briefcase' },
  { name: 'Pribadi', color: 'violet', iconKey: 'heart' },
  { name: 'Keuangan', color: 'emerald', iconKey: 'wallet' },
  { name: 'Belajar', color: 'amber', iconKey: 'book' },
  { name: 'Kesehatan', color: 'rose', iconKey: 'health' },
  { name: 'Keluarga', color: 'cyan', iconKey: 'family' },
  { name: 'Belanja', color: 'orange', iconKey: 'shopping' },
];

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}
