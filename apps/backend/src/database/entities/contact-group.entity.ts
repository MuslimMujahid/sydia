import type { ContactGroup as PrismaContactGroup } from '../../generated/prisma/client';

export type ContactGroup = Pick<
  PrismaContactGroup,
  'id' | 'name' | 'createdAt' | 'updatedAt'
> & {
  contactCount: number;
};

export type ContactGroupWrite = {
  name: string;
};

export function normalizeContactGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}
