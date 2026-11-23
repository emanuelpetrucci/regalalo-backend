import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { computeTimeToSelectMs, safeEmitEvent } from '../../services/analytics.service';
import { logger } from '../../../infrastructure/logging/logger';

export class ExpireDeliverySessionsUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(): Promise<void> {
    const sessions = await this.deliverySessionRepo.findExpiredSessions();
    for (const session of sessions) {
      safeEmitEvent(
        'session.expired',
        session.donorId,
        {
          sessionId: session.sessionId,
          itemId: session.itemId,
          category: session.category,
          durationMs: computeTimeToSelectMs(session.createdAt),
        },
        session.sessionId,
      );

      try {
        await this.mailService.send({
          to: session.donorEmail,
          templateId: 'TPL-004',
          variables: {
            recipientEmail: session.donorEmail,
            firstName: session.donorFirstName,
            itemTitle: session.itemTitle,
            itemId: session.itemId,
          },
          language: session.donorPreferredLanguage,
        });
      } catch (err) {
        logger.error({ err, sessionId: session.sessionId }, 'Failed to send session expiration email');
      }
    }
  }
}
