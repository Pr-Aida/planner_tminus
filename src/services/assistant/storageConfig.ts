import type { HistoryLimit } from './types';

export const STORAGE_LIMITS = {
  assistantMessagesPerUser: 50,
  recommendationRecordsPerUser: 100,
  activePlanDraftsPerUser: 1,
  acceptedPlanRetentionWeeks: 12,
  notificationLogRetentionDays: 30,
  failedNotificationLogRetentionDays: 14,
  deletedItemRetentionDays: 30,
  activeFocusSessionsPerUser: 1,
} as const;

export const DATA_RETENTION_POLICY = {
  assistantMessages: { maximumPerUser: 50, deleteOldestFirst: true },
  recommendationHistory: { maximumPerUser: 100 },
  notificationLogs: { retainDays: 30 },
  failedNotificationLogs: { retainDays: 14 },
  temporaryPlanDrafts: { maximumPerUser: 1, expireAfterHours: 24 },
  analyticsCache: { expireAfterHours: 6 },
  softDeletedPlannerData: { permanentlyDeleteAfterDays: 30 },
} as const;

export const HISTORY_LIMIT_OPTIONS: HistoryLimit[] = [0, 20, 50, 100];
export const DEFAULT_HISTORY_LIMIT: HistoryLimit = 50;

export function getMaxHistory(limit: HistoryLimit): number {
  return limit === 0 ? 0 : limit;
}
