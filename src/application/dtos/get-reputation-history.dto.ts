export interface ReputationEventDto {
  id: string;
  type: 'delivery_completed' | 'no_show';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
}

export interface GetReputationHistoryResponseDto {
  events: ReputationEventDto[];
}
