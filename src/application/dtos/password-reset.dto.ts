export interface ForgotPasswordRequestDto {
  email: string;
}

export interface ForgotPasswordResponseDto {
  message: string;
}

export interface ResetPasswordRequestDto {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponseDto {
  message: string;
}
