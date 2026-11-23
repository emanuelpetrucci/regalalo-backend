import { logger } from '../../../infrastructure/logging/logger';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { CancelItemResponseDto } from '../../dtos/cancel-item.dto';
import { safeEmitEvent } from '../../services/analytics.service';

export class CancelItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(itemId: string, userId: string): Promise<CancelItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');

    let hadActiveSession = false;
    try {
      hadActiveSession = await this.itemRepo.hasActiveDeliverySession(itemId);
    } catch (err) {
      logger.warn(err, 'Failed to check active delivery session for item %s', itemId);
    }

    const result = await this.itemRepo.cancelItem(itemId);

    if (!result.alreadyCancelled && item.category) {
      safeEmitEvent('item.cancelled', userId, {
        itemId,
        category: item.category,
        hadActiveSession,
      });
    }

    if (result.receiverId) {
      try {
        const receiver = await this.userRepo.findById(result.receiverId);
        if (receiver) {
          this.mailService.send({
            to: receiver.email,
            templateId: 'TPL-005',
            variables: {
              recipientEmail: receiver.email,
              firstName: receiver.firstName,
              itemTitle: result.itemTitle,
            },
            language: receiver.preferredLanguage,
          }).catch(err => logger.warn(err, 'EVT-005 email send failed'));
        }
      } catch (err) {
        logger.warn(err, 'EVT-005 receiver lookup failed');
      }
    }

    return { message: 'Item cancelled successfully' };
  }
}
