import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { CancelDeliveryResponseDto } from '../../dtos/cancel-delivery.dto';
import { computeTimeToSelectMs, safeEmitEvent } from '../../services/analytics.service';
import { emitNoShowReputation } from '../../services/reputation.service';

export class CancelDeliveryUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
  ) {}

  async execute(
    sessionId: string,
    donorId: string,
    noShow: boolean,
  ): Promise<CancelDeliveryResponseDto> {
    const result = await this.deliverySessionRepo.cancelDelivery({ sessionId, donorId, noShow });

    const eventName = noShow ? 'session.cancelled_no_show' : 'session.cancelled_donor';
    const durationMs = computeTimeToSelectMs(result.sessionCreatedAt);
    safeEmitEvent(
      eventName,
      donorId,
      {
        sessionId,
        itemId: result.itemId,
        category: result.category,
        durationMs,
      },
      sessionId,
    );

    if (noShow && result.receiverId != null) {
      emitNoShowReputation(
        result.receiverId,
        result.receiverDelta!,
        result.receiverNewScore!,
        result.receiverConsecutiveNoShows!,
      );
    }

    return {
      status: 'cancelled',
      noShowDeclared: result.noShowDeclared,
      completedAt: result.completedAt,
    };
  }
}
