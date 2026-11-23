import { IItemRepository } from '../../domain/repositories/item.repository.js';
import { IUserRepository } from '../../domain/repositories/user.repository.js';

export interface ItemDataForReport {
  donorId: string;
  title: string;
  status: string;
  category: string;
  description: string;
}

export interface UserDataForReport {
  firstName: string;
  lastName: string;
  reputationScore: number;
}

export class ItemReadService {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async getItemForReport(id: string): Promise<ItemDataForReport | null> {
    const item = await this.itemRepo.findForReport(id);
    if (!item) return null;
    return {
      donorId: item.donorId,
      title: item.title,
      status: item.status,
      category: item.category,
      description: item.description,
    };
  }

  async getUserForReport(id: string): Promise<UserDataForReport | null> {
    const user = await this.userRepo.findById(id);
    if (!user) return null;
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      reputationScore: user.reputationScore,
    };
  }
}
