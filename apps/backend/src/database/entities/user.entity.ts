import type { User as PrismaUser } from '../../generated/prisma/client';

export const SUPPORTED_LOCALES = ['id', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const ASSISTANT_PERSONAS = [
  'professional',
  'friendly',
  'cheerful',
  'playful',
] as const;
export type AssistantPersona = (typeof ASSISTANT_PERSONAS)[number];

/** How a user describes themselves in onboarding; it picks example messages. */
export const USER_OCCUPATIONS = [
  'homemaker',
  'school_student',
  'university_student',
  'office_worker',
  'freelancer',
  'business_owner',
  'other',
] as const;
export type UserOccupation = (typeof USER_OCCUPATIONS)[number];

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
  | 'occupation'
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
    | 'occupation'
  >
>;
