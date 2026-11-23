import { IItemRepository } from '../../../../domain/repositories/item.repository';
import {
  AdminItemListQuery,
  AdminItemListResponse,
  AdminItemListItem,
} from '../../../dtos/admin/admin-item-list.dto';

export class AdminListItemsUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(query: AdminItemListQuery): Promise<AdminItemListResponse> {
    const { items: records, total } = await this.itemRepo.adminFindAll(query);
    const totalPages = Math.ceil(total / query.limit);

    const items: AdminItemListItem[] = records.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      condition: r.condition,
      category: r.category,
      weightRange: r.weightRange,
      status: r.status,
      requestsPaused: r.requestsPaused,
      pausedByAdmin: r.pausedByAdmin,
      degradedAt: r.degradedAt,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      donor: {
        id: r.donorId,
        firstName: r.donorFirstName,
        lastName: r.donorLastName,
        email: r.donorEmail,
      },
      requestCount: r.requestCount,
      images: r.images,
    }));

    const adjustedPage = totalPages > 0 ? Math.min(query.page, totalPages) : query.page;

    return {
      items,
      pagination: {
        total,
        page: adjustedPage,
        limit: query.limit,
        totalPages,
      },
    };
  }
}
