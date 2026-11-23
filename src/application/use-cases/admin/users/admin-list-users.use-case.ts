import { IUserRepository } from '../../../../domain/repositories/user.repository';
import {
  AdminUserListQuery,
  AdminUserListResponse,
} from '../../../dtos/admin/admin-user-list.dto';

export class AdminListUsersUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const { users, total } = await this.userRepo.adminFindAll(query);
    const totalPages = Math.ceil(total / query.limit);

    return {
      users,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages,
      },
    };
  }
}
