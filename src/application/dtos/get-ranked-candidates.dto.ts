export interface RankedCandidateDto {
  requestId: string;
  userId: string;
  firstName: string;
  lastName: string;
  reputationScore: number;
  distanceMeters: number;
  locationName: string | null;
  requestDate: Date;
}

export interface GetRankedCandidatesResponseDto {
  candidates: RankedCandidateDto[];
}
