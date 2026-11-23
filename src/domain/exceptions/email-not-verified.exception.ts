export class EmailNotVerifiedException extends Error {
  readonly code = 'EMAIL_NOT_VERIFIED' as const;
  constructor(message = 'Email not verified') {
    super(message);
    this.name = 'EmailNotVerifiedException';
  }
}
