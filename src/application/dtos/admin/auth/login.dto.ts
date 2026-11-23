export interface AdminLoginRequest {
  email: string;
  password: string;
  ipAddress: string;
}

export interface AdminLoginResponse {
  message: string;
}
