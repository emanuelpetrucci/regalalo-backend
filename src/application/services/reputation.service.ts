import { safeEmitEvent } from './analytics.service';

export function emitDeliveryCompletedReputation(
  donorId: string,
  receiverId: string,
  donorDelta: number,
  receiverDelta: number,
  donorNewScore: number,
  receiverNewScore: number,
): void {
  safeEmitEvent('reputation.changed', donorId, {
    delta: donorDelta,
    type: 'delivery_completed',
    newScore: donorNewScore,
    consecutiveNoShows: 0,
  });
  safeEmitEvent('reputation.changed', receiverId, {
    delta: receiverDelta,
    type: 'delivery_completed',
    newScore: receiverNewScore,
    consecutiveNoShows: 0,
  });
}

export function emitNoShowReputation(
  receiverId: string,
  delta: number,
  newScore: number,
  consecutiveNoShows: number,
): void {
  safeEmitEvent('reputation.changed', receiverId, {
    delta,
    type: 'no_show',
    newScore,
    consecutiveNoShows,
  });
}
