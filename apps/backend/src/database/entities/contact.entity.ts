import type { Contact as PrismaContact } from '../../generated/prisma/client';

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
>;

export type ContactWrite = {
  name: string;
  aliases?: string[];
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};
