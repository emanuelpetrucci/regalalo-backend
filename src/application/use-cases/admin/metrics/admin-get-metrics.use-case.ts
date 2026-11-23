import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IItemRepository } from '../../../../domain/repositories/item.repository';
import { IDeliverySessionRepository } from '../../../../domain/repositories/delivery-session.repository';
import { IReportRepository } from '../../../../domain/repositories/report.repository';
import type { AdminMetricsResponse } from '../../../dtos/admin/admin-metrics.dto';

export class AdminGetMetricsUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly itemRepo: IItemRepository,
    private readonly sessionRepo: IDeliverySessionRepository,
    private readonly reportRepo: IReportRepository,
  ) {}

  async execute(): Promise<AdminMetricsResponse> {
    const [
      usersTotal,
      usersActive,
      usersSuspended,
      usersUnverifiedOver24h,
      usersPassive,
      usersHoarders,
      itemsByStatus,
      itemsDegraded,
      sessionsActive,
      sessionsByStatusLast30Days,
      sessionsNoShowLast30Days,
      reportMetrics,
    ] = await Promise.all([
      this.userRepo.countTotal(),
      this.userRepo.countActive(),
      this.userRepo.countSuspended(),
      this.userRepo.countUnverifiedOver24h(),
      this.userRepo.countPassive(),
      this.userRepo.countHoarders(),
      this.itemRepo.countByStatus(),
      this.itemRepo.countDegraded(),
      this.sessionRepo.countActive(),
      this.sessionRepo.countByStatusLast30Days(),
      this.sessionRepo.countNoShowLast30Days(),
      this.reportRepo.countMetrics(),
    ]);

    const { completedLast30Days, expiredLast30Days, cancelledLast30Days } = {
      completedLast30Days: sessionsByStatusLast30Days.completed,
      expiredLast30Days: sessionsByStatusLast30Days.expired,
      cancelledLast30Days: sessionsByStatusLast30Days.cancelled,
    };

    const denominator = completedLast30Days + cancelledLast30Days;
    const noShowRate = denominator === 0 ? null : sessionsNoShowLast30Days / denominator;

    return {
      users: {
        total: usersTotal,
        active: usersActive,
        suspended: usersSuspended,
        unverifiedOver24h: usersUnverifiedOver24h,
        passive: usersPassive,
        hoarders: usersHoarders,
      },
      items: {
        active: itemsByStatus.active,
        reserved: itemsByStatus.reserved,
        completed: itemsByStatus.completed,
        cancelled: itemsByStatus.cancelled,
        degraded: itemsDegraded,
      },
      sessions: {
        active: sessionsActive,
        completedLast30Days,
        expiredLast30Days,
        cancelledLast30Days,
        noShowRate,
      },
      reports: {
        pending: reportMetrics.pending,
        resolvedLast30Days: reportMetrics.resolvedLast30Days,
        archivedLast30Days: reportMetrics.archivedLast30Days,
      },
    };
  }
}
