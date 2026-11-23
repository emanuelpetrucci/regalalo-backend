export interface AdminSuspendResponse {
  message: string;
  itemsPaused: number;
}

export interface AdminReactivateResponse {
  message: string;
  itemsUnpaused: number;
}

export interface AdminCorrectReputationRequest {
  delta: number;
  reason: string;
}

export interface AdminCorrectReputationResponse {
  newReputationScore: number;
  delta: number;
}

export interface AdminResetNoShowsResponse {
  message: string;
  previousValue: number;
}

export interface AdminForceVerificationResponse {
  message: string;
}
