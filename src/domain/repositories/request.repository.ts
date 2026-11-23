export interface CreateRequestInput {
  itemId: string;
  requesterId: string;
  contactChannel: string;
}

export interface RequestCreated {
  requestId: string;
  status: 'pending';
  createdAt: Date;
}

export interface RankedCandidate {
  requestId: string;
  userId: string;
  firstName: string;
  lastName: string;
  reputationScore: number;
  distanceMeters: number;
  locationName: string | null;
  requestDate: Date;
}

export interface IRequestRepository {
  create(input: CreateRequestInput): Promise<RequestCreated>;
  findRankedCandidates(itemId: string): Promise<RankedCandidate[]>;
}
