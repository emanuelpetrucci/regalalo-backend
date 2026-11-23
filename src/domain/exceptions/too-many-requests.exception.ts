export class TooManyRequestsException extends Error {
  readonly retryAfterSeconds?: number;
  constructor(message = 'Too Many Requests', retryAfterSeconds?: number) {
    super(message);
    this.name = 'TooManyRequestsException';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
