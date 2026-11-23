import { Request, Response, NextFunction } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { env } from '../../../config/env';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { purgeDatabase } from '../../../e2e/database/purge-database';
import { recreateDatabase } from '../../../e2e/database/recreate-database';
import { resolveScenarioBuilder } from '../../../e2e/scenarios/registry';
import type { E2eScenarioResponse, E2eActorToken } from '../../../e2e/scenarios/types';
import { degradeItemById } from '../../../e2e/time/degrade-item';
import { expireSessionById } from '../../../e2e/time/expire-session';
import { backdateItemCompleted } from '../../../e2e/time/backdate-item-completed';
import { purgeContactChannelForSession } from '../../../e2e/time/purge-contact-channel';
import { purgeImagesViewForItem } from '../../../e2e/time/purge-images-view';
import { incrementCyclesAtLimitForUser } from '../../../e2e/time/increment-cycles-at-limit';
import { issuePasswordResetToken } from '../../../e2e/auth/issue-reset-token';
import { verifyUserEmailById } from '../../../e2e/auth/verify-user-email';

export class E2eController {
  constructor(private readonly jwtService = new JwtService()) {}

  health(_req: Request, res: Response): void {
    res.json({ status: 'ok', e2e: true });
  }

  async purge(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await purgeDatabase(db);
      res.json({ purged: true });
    } catch (err) {
      next(err);
    }
  }

  async recreate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await recreateDatabase(env.DATABASE_URL);
      res.json({ recreated: true });
    } catch (err) {
      next(err);
    }
  }

  async resetScenario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.params['name'];
      const builder = resolveScenarioBuilder(name);
      if (!builder) {
        res.status(404).json({ error: `Unknown scenario: ${name}` });
        return;
      }

      await purgeDatabase(db);
      const built = await builder({ scenarioName: name });

      const actors: Record<string, E2eActorToken> = {};
      for (const [key, actor] of Object.entries(built.actors)) {
        const token = this.jwtService.sign({ sub: actor.id, jwtVersion: actor.jwtVersion });
        actors[key] = {
          id: actor.id,
          email: actor.email,
          password: actor.password,
          token,
          firstName: actor.firstName,
          lastName: actor.lastName,
        };
      }

      const payload: E2eScenarioResponse = {
        scenario: name,
        actors,
        entities: built.entities,
      };
      res.json(payload);
    } catch (err) {
      next(err);
    }
  }

  async degradeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await degradeItemById(db, req.params['itemId']!);
      res.json({ degraded: true });
    } catch (err) {
      next(err);
    }
  }

  async expireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await expireSessionById(db, req.params['sessionId']!);
      res.json({ expired: true });
    } catch (err) {
      next(err);
    }
  }

  async backdateItemCompleted(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const days = Number((req.body as { days?: number })?.days ?? 31);
      await backdateItemCompleted(db, req.params['itemId']!, days);
      res.json({ backdated: true, days });
    } catch (err) {
      next(err);
    }
  }

  async purgeContact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await purgeContactChannelForSession(db, req.params['sessionId']!);
      res.json({ purged: true });
    } catch (err) {
      next(err);
    }
  }

  async purgeImagesView(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await purgeImagesViewForItem(db, req.params['itemId']!);
      res.json({ ready: true });
    } catch (err) {
      next(err);
    }
  }

  async incrementCycles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await incrementCyclesAtLimitForUser(db, req.params['userId']!);
      res.json({ incremented: true });
    } catch (err) {
      next(err);
    }
  }

  async issueResetToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = await issuePasswordResetToken(db, req.params['userId']!);
      res.json({ token });
    } catch (err) {
      next(err);
    }
  }

  async verifyUserEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await verifyUserEmailById(db, req.params['userId']!);
      res.json({ verified: true });
    } catch (err) {
      next(err);
    }
  }
}
