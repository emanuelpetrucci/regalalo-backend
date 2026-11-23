import { IUserRepository } from '../../../domain/repositories/user.repository';
import { GetReputationHistoryResponseDto } from '../../dtos/get-reputation-history.dto';

export class GetReputationHistoryUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetReputationHistoryResponseDto> {
    const events = await this.userRepo.findReputationHistory(userId);
    return {
      events: events.map(e => ({
        id: e.id,
        type: e.type,
        delta: e.delta,
        sessionId: e.sessionId,
        createdAt: e.createdAt,
      })),
    };
  }
}
