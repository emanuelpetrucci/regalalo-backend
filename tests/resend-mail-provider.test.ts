import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendMock, errorMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null }),
  errorMock: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

vi.mock('../src/config/loggers', () => ({
  appLogger: { error: errorMock },
}));

import { ResendMailProvider } from '../src/infrastructure/email/resend.provider';

describe('ResendMailProvider', () => {
  beforeEach(() => {
    sendMock.mockClear();
    errorMock.mockClear();
    sendMock.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
  });

  it('9.5 — templateId desconocido lanza sin enviar email', async () => {
    const provider = new ResendMailProvider();
    await expect(
      provider.send({
        to: 'user@example.com',
        templateId: 'TPL-UNKNOWN',
        variables: { firstName: 'Test' },
      }),
    ).rejects.toThrow('Unknown email template: TPL-UNKNOWN');
    expect(sendMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledWith(
      { templateId: 'TPL-UNKNOWN', to: 'user@example.com' },
      'Unknown email templateId — refusing to send unstyled email',
    );
  });

  it('9.5 — error de Resend lanza sin considerar envío exitoso', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });
    const provider = new ResendMailProvider();
    await expect(
      provider.send({
        to: 'user@example.com',
        templateId: 'TPL-009',
        variables: {
          firstName: 'María',
          verificationLink: 'https://example.com/verify?token=abc',
          expiresInHours: 24,
        },
      }),
    ).rejects.toThrow('Resend email send failed: Invalid API key');
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'TPL-009',
        to: 'user@example.com',
        error: { message: 'Invalid API key', name: 'validation_error' },
      }),
      'Resend email send failed',
    );
  });

  it('9.5 — TPL-009 delega en registry y llama a Resend', async () => {
    const provider = new ResendMailProvider();
    await provider.send({
      to: 'user@example.com',
      templateId: 'TPL-009',
      variables: {
        firstName: 'María',
        verificationLink: 'https://example.com/verify?token=abc',
        expiresInHours: 24,
      },
    });
    expect(sendMock).toHaveBeenCalledOnce();
    const arg = sendMock.mock.calls[0][0];
    expect(arg.subject).toContain('email');
    expect(arg.html).toContain('Regálalo');
    expect(arg.html).toContain('width="600"');
  });
});
