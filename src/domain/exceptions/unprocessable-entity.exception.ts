export class UnprocessableEntityException extends Error {
  constructor(message = 'Unprocessable Entity') {
    super(message);
    this.name = 'UnprocessableEntityException';
  }
}
