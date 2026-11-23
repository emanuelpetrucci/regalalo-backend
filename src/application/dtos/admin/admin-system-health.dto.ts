import type {
  CronJobInfo,
  DatabaseHealthInfo,
  StorageUsageInfo,
} from '../../../domain/repositories/admin-system-health.repository';

export type { CronJobInfo };

export interface AdminSystemAlert {
  code: 'cron_job_failed' | 'storage_queue_pending' | 'unverified_users_24h';
  severity: 'warn' | 'danger';
  title: string;
  description: string;
}

export interface AdminSystemHealthResponse {
  cronJobs: CronJobInfo[];
  storageQueue: {
    pendingDeletions: number;
  };
  unverifiedUsers24h: number;
  alerts: AdminSystemAlert[];
  storage: StorageUsageInfo & {
    bucketName: string;
    pendingDeletions: number;
    cdnEnabled: boolean | null;
  };
  database: DatabaseHealthInfo & {
    engine: string | null;
    lastBackupAt: string | null;
  };
  generalConfig: {
    appVersion: string | null;
    environment: string;
    publicAppUrl: string;
    adminPanelUrl: string;
    registrationOpen: boolean;
    defaultSearchRadiusKm: number;
    sessionDeadlineDays: number;
    maxImagesPerItem: number;
  };
  stackVersions: {
    node: string;
    next: string | null;
    react: string | null;
    redis: string | null;
    nginx: string | null;
  };
}
