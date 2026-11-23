import { logger } from '../../../../infrastructure/logging/logger';
import { IItemRepository } from '../../../../domain/repositories/item.repository';
import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IMailService } from '../../../../domain/services/mail.service';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminItemActionResponse } from '../../../dtos/admin/admin-item-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

export class AdminCancelItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    itemId: string,
    ipAddress: string,
  ): Promise<AdminItemActionResponse> {
    const ownership = await this.itemRepo.findItemOwnership(itemId);
    if (!ownership) throw new NotFoundException('Object not found');
    if (!['active', 'reserved'].includes(ownership.status)) {
      throw new ConflictException('ENTITY_STATE_CONFLICT');
    }

    const payloadSnapshot = { status: ownership.status };

    const result = await this.itemRepo.cancelItem(itemId);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'item.cancelled',
      entityType: 'item',
      entityId: itemId,
      payloadSnapshot,
      ipAddress,
    });

    if (result.receiverId) {
      try {
        const receiver = await this.userRepo.findById(result.receiverId);
        if (receiver) {
          this.mailService
            .send({
              to: receiver.email,
              templateId: 'TPL-005',
              variables: {
                recipientEmail: receiver.email,
                firstName: receiver.firstName,
                itemTitle: result.itemTitle,
              },
            })
            .catch(() => {});
        }
      } catch (err) {
        logger.warn(err, 'Admin cancel: receiver lookup failed');
      }
    }

    return { message: 'Objeto cancelado' };
  }
}
