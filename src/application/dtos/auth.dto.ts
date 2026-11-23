import type { AppPreferredLanguage } from '../../interfaces/validators/preferred-language.schema';

export interface RegisterRequestDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  postalCode: string;
  phone?: string;
  recaptchaToken: string;
  language?: AppPreferredLanguage;
}

export interface AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  postalCode: string;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
}

export interface AuthResponseDto {
  token: string;
  user: AuthUserDto;
}

export interface LoginRequestDto {
  email: string;
  password: string;
  recaptchaToken: string;
}

export interface LoginUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  reputationScore: number;
}

export interface LoginResponseDto {
  token: string;
  user: LoginUserDto;
}
