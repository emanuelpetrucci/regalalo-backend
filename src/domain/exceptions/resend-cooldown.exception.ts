export class ResendCooldownException extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = 'Demasiadas solicitudes, intentá nuevamente en unos segundos') {
    super(message);
    this.name = 'ResendCooldownException';
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}
