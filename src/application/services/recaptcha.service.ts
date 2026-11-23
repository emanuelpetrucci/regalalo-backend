export interface IRecaptchaService {
  verify(token: string): Promise<{ success: boolean; score: number }>;
}
