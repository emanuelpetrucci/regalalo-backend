export interface AnalyticsEventRecord {
  event: string;
  occurredAt: Date;
  userIdHash: string;
  sessionId: string | null;
  properties: Record<string, unknown>;
}

export interface IAnalyticsEventRepository {
  insert(record: AnalyticsEventRecord): Promise<void>;
}
