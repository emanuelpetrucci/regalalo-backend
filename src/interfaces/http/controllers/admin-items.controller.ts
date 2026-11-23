import { Request, Response, NextFunction } from 'express';
import { AdminListItemsUseCase } from '../../../application/use-cases/admin/items/admin-list-items.use-case';
import { AdminGetItemDetailUseCase } from '../../../application/use-cases/admin/items/admin-get-item-detail.use-case';
import { AdminCancelItemUseCase } from '../../../application/use-cases/admin/items/admin-cancel-item.use-case';
import { AdminReactivateItemUseCase } from '../../../application/use-cases/admin/items/admin-reactivate-item.use-case';
import type { AdminItemListQuery } from '../../../application/dtos/admin/admin-item-list.dto';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

function assertAdminUser(req: Request): { id: string } {
  if (!req.adminUser) {
    throw new UnauthorizedException('Authentication required');
  }
  return req.adminUser;
}

export class AdminItemsController {
  constructor(
    private readonly listItemsUseCase: AdminListItemsUseCase,
    private readonly getItemDetailUseCase: AdminGetItemDetailUseCase,
    private readonly cancelItemUseCase: AdminCancelItemUseCase,
    private readonly reactivateItemUseCase: AdminReactivateItemUseCase,
  ) {}

  async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AdminItemListQuery;
      const result = await this.listItemsUseCase.execute(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getItemDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getItemDetailUseCase.execute(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async cancelItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.cancelItemUseCase.execute(
        adminUser.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async reactivateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.reactivateItemUseCase.execute(
        adminUser.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
