import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { GetRankedCandidatesResponseDto } from '../../dtos/get-ranked-candidates.dto';

export class GetRankedCandidatesUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly requestRepo: IRequestRepository,
  ) {}

  async execute(itemId: string, userId: string): Promise<GetRankedCandidatesResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');

    const candidates = await this.requestRepo.findRankedCandidates(itemId);
    return { candidates };
  }
}
