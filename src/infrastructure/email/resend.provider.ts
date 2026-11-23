import { Resend } from 'resend';
import { env } from '../../config/env';
import { appLogger } from '../../config/loggers';
import { IMailService, MailPayload } from '../../domain/services/mail.service';
import { emailTemplateRegistry } from './templates/registry';

const resend = new Resend(env.RESEND_API_KEY);

export class ResendMailProvider implements IMailService {
  async send(payload: MailPayload): Promise<void> {
    const entry = emailTemplateRegistry[payload.templateId];
    if (!entry) {
      appLogger.error(
        { templateId: payload.templateId, to: payload.to },
        'Unknown email templateId — refusing to send unstyled email',
      );
      throw new Error(`Unknown email template: ${payload.templateId}`);
    }

    const { subject, html } = entry(payload.variables, payload.language);
    const result = await resend.emails.send({
      from: env.RESEND_FROM,
      to: payload.to,
      subject,
      html,
    });
    if (result.error) {
      appLogger.error(
        { templateId: payload.templateId, to: payload.to, error: result.error },
        'Resend email send failed',
      );
      throw new Error(`Resend email send failed: ${result.error.message}`);
    }
  }
}
