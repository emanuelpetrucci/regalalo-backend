import { logger } from '../../../infrastructure/logging/logger';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { SelectReceiverResponseDto } from '../../dtos/select-receiver.dto';
import { computeTimeToSelectMs, safeEmitEvent } from '../../services/analytics.service';

export class SelectReceiverUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly requestRepo: IRequestRepository,
    private readonly deliverySessionRepo: IDeliverySessionRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(
    itemId: string,
    requestId: string,
    donorId: string,
    contactChannel: string,
  ): Promise<SelectReceiverResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== donorId) throw new ForbiddenException('Forbidden');

    const candidates = await this.requestRepo.findRankedCandidates(itemId);
    const candidateCount = candidates.length;

    const result = await this.deliverySessionRepo.selectReceiver({
      itemId,
      requestId,
      donorId,
      contactChannel,
    });

    if (item.createdAt && result.sessionId) {
      safeEmitEvent(
        'item.receiver_selected',
        donorId,
        {
          itemId,
          candidateCount,
          timeToSelectMs: computeTimeToSelectMs(item.createdAt),
        },
        result.sessionId,
      );
    }

    void Promise.all([
      this.userRepo.findById(result.receiverId),
      this.userRepo.findById(donorId),
    ]).then(([receiver, donor]) => {
      if (receiver) {
        return this.mailService.send({
          to: receiver.email,
          templateId: 'TPL-003',
          variables: {
            recipientEmail: receiver.email,
            firstName: receiver.firstName,
            itemTitle: result.itemTitle,
            itemCondition: result.itemCondition,
            donorReputationScore: donor?.reputationScore ?? 0,
            sessionDeadlineAt: result.deadlineAt.toISOString(),
            sessionId: result.sessionId,
          },
          language: receiver.preferredLanguage,
        });
      }
    }).catch((err) => {
      logger.warn(err, 'Failed to send selection notification email for session %s', result.sessionId);
    });

    return {
      sessionId: result.sessionId,
      status: result.status,
      deadlineAt: result.deadlineAt,
    };
  }
}
