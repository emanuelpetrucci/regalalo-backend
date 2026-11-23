export interface AdminVerifyOtpRequest {
  email: string;
  otp: string;
  ipAddress: string;
}

export interface AdminVerifyOtpResponse {
  token: string;
  admin: {
    id: string;
    email: string;
  };
}
