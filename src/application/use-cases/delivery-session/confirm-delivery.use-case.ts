import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { ConfirmDeliveryResponseDto } from '../../dtos/confirm-delivery.dto';
import { computeTimeToSelectMs, safeEmitEvent } from '../../services/analytics.service';
import { emitDeliveryCompletedReputation } from '../../services/reputation.service';

export class ConfirmDeliveryUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
  ) {}

  async execute(
    sessionId: string,
    donorId: string,
  ): Promise<ConfirmDeliveryResponseDto> {
    const result = await this.deliverySessionRepo.confirmDelivery(sessionId, donorId);

    const durationMs = computeTimeToSelectMs(result.sessionCreatedAt);
    safeEmitEvent(
      'session.completed',
      donorId,
      {
        itemId: result.itemId,
        category: result.category,
        weightRange: result.weightRange,
        durationMs,
      },
      sessionId,
    );
    emitDeliveryCompletedReputation(
      result.donorId,
      result.receiverId,
      result.donorDelta,
      result.receiverDelta,
      result.donorNewScore,
      result.receiverNewScore,
    );

    return { status: 'completed', completedAt: result.completedAt.toISOString() };
  }
}
