import { Request, Response } from 'express';
import { SendNearbyItemsDigestUseCase } from '../../../application/use-cases/jobs/send-nearby-items-digest.use-case';

export class JobsController {
  constructor(private readonly sendNearbyItemsDigestUseCase: SendNearbyItemsDigestUseCase) {}

  async nearbyItemsDigest(_req: Request, res: Response): Promise<void> {
    const start = Date.now();
    const result = await this.sendNearbyItemsDigestUseCase.execute();
    res.status(200).json({
      ...result,
      executionMs: Date.now() - start,
    });
  }
}
