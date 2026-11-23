import { IItemRepository } from '../../../domain/repositories/item.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { PauseItemResponseDto } from '../../dtos/pause-item.dto';
import { safeEmitEvent } from '../../services/analytics.service';

export class PauseItemUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemId: string, userId: string, paused: boolean): Promise<PauseItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');
    if (item.status !== 'active') throw new ConflictException('Item is not in active status');
    await this.itemRepo.setPauseStatus(itemId, paused);

    safeEmitEvent('item.requests_paused', userId, {
      itemId,
      paused,
    });

    return { requestsPaused: paused };
  }
}
