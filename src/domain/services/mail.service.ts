import type { AppPreferredLanguage } from '../../interfaces/validators/preferred-language.schema';

export interface MailPayload {
  to: string;
  templateId: string;
  variables: Record<string, string | number>;
  language?: AppPreferredLanguage;
}

export interface IMailService {
  send(payload: MailPayload): Promise<void>;
}
