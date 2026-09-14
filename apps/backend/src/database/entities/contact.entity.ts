import type { Contact as PrismaContact } from '../../generated/prisma/client';

export type ContactGroupRef = {
  id: string;
  name: string;
};

export type Contact = Pick<
  PrismaContact,
  | 'id'
  | 'name'
  | 'aliases'
  | 'email'
  | 'phone'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
> & {
  groups: ContactGroupRef[];
};

export type ContactWrite = {
  name: string;
  aliases?: string[];
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  groupIds?: string[];
};
