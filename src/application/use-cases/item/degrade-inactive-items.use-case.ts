import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { logger } from '../../../infrastructure/logging/logger';
import { computeDaysActiveBeforeDegradation, safeEmitEvent } from '../../services/analytics.service';

export class DegradeInactiveItemsUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(): Promise<void> {
    const items = await this.itemRepo.findNewlyDegradedItems();
    for (const item of items) {
      if (item.donorId && item.category) {
        safeEmitEvent('item.degraded', item.donorId, {
          itemId: item.itemId,
          category: item.category,
          daysActiveBeforeDegradation: computeDaysActiveBeforeDegradation(item.createdAt),
        });
      }

      try {
        await this.mailService.send({
          to: item.donorEmail,
          templateId: 'TPL-007',
          variables: {
            recipientEmail: item.donorEmail,
            firstName: item.donorFirstName,
            itemTitle: item.itemTitle,
            itemId: item.itemId,
          },
          language: item.donorPreferredLanguage,
        });
      } catch (err) {
        logger.error({ err, itemId: item.itemId }, 'Failed to send degradation email');
      }
    }
  }
}
