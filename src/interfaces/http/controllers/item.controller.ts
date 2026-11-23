import { Request, Response, NextFunction } from 'express';
import { PublishItemUseCase } from '../../../application/use-cases/item/publish-item.use-case';
import { ListItemsUseCase } from '../../../application/use-cases/item/list-items.use-case';
import { GetItemUseCase } from '../../../application/use-cases/item/get-item.use-case';
import { CancelItemUseCase } from '../../../application/use-cases/item/cancel-item.use-case';
import { PauseItemUseCase } from '../../../application/use-cases/item/pause-item.use-case';
import { RequestItemUseCase } from '../../../application/use-cases/item/request-item.use-case';
import { GetRankedCandidatesUseCase } from '../../../application/use-cases/item/get-ranked-candidates.use-case';
import { SelectReceiverUseCase } from '../../../application/use-cases/item/select-receiver.use-case';

export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
    private readonly cancelItemUseCase: CancelItemUseCase,
    private readonly pauseItemUseCase: PauseItemUseCase,
    private readonly requestItemUseCase: RequestItemUseCase,
    private readonly getRankedCandidatesUseCase: GetRankedCandidatesUseCase,
    private readonly selectReceiverUseCase: SelectReceiverUseCase,
  ) {}

  async publishItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const result = await this.publishItemUseCase.execute({
        donorId: req.currentUser!.id,
        title: req.body.title,
        description: req.body.description,
        condition: req.body.condition,
        category: req.body.category,
        weightRange: req.body.weightRange,
        postalCode: req.body.postalCode,
        files: files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname })),
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.listItemsUseCase.execute({
        userId: req.currentUser?.id ?? null,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getItemUseCase.execute(
        req.params.id,
        req.currentUser?.id ?? null,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async cancelItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.cancelItemUseCase.execute(
        req.params.id,
        req.currentUser!.id,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async pauseItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.pauseItemUseCase.execute(
        req.params.id,
        req.currentUser!.id,
        req.body.paused,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getRankedCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getRankedCandidatesUseCase.execute(
        req.params.id,
        req.currentUser!.id,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async requestItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.requestItemUseCase.execute(
        req.params.id,
        req.currentUser!.id,
        req.body.contactChannel,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async selectReceiver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.selectReceiverUseCase.execute(
        req.params.id,
        req.params.requestId,
        req.currentUser!.id,
        req.body.contactChannel,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
