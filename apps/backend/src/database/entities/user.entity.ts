import type { User as PrismaUser } from '../../generated/prisma/client';

// Derived from the Prisma model: if the schema drops or renames one of
// these fields, this file fails to compile — drift surfaces immediately.
export type User = Pick<
  PrismaUser,
  | 'id'
  | 'name'
  | 'email'
  | 'emailVerified'
  | 'image'
  | 'createdAt'
  | 'updatedAt'
>;
