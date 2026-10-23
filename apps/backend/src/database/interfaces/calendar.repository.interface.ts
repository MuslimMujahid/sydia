import type {
  CalendarEvent,
  CalendarEventForRead,
  CalendarEventWrite,
  CalendarIntegration,
} from '../entities';

export type CalendarDisconnectPreparation = {
  connectionStatus: 'disconnected' | 'disconnecting';
  channels: Array<{ channelId: string; resourceId: string | null }>;
};

export type CalendarPollRequestResult =
  | {
      status: 'queued' | 'pending' | 'fresh';
      bindingId: string;
      connectionGeneration: number;
      calendarId: string;
      lastSyncedAt: Date | null;
    }
  | { status: 'not_ready' };

export type CalendarRequestFence =
  | {
      kind: 'operation';
      bindingId: string;
      connectionGeneration: number;
      operationId: string;
      claimToken: string;
      claimEpoch: number;
    }
  | {
      kind: 'binding';
      bindingId: string;
      connectionGeneration: number;
      owner: string;
      leaseEpoch: number;
    }
  | {
      kind: 'credential';
      bindingId: string;
      owner: string;
      credentialGeneration: number;
    };

export interface ICalendarRepository {
  listRecovery(
    userId: string,
    beforeId?: string,
  ): Promise<CalendarRecoveryEntry[]>;
  findRecovery(
    userId: string,
    id: string,
  ): Promise<CalendarRecoveryEntry | null>;
  recordAutomaticResolution(
    input: CalendarAutomaticRecoveryInput,
  ): Promise<boolean>;
  listReminderUsers(
    afterId: string | null,
    limit: number,
  ): Promise<Array<{ id: string; timezone: string }>>;
  canSendCalendarRequest(
    fence: CalendarRequestFence,
    minimumRemainingMs: number,
  ): Promise<boolean>;
  status(userId: string): Promise<CalendarIntegration | null>;
  syncStatus(userId: string): Promise<CalendarSyncStatus | null>;
  operationalMetricsSnapshot(): Promise<CalendarSyncOperationalSnapshot>;
  integrationCredentials(userId: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: Date | null;
    calendarId: string | null;
    activeBindingId: string | null;
    credentialGeneration: number;
    googleSubject?: string | null;
  } | null>;
  saveIntegration(
    userId: string,
    input: {
      accessToken: string;
      refreshToken?: string | null;
      expiresAt: Date;
      scope?: string | null;
    },
  ): Promise<void>;
  updateAccessToken(
    userId: string,
    accessToken: string,
    expiresAt: Date,
  ): Promise<void>;
  beginDisconnect(userId: string): Promise<CalendarDisconnectPreparation>;
  disconnect(userId: string): Promise<void>;
  privacyExport(userId: string): Promise<CalendarPrivacyExport>;
  listOpenConflicts(userId: string): Promise<CalendarSyncConflictView[]>;
  resolveConflict(
    userId: string,
    conflictId: string,
    resolution: CalendarConflictResolution,
    expectedLocalRevision: number,
    expectedRemoteEtag: string | null,
    request: CalendarMutationRequest,
  ): Promise<CalendarConflictResolutionResult>;
  list(userId: string, from: Date, to: Date): Promise<CalendarEventForRead[]>;
  listCancelledRecurringInstances(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CancelledCalendarOccurrence[]>;
  findById(userId: string, id: string): Promise<CalendarEvent | null>;
  materializeGoogleOccurrence(input: {
    userId: string;
    seriesEventId: string;
    bindingId: string;
    calendarId: string;
    connectionGeneration: number;
    inbound: CalendarInboundEventInput;
  }): Promise<CalendarEvent | null>;
  materializeLocalOccurrence(input: {
    userId: string;
    seriesEventId: string;
    occurrenceKey: string;
    expectedSeriesRevision: number;
    startAt: Date | null;
    endAt: Date | null;
    allDayStartDate: Date | null;
    allDayEndDate: Date | null;
    now: Date;
  }): Promise<CalendarEvent | null>;
  create(
    userId: string,
    input: CalendarEventWrite & {
      provider?: string;
      providerEventId?: string | null;
    },
  ): Promise<CalendarEvent>;
  update(
    userId: string,
    id: string,
    input: Partial<CalendarEventWrite> & {
      provider?: string;
      providerEventId?: string | null;
      status?: 'confirmed' | 'cancelled';
    },
  ): Promise<CalendarEvent | null>;
  createMutation(
    userId: string,
    input: CalendarEventWrite,
    destination: 'auto' | 'local' | 'google',
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult>;
  exportMutation(
    userId: string,
    eventId: string,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult>;
  updateMutation(
    userId: string,
    id: string,
    input: Partial<CalendarEventWrite>,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult>;
  cancelMutation(
    userId: string,
    id: string,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult>;
  createOAuthRequest(input: CalendarOAuthRequestInput): Promise<void>;
  consumeOAuthRequest(
    stateHash: string,
    browserNonceHash: string,
  ): Promise<ConsumedCalendarOAuthRequest | null>;
  saveGoogleConnection(
    input: SaveGoogleConnectionInput,
  ): Promise<
    | { status: 'connected'; bindingId: string; connectionGeneration: number }
    | { status: 'needs_offline_consent' }
    | { status: 'disconnecting' }
    | { status: 'user_missing' }
  >;
  selectGoogleCalendar(
    userId: string,
    calendar: { id: string; name: string; timezone: string },
  ): Promise<
    | { status: 'selected'; bindingId: string; connectionGeneration: number }
    | { status: 'unchanged' }
    | { status: 'missing' }
  >;
  claimOperation(
    operationId: string,
    claimToken: string,
    leaseDurationMs: number,
  ): Promise<CalendarSyncOperationClaim | null>;
  retryFailedOperation(
    userId: string,
    eventId: string,
  ): Promise<CalendarRetryOperationResult>;
  completeOperation(input: CompleteCalendarSyncOperation): Promise<boolean>;
  failOperation(input: FailCalendarSyncOperation): Promise<boolean>;
  cleanupSyncRecords(input: {
    completedOperationRetentionDays: number;
    tombstoneRetentionDays: number;
    batchSize: number;
  }): Promise<CalendarSyncRetentionResult>;
  dueOperationIds(
    limit: number,
  ): Promise<Array<{ id: string; attempts: number }>>;
  claimCredentialRefresh(
    bindingId: string,
    expectedGeneration: number,
    owner: string,
    leaseDurationMs: number,
    minimumValidityMs: number,
  ): Promise<CalendarCredentialRefreshClaim>;
  completeCredentialRefresh(input: {
    bindingId: string;
    expectedGeneration: number;
    owner: string;
    accessToken: string;
    expiresAt: Date;
  }): Promise<boolean>;
  releaseCredentialRefresh(
    bindingId: string,
    expectedGeneration: number,
    owner: string,
  ): Promise<boolean>;
  claimBindingSync(
    bindingId: string,
    connectionGeneration: number,
    owner: string,
    leaseDurationMs: number,
  ): Promise<CalendarBindingSyncClaim | null>;
  saveCalendarSyncPage(
    input: SaveCalendarSyncPageInput,
  ): Promise<boolean | 'continue'>;
  resetExpiredSyncToken(input: {
    bindingId: string;
    connectionGeneration: number;
    owner: string;
    leaseEpoch: number;
  }): Promise<boolean>;
  requestFullResync(userId: string): Promise<
    | {
        status: 'queued';
        bindingId: string;
        connectionGeneration: number;
        fullImportGeneration: number;
      }
    | { status: 'missing' | 'not_ready' | 'busy' }
  >;
  requestPoll(userId: string): Promise<CalendarPollRequestResult>;
  dueBindingIds(
    limit: number,
  ): Promise<Array<{ id: string; connectionGeneration: number }>>;
  failBindingSync(input: {
    bindingId: string;
    connectionGeneration: number;
    owner: string;
    leaseEpoch: number;
    errorCode: string;
    outcome: 'retry' | 'deferred' | 'reconnect_required' | 'failed';
    retryDelayMs: number;
  }): Promise<boolean>;
  releaseBindingSyncLease(
    bindingId: string,
    owner: string,
    leaseEpoch: number,
  ): Promise<boolean>;
  dueWatchBindingIds(
    limit: number,
  ): Promise<Array<{ id: string; connectionGeneration: number }>>;
  createWatchChannel(input: {
    bindingId: string;
    connectionGeneration: number;
    channelId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean>;
  activateWatchChannel(input: {
    bindingId: string;
    channelId: string;
    connectionGeneration: number;
    resourceId: string;
    resourceUri: string | null;
    expiresAt: Date | null;
  }): Promise<boolean>;
  failWatchChannel(channelId: string, errorCode: string): Promise<void>;
  markWatchCleanupPending(channelId: string): Promise<void>;
  activeWatchChannels(
    bindingId: string,
  ): Promise<Array<{ channelId: string; resourceId: string | null }>>;
  markWatchChannelStopped(channelId: string): Promise<void>;
  markWatchDirtyNotification(input: {
    channelId: string;
    tokenHash: string;
    resourceId: string;
    messageNumber: string;
  }): Promise<
    | { accepted: true; bindingId: string; connectionGeneration: number }
    | { accepted: false }
  >;
}

export type CalendarMutationRequest = {
  key: string;
  fingerprint: string;
  expiresAt: Date;
};

export type CalendarMutationResult =
  | {
      status: 'saved';
      event: CalendarEvent;
      operationId: string | null;
      replayed: boolean;
    }
  | {
      status:
        'missing' | 'reconnect_required' | 'read_only' | 'idempotency_conflict';
    };

export type CalendarPrivacyExport = {
  connection: {
    status: string;
    googleEmail: string | null;
    calendarId: string | null;
    scope: string | null;
    updatedAt: Date;
  } | null;
  events: CalendarEvent[];
  conflicts: Array<{
    id: string;
    eventId: string | null;
    eventTitle: string | null;
    googleEventId: string;
    baseSnapshot: unknown;
    localSnapshot: unknown;
    remoteSnapshot: unknown;
    conflictingFields: string[];
    state: string;
    resolution: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }>;
};

export type CalendarOAuthRequestInput = {
  userId: string;
  sessionId: string;
  stateHash: string;
  browserNonceHash: string;
  idTokenNonceHash: string;
  returnTo: string;
  expiresInMs: number;
};

export type ConsumedCalendarOAuthRequest = {
  userId: string;
  sessionId: string;
  idTokenNonceHash: string;
  returnTo: string;
};

export type SaveGoogleConnectionInput = {
  userId: string;
  googleSubject: string;
  googleEmail: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
  calendar: {
    id: string;
    name: string;
    timezone: string;
  };
};

export type CalendarRetryOperationResult =
  | { status: 'queued'; event: CalendarEvent; operationId: string }
  | { status: 'missing' | 'not_retryable' | 'reconnect_required' };

export type CalendarSyncStatus = {
  connectionStatus: string;
  googleEmail: string | null;
  calendarId: string | null;
  calendarName: string | null;
  bindingState: string | null;
  lastSyncedAt: Date | null;
  lastErrorCode: string | null;
  pendingOperationCount: number;
  openConflictCount: number;
  watchExpiresAt: Date | null;
};

export type CalendarSyncOperationalSnapshot = {
  pendingOperationCount: number;
  processingOperationCount: number;
  oldestOperationAgeMs: number;
  activeBindingCount: number;
  neverSyncedBindingCount: number;
  oldestNeverSyncedBindingAgeMs: number;
  oldestPullAgeMs: number;
  expiringWatchCount: number;
  pendingWatchCleanupCount: number;
  oldestWatchCleanupAgeMs: number;
};

export type CalendarConflictSnapshot = {
  title: string | null;
  description: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  recurrence: string[];
  attendees: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
};

export type CalendarRecoveryEntry = {
  id: string;
  eventId: string | null;
  calendarName: string;
  resolution: string;
  fields: string[];
  local: CalendarConflictSnapshot | null;
  remote: CalendarConflictSnapshot | null;
  createdAt: Date;
};

export type CalendarSyncConflictView = {
  id: string;
  eventId: string;
  title: string;
  localRevision: number;
  remoteEtag: string | null;
  fields: string[];
  local: CalendarConflictSnapshot;
  remote: CalendarConflictSnapshot | null;
  remoteDeleted: boolean;
  createdAt: Date;
};

export type CalendarConflictResolution = 'keep_sydia' | 'use_google';

export type CalendarConflictResolutionResult =
  | {
      status: 'saved';
      event: CalendarEvent;
      operationId: string | null;
    }
  | {
      status: 'missing' | 'stale' | 'busy' | 'reconnect_required' | 'read_only';
    };

export type CalendarSyncOperationClaim = {
  claimedAt: Date;
  operation: {
    id: string;
    kind: 'create' | 'update' | 'delete';
    attempts: number;
    retryBudgetAttempts: number;
    createdAt?: Date;
    firstAttemptAt: Date | null;
    connectionGeneration: number;
    eventRevision: number;
    payload: unknown;
    baseSnapshot: unknown;
    stableGoogleEventId: string | null;
    claimToken: string;
    claimEpoch: number;
  };
  binding: {
    id: string;
    userId: string;
    googleSubject: string;
    calendarId: string;
    timezone: string;
  };
  credentials: {
    accessToken: string;
    refreshToken: string | null;
    accessTokenExpiresAt: Date | null;
    credentialGeneration: number;
  };
  eventLink: {
    id: string;
    googleEventId: string;
    etag: string | null;
    remoteSnapshot: unknown;
    commonSnapshot: unknown;
  } | null;
};

export type CompleteCalendarSyncOperation = {
  operationId: string;
  claimToken: string;
  claimEpoch: number;
  remoteEventId?: string;
  remoteEtag?: string | null;
  remoteSnapshot?: unknown;
  reconciledEvent?: CalendarInboundEventInput;
};

export type CalendarAutomaticRecoveryInput = {
  operationId: string;
  claimToken: string;
  claimEpoch: number;
  eventLinkId?: string;
  remoteEtag: string | null;
  fields: string[];
  winner: 'local' | 'remote';
  reason: 'later_edit' | 'equal_timestamp' | 'unknown_timestamp' | 'deletion';
  localSnapshot: unknown;
  remoteSnapshot: unknown;
};

export type FailCalendarSyncOperation = {
  operationId: string;
  claimToken: string;
  claimEpoch: number;
  errorCode: string;
  outcome: 'retry' | 'deferred' | 'reconnect_required' | 'conflict' | 'failed';
  retryDelayMs?: number;
  conflict?: {
    remoteSnapshot: unknown;
    conflictingFields: string[];
  };
};

export type CalendarCredentialRefreshClaim =
  | {
      status: 'fresh';
      accessToken: string;
      expiresAt: Date | null;
      credentialGeneration: number;
    }
  | {
      status: 'leased';
      integrationId: string;
      userId: string;
      googleSubject: string;
      refreshToken: string;
      credentialGeneration: number;
    }
  | { status: 'busy' }
  | { status: 'unavailable' };

export type CalendarBindingSyncClaim = {
  id: string;
  userId: string;
  integrationId: string;
  googleSubject: string;
  calendarId: string;
  timezone: string;
  state: string;
  lastSyncedAt?: Date | null;
  syncToken: string | null;
  nextPageToken: string | null;
  pendingFullImportSyncToken?: string | null;
  dirtyRevision: number;
  capturedDirtyRevision: number;
  fullImportGeneration: number;
  leaseOwner: string;
  leaseEpoch: number;
  connectionGeneration: number;
  credentials: {
    accessToken: string;
    refreshToken: string | null;
    accessTokenExpiresAt: Date | null;
    credentialGeneration: number;
  };
};

export type CalendarInboundEventInput = {
  googleEventId: string;
  etag: string | null;
  rawSnapshot: unknown;
  commonSnapshot: unknown;
  event: CalendarEventWrite | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurringParentProviderEventId: string | null;
  originalStartAt: Date | null;
  originalStartDate: Date | null;
};

export type CancelledCalendarOccurrence = {
  bindingId: string;
  recurringParentProviderEventId: string;
  originalStartAt: Date | null;
  originalStartDate: Date | null;
};

export type SaveCalendarSyncPageInput = {
  bindingId: string;
  connectionGeneration: number;
  owner: string;
  leaseEpoch: number;
  capturedDirtyRevision: number;
  fullImportGeneration: number;
  fullImport: boolean;
  nextPageToken: string | null;
  nextSyncToken: string | null;
  events: CalendarInboundEventInput[];
};

export const CALENDAR_REPOSITORY = Symbol('ICalendarRepository');

export type CalendarSyncRetentionResult = {
  ordinaryTombstones: number;
  completedOperations: number;
  expiredOAuthRequests: number;
  expiredMutationReceipts: number;
};
