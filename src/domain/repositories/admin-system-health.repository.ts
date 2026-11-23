export interface CronJobInfo {
  jobName: string;
  lastRunAt: string | null;
  lastStatus: 'succeeded' | 'failed' | null;
  returnMessage: string | null;
}

export interface StorageUsageInfo {
  objectsStored: number | null;
  usedBytes: number | null;
}

export interface DatabaseHealthInfo {
  serverVersion: string | null;
  activeConnections: number | null;
  maxConnections: number | null;
  sizeBytes: number | null;
  replicationActive: boolean | null;
}

export interface IAdminSystemHealthRepository {
  getCronJobsLastRun(): Promise<CronJobInfo[]>;
  getStorageUsage(bucketName: string): Promise<StorageUsageInfo>;
  getDatabaseHealth(): Promise<DatabaseHealthInfo>;
  countPendingStorageDeletions(): Promise<number>;
  countUnverifiedUsers24h(): Promise<number>;
}
