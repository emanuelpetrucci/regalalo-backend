export interface VerifyEmailRequestDto {
  token: string;
}

export interface VerifyEmailResponseDto {
  message: string;
}

export interface ResendVerificationResponseDto {
  message: string;
}
