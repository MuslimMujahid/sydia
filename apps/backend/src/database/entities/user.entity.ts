import type { User as PrismaUser } from '../../generated/prisma/client';

export const SUPPORTED_LOCALES = ['id', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const ASSISTANT_PERSONAS = [
  'personal_assistant',
  'friend',
  'mentor',
  'creative_partner',
] as const;
export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

// Derived from the Prisma model: if the schema drops or renames one of
// these fields, this file fails to compile — drift surfaces immediately.
export type User = Pick<
  PrismaUser,
  | 'id'
  | 'name'
  | 'email'
  | 'emailVerified'
  | 'image'
  | 'role'
  | 'timezone'
  | 'locale'
  | 'onboardingCompleted'
  | 'automaticMemoryEnabled'
  | 'persona'
  | 'preferredAddress'
  | 'createdAt'
  | 'updatedAt'
>;

export type UserProfileUpdate = Partial<
  Pick<
    User,
    | 'name'
    | 'timezone'
    | 'locale'
    | 'onboardingCompleted'
    | 'automaticMemoryEnabled'
    | 'persona'
    | 'preferredAddress'
  >
>;
