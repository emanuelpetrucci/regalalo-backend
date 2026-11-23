export type AdminAuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_MAX_ATTEMPTS';

export class AdminAuthException extends Error {
  constructor(
    public readonly code: AdminAuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AdminAuthException';
  }
}
