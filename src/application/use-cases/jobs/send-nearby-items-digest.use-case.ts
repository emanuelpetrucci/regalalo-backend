import {
  DigestEligibleUser,
  IItemRepository,
  NearbyDigestRecipient,
  PendingDigestItem,
} from '../../../domain/repositories/item.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { ItemDigestResultDto } from '../../dtos/jobs/item-digest-result.dto';
import { resolveStoragePublicUrl } from '../../../infrastructure/storage/resolve-storage-public-url';
import { env } from '../../../config/env';
import { logger } from '../../../infrastructure/logging/logger';

function mergeRecipient(
  map: Map<string, NearbyDigestRecipient>,
  user: DigestEligibleUser,
  item: PendingDigestItem,
  distanceKm: number,
): void {
  const imageUrl = item.firstImagePath
    ? resolveStoragePublicUrl(item.firstImagePath)
    : undefined;

  const entry = map.get(user.userId) ?? {
    userId: user.userId,
    email: user.email,
    firstName: user.firstName,
    preferredLanguage: user.preferredLanguage,
    items: [],
  };

  if (!entry.items.some(i => i.itemId === item.itemId)) {
    entry.items.push({
      itemId: item.itemId,
      title: item.title,
      condition: item.condition,
      distanceKm,
      ...(imageUrl ? { imageUrl } : {}),
    });
  }

  map.set(user.userId, entry);
}

export class SendNearbyItemsDigestUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(): Promise<ItemDigestResultDto> {
    const pendingItems = await this.itemRepo.claimPendingDigestItems();
    if (pendingItems.length === 0) {
      return {
        processedItems: 0,
        recipientsNotified: 0,
        emailsSent: 0,
        emailsFailed: 0,
      };
    }

    const recipientMap = new Map<string, NearbyDigestRecipient>();

    for (const item of pendingItems) {
      const users = await this.itemRepo.findEligibleDigestUsersForItem(item);
      for (const user of users) {
        mergeRecipient(recipientMap, user, item, user.distanceKm);
      }
    }

    if (recipientMap.size === 0) {
      return {
        processedItems: pendingItems.length,
        recipientsNotified: 0,
        emailsSent: 0,
        emailsFailed: 0,
      };
    }

    const appUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const recipient of recipientMap.values()) {
      recipient.items.sort((a, b) => a.distanceKm - b.distanceKm);
      try {
        await this.mailService.send({
          to: recipient.email,
          templateId: 'TPL-010',
          variables: {
            recipientEmail: recipient.email,
            firstName: recipient.firstName,
            appUrl,
            itemCount: recipient.items.length,
            itemsJson: JSON.stringify(recipient.items),
          },
          language: recipient.preferredLanguage,
        });
        emailsSent++;
      } catch (err) {
        emailsFailed++;
        logger.warn(
          {
            err,
            userId: recipient.userId,
            itemIds: recipient.items.map(i => i.itemId),
          },
          'Failed to send nearby items digest email',
        );
      }
    }

    return {
      processedItems: pendingItems.length,
      recipientsNotified: recipientMap.size,
      emailsSent,
      emailsFailed,
    };
  }
}
