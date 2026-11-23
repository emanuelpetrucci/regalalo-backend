import { Router } from 'express';
import { healthRouter } from './health.routes';
import { createAuthRouter } from './auth.routes';
import { createItemRouter } from './items.routes';
import { deliverySessionRouter } from './delivery-sessions.routes';
import { userRouter } from './users.routes';
import { NominatimAdapter } from '../../../infrastructure/geocoding/nominatim.adapter';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { createJobsRouter } from './jobs.routes';
import { createAdminRouter } from './admin.routes';
import { createReportRouter } from './reports.routes';
import { isE2eApiAvailable } from '../../../e2e/e2e-guard';
import { createE2eRouter } from './e2e.routes';

const geocodingService = new NominatimAdapter();

const router = Router();

router.use(healthRouter);
router.use('/auth', createAuthRouter({ geocodingService }));
router.use('/items', createItemRouter({ geocodingService }));
router.use('/delivery-sessions', deliverySessionRouter);
router.use('/users', userRouter);
router.use('/jobs', createJobsRouter());
router.use('/admin', createAdminRouter());
router.use('/reports', createReportRouter());

if (isE2eApiAvailable()) {
  router.use('/e2e', createE2eRouter());
}

export { router };

export const authMiddleware = createAuthMiddleware(
  new JwtService(),
  new PostgresUserRepository(db),
);
