import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import {
  resolveStoragePublicUrl,
  resolveStoragePublicUrls,
} from '../../../infrastructure/storage/resolve-storage-public-url';
import { GetDeliverySessionResponseDto } from '../../dtos/get-delivery-session.dto';

export class GetDeliverySessionUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
  ) {}

  async execute(
    sessionId: string,
    currentUserId: string,
  ): Promise<GetDeliverySessionResponseDto> {
    const session = await this.deliverySessionRepo.findByIdForParticipant(
      sessionId,
      currentUserId,
    );
    if (!session) throw new NotFoundException('Sesión no encontrada');

    const isParticipant =
      session.donorId === currentUserId || session.receiverId === currentUserId;
    if (!isParticipant) throw new ForbiddenException('Forbidden');

    const isDonor = currentUserId === session.donorId;
    const isReceiver = currentUserId === session.receiverId;
    const isActive = session.status === 'active';
    const canRevealContact = isActive && !session.contactPurged;

    const revealContactChannel = isReceiver && canRevealContact;
    const revealSharedContactChannel =
      isDonor && canRevealContact && session.contactChannel !== null;
    const revealReceiverContactChannel =
      isDonor && isActive && !session.receiverContactPurged;

    return {
      id: session.id,
      itemId: session.itemId,
      status: session.status,
      contactChannel: revealContactChannel ? session.contactChannel : null,
      sharedContactChannel: revealSharedContactChannel ? session.contactChannel : null,
      receiverContactChannel: revealReceiverContactChannel ? session.receiverContactChannel : null,
      deadlineAt: session.deadlineAt,
      donorConfirmed: session.donorConfirmed,
      noShowDeclared: session.noShowDeclared,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      role: isDonor ? 'donor' : 'receiver',
      item: {
        title: session.itemTitle,
        condition: session.itemCondition as GetDeliverySessionResponseDto['item']['condition'],
        category: session.itemCategory,
        images: resolveStoragePublicUrls(session.itemImagePaths),
      },
      otherParty: {
        userId: session.otherPartyUserId,
        firstName: session.otherPartyFirstName,
        lastName: session.otherPartyLastName,
        avatarUrl: session.otherPartyAvatarUrl
          ? resolveStoragePublicUrl(session.otherPartyAvatarUrl)
          : null,
        reputationScore: session.otherPartyReputationScore,
        distanceMeters: session.otherPartyDistanceMeters,
        locationName: session.otherPartyLocationName,
      },
    };
  }
}
