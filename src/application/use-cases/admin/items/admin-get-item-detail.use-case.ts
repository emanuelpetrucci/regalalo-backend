import { IItemRepository } from '../../../../domain/repositories/item.repository';
import { AdminItemDetailResponse } from '../../../dtos/admin/admin-item-detail.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';

export class AdminGetItemDetailUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemId: string): Promise<AdminItemDetailResponse> {
    const record = await this.itemRepo.adminFindById(itemId);
    if (!record) throw new NotFoundException('Object not found');

    return {
      id: record.id,
      title: record.title,
      description: record.description,
      condition: record.condition,
      category: record.category,
      weightRange: record.weightRange,
      status: record.status,
      requestsPaused: record.requestsPaused,
      pausedByAdmin: record.pausedByAdmin,
      degradedAt: record.degradedAt,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      digestNotifiedAt: record.digestNotifiedAt,
      reservedAt: record.reservedAt,
      donor: {
        id: record.donorId,
        firstName: record.donorFirstName,
        lastName: record.donorLastName,
        email: record.donorEmail,
      },
      requestCount: record.requestCount,
      images: record.images,
      requests: record.requests.map(r => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        requester: {
          id: r.requesterId,
          firstName: r.requesterFirstName,
          lastName: r.requesterLastName,
          email: r.requesterEmail,
          reputationScore: r.requesterReputationScore,
        },
      })),
      activeSession: record.activeSession
        ? {
            id: record.activeSession.id,
            status: record.activeSession.status,
            deadlineAt: record.activeSession.deadlineAt,
            receiverId: record.activeSession.receiverId,
          }
        : null,
    };
  }
}
