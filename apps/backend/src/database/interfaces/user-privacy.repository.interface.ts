import type { Prisma } from '../../generated/prisma/client';

/**
 * The allow-listed shape of a portable account export.
 *
 * Deliberately excludes Better Auth accounts/sessions, WhatsApp link-code
 * hashes, and calendar access/refresh tokens.
 */
export const USER_EXPORT_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  timezone: true,
  locale: true,
  onboardingCompleted: true,
  automaticMemoryEnabled: true,
  persona: true,
  createdAt: true,
  updatedAt: true,
  userPreference: {
    select: {
      assistantVerbosity: true,
      assistantStyle: true,
      briefingEnabled: true,
      briefingTime: true,
      webNotificationsEnabled: true,
      whatsappNotificationsEnabled: true,
      emailNotificationsEnabled: true,
      proactivePaused: true,
      retentionDays: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  conversations: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      channel: true,
      title: true,
      rollingSummary: true,
      summaryThroughMessageId: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          role: true,
          type: true,
          content: true,
          providerMessageId: true,
          createdAt: true,
        },
      },
      summaries: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          content: true,
          throughMessageId: true,
          createdAt: true,
        },
      },
    },
  },
  tasks: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueAt: true,
      sourceType: true,
      sourceMessageId: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  reminders: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      notes: true,
      status: true,
      scheduledAt: true,
      timezone: true,
      recurrence: true,
      sourceType: true,
      sourceMessageId: true,
      completedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      occurrences: {
        orderBy: [{ occurrenceAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          occurrenceAt: true,
          idempotencyKey: true,
          status: true,
          providerMessageId: true,
          attemptedAt: true,
          deliveredAt: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
  memories: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      content: true,
      category: true,
      status: true,
      pinned: true,
      confidence: true,
      sourceType: true,
      sourceMessageId: true,
      sourceDocumentId: true,
      extractorVersion: true,
      supersedesId: true,
      supersededById: true,
      embeddingModel: true,
      embeddingVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  categories: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      normalizedName: true,
      color: true,
      iconKey: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  contacts: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      normalizedName: true,
      aliases: true,
      email: true,
      phone: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  documents: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fileAssetId: true,
      status: true,
      title: true,
      textContent: true,
      transcript: true,
      imageDescription: true,
      structuredData: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      chunks: {
        orderBy: [{ chunkIndex: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          chunkIndex: true,
          pageNumber: true,
          content: true,
          embeddingModel: true,
          embeddingVersion: true,
          createdAt: true,
        },
      },
    },
  },
  calendarIntegrations: {
    select: {
      provider: true,
      status: true,
      scope: true,
      calendarId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  calendarEvents: {
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      provider: true,
      providerEventId: true,
      title: true,
      description: true,
      location: true,
      startAt: true,
      endAt: true,
      timezone: true,
      attendees: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  externalIdentities: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      provider: true,
      externalId: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
      whatsappState: {
        select: {
          id: true,
          externalIdentityId: true,
          firstInboundAt: true,
          firstResponseAt: true,
          optedOutAt: true,
          lastInboundAt: true,
          lastProactiveSentAt: true,
          lastProactiveReplyAt: true,
          unansweredProactiveCount: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      inboundMessages: {
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          provider: true,
          providerMessageId: true,
          senderExternalId: true,
          externalIdentityId: true,
          receivedAt: true,
          processedAt: true,
          createdAt: true,
        },
      },
    },
  },
  notificationDeliveries: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      kind: true,
      content: true,
      idempotencyKey: true,
      proactive: true,
      sourceId: true,
      providerMessageId: true,
      status: true,
      policyOutcome: true,
      attemptedAt: true,
      deliveredAt: true,
      failedAt: true,
      lastError: true,
      reminderOccurrenceId: true,
      createdAt: true,
      updatedAt: true,
      attempts: {
        orderBy: [{ attemptNumber: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          deliveryId: true,
          attemptNumber: true,
          providerMessageId: true,
          status: true,
          errorMessage: true,
          attemptedAt: true,
          deliveredAt: true,
          createdAt: true,
        },
      },
    },
  },
  auditEvents: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      eventType: true,
      metadata: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.UserSelect;

export type UserExportUser = Prisma.UserGetPayload<{
  select: typeof USER_EXPORT_SELECT;
}>;
export type UserExportData = {
  exportedAt: string;
  user: UserExportUser;
};

export interface IUserPrivacyRepository {
  exportData(userId: string): Promise<UserExportData | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  storageKeys(userId: string): Promise<string[]>;
  purgeExpired(userId: string, cutoff: Date): Promise<string[]>;
  deleteAccount(userId: string): Promise<boolean>;
}

export const USER_PRIVACY_REPOSITORY = Symbol('IUserPrivacyRepository');
