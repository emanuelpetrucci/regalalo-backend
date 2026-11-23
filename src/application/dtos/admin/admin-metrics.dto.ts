export interface AdminMetricsResponse {
  users: {
    total: number;
    active: number;
    suspended: number;
    unverifiedOver24h: number;
    passive: number;
    hoarders: number;
  };
  items: {
    active: number;
    reserved: number;
    completed: number;
    cancelled: number;
    degraded: number;
  };
  sessions: {
    active: number;
    completedLast30Days: number;
    expiredLast30Days: number;
    cancelledLast30Days: number;
    noShowRate: number | null;
  };
  reports: {
    pending: number;
    resolvedLast30Days: number;
    archivedLast30Days: number;
  };
}
