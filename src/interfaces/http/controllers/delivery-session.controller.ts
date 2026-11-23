import { Request, Response, NextFunction } from 'express';
import { GetDeliverySessionUseCase } from '../../../application/use-cases/delivery-session/get-delivery-session.use-case';
import { ConfirmDeliveryUseCase } from '../../../application/use-cases/delivery-session/confirm-delivery.use-case';
import { CancelDeliveryUseCase } from '../../../application/use-cases/delivery-session/cancel-delivery.use-case';

export class DeliverySessionController {
  constructor(
    private readonly getDeliverySessionUseCase: GetDeliverySessionUseCase,
    private readonly confirmDeliveryUseCase: ConfirmDeliveryUseCase,
    private readonly cancelDeliveryUseCase: CancelDeliveryUseCase,
  ) {}

  async getDeliverySession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getDeliverySessionUseCase.execute(
        req.params.id,
        req.currentUser!.id,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async confirmDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.confirmDeliveryUseCase.execute(
        req.params.id,
        req.currentUser!.id,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async cancelDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.cancelDeliveryUseCase.execute(
        req.params.id,
        req.currentUser!.id,
        req.body.noShow,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
