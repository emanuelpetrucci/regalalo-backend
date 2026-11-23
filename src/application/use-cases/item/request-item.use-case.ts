import { logger } from '../../../infrastructure/logging/logger';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { LimitExceededException } from '../../../domain/exceptions/limit-exceeded.exception';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';
import { RequestItemResponseDto } from '../../dtos/request-item.dto';
import { buildLimitReachedProperties, safeEmitEvent } from '../../services/analytics.service';

export class RequestItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly requestRepo: IRequestRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(itemId: string, requesterId: string, contactChannel: string): Promise<RequestItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.status !== 'active') throw new ConflictException('Item is not available');
    if (item.requestsPaused) throw new ConflictException('Requests are paused for this item');
    if (item.donorId === requesterId) throw new BadRequestException('No puedes solicitar tu propio objeto');

    try {
      const result = await this.requestRepo.create({ itemId, requesterId, contactChannel });

      if (item.category) {
        safeEmitEvent('item.requested', requesterId, {
          itemId,
          category: item.category,
        });
      }

      void this.userRepo
        .findById(item.donorId)
        .then((donor) => {
          if (!donor) return;
          return this.mailService.send({
            to: donor.email,
            templateId: 'TPL-006',
            variables: {
              recipientEmail: donor.email,
              firstName: donor.firstName,
              itemTitle: item.title,
              itemId,
            },
            language: donor.preferredLanguage,
          });
        })
        .catch((err) => {
          logger.warn(err, 'Failed to send request notification email for item %s', itemId);
        });

      return result;
    } catch (err) {
      if (err instanceof LimitExceededException) {
        safeEmitEvent('limit.reached', requesterId, buildLimitReachedProperties());
        throw err;
      }
      throw err;
    }
  }
}
