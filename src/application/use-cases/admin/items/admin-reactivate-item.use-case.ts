import { IItemRepository } from '../../../../domain/repositories/item.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminItemActionResponse } from '../../../dtos/admin/admin-item-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

export class AdminReactivateItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    itemId: string,
    ipAddress: string,
  ): Promise<AdminItemActionResponse> {
    const ownership = await this.itemRepo.findItemOwnership(itemId);
    if (!ownership) throw new NotFoundException('Object not found');
    if (ownership.status !== 'cancelled') {
      throw new ConflictException('Only cancelled objects can be reactivated');
    }

    const payloadSnapshot = { status: ownership.status };

    await this.itemRepo.adminReactivateItem(itemId);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'item.reactivated',
      entityType: 'item',
      entityId: itemId,
      payloadSnapshot,
      ipAddress,
    });

    return { message: 'Objeto reactivado' };
  }
}
