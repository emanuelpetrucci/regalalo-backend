import { IAdminSystemHealthRepository } from '../../../../domain/repositories/admin-system-health.repository';
import { env } from '../../../../config/env';
import type { AdminSystemAlert, AdminSystemHealthResponse } from '../../../dtos/admin/admin-system-health.dto';

const DEFAULT_SEARCH_RADIUS_KM = 50;
const SESSION_DEADLINE_DAYS = 7;
const MAX_IMAGES_PER_ITEM = 5;

export class AdminGetSystemHealthUseCase {
  constructor(private readonly systemHealthRepo: IAdminSystemHealthRepository) {}

  private buildAlerts(
    failedCronJobs: Array<{ jobName: string; returnMessage: string | null }>,
    pendingDeletions: number,
    unverifiedUsers24h: number,
  ): AdminSystemAlert[] {
    const alerts: AdminSystemAlert[] = [];

    for (const failedJob of failedCronJobs) {
      alerts.push({
        code: 'cron_job_failed',
        severity: 'danger',
        title: 'Job de sistema con error',
        description: failedJob.returnMessage
          ? `${failedJob.jobName}: ${failedJob.returnMessage}`
          : `${failedJob.jobName}: ejecución fallida`,
      });
    }

    if (pendingDeletions > 0) {
      alerts.push({
        code: 'storage_queue_pending',
        severity: 'warn',
        title: 'Cola de Storage pendiente',
        description: `${pendingDeletions} eliminaciones pendientes en storage_deletion_queue`,
      });
    }

    if (unverifiedUsers24h > 0) {
      alerts.push({
        code: 'unverified_users_24h',
        severity: 'warn',
        title: 'Usuarios sin verificar >24h',
        description: `${unverifiedUsers24h} usuarios aún no verificaron su email`,
      });
    }

    return alerts;
  }

  async execute(): Promise<AdminSystemHealthResponse> {
    const [cronJobs, pendingDeletions, unverifiedUsers24h] = await Promise.all([
      this.systemHealthRepo.getCronJobsLastRun(),
      this.systemHealthRepo.countPendingStorageDeletions(),
      this.systemHealthRepo.countUnverifiedUsers24h(),
    ]);
    const [storageUsageResult, databaseHealthResult] = await Promise.allSettled([
      this.systemHealthRepo.getStorageUsage(env.SUPABASE_STORAGE_BUCKET),
      this.systemHealthRepo.getDatabaseHealth(),
    ]);

    const storageUsage = storageUsageResult.status === 'fulfilled'
      ? storageUsageResult.value
      : { objectsStored: null, usedBytes: null };
    const databaseHealth = databaseHealthResult.status === 'fulfilled'
      ? databaseHealthResult.value
      : {
        serverVersion: null,
        activeConnections: null,
        maxConnections: null,
        sizeBytes: null,
        replicationActive: null,
      };

    const failedCronJobs = cronJobs
      .filter((job) => job.lastStatus === 'failed')
      .map((job) => ({ jobName: job.jobName, returnMessage: job.returnMessage }));
    const alerts = this.buildAlerts(failedCronJobs, pendingDeletions, unverifiedUsers24h);

    return {
      cronJobs,
      storageQueue: { pendingDeletions },
      unverifiedUsers24h,
      alerts,
      storage: {
        bucketName: env.SUPABASE_STORAGE_BUCKET,
        objectsStored: storageUsage.objectsStored,
        usedBytes: storageUsage.usedBytes,
        pendingDeletions,
        cdnEnabled: env.STORAGE_DRIVER === 'supabase' ? true : null,
      },
      database: {
        ...databaseHealth,
        engine: databaseHealth.serverVersion ? `PostgreSQL ${databaseHealth.serverVersion}` : null,
        lastBackupAt: null,
      },
      generalConfig: {
        appVersion: process.env['APP_VERSION'] ?? process.env['npm_package_version'] ?? null,
        environment: process.env['APP_ENV'] ?? env.NODE_ENV,
        publicAppUrl: env.APP_PUBLIC_URL,
        adminPanelUrl: env.ADMIN_CORS_ORIGIN,
        registrationOpen: true,
        defaultSearchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
        sessionDeadlineDays: SESSION_DEADLINE_DAYS,
        maxImagesPerItem: MAX_IMAGES_PER_ITEM,
      },
      stackVersions: {
        node: process.version,
        next: null,
        react: null,
        redis: null,
        nginx: null,
      },
    };
  }
}
