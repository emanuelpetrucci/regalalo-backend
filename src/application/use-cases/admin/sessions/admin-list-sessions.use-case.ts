import { IDeliverySessionRepository } from '../../../../domain/repositories/delivery-session.repository';
import {
  AdminSessionListQuery,
  AdminSessionListItem,
  AdminSessionListResponse,
} from '../../../dtos/admin/admin-session-list.dto';

export class AdminListSessionsUseCase {
  constructor(private readonly sessionRepo: IDeliverySessionRepository) {}

  async execute(query: AdminSessionListQuery): Promise<AdminSessionListResponse> {
    const { sessions: records, total } = await this.sessionRepo.adminFindAll(query);
    const totalPages = Math.ceil(total / query.limit);

    const sessions: AdminSessionListItem[] = records.map(r => ({
      id: r.id,
      status: r.status,
      deadlineAt: r.deadlineAt,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      contactPurged: r.contactPurged,
      noShowDeclared: r.noShowDeclared,
      item: { id: r.itemId, title: r.itemTitle },
      donor: {
        id: r.donorId,
        firstName: r.donorFirstName,
        lastName: r.donorLastName,
        email: r.donorEmail,
      },
      receiver: {
        id: r.receiverId,
        firstName: r.receiverFirstName,
        lastName: r.receiverLastName,
        email: r.receiverEmail,
      },
    }));

    const adjustedPage = totalPages > 0 ? Math.min(query.page, totalPages) : 1;

    return {
      sessions,
      pagination: {
        total,
        page: adjustedPage,
        limit: query.limit,
        totalPages,
      },
    };
  }
}
