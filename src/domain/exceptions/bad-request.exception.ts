export class BadRequestException extends Error {
  constructor(message = 'Bad Request') {
    super(message);
    this.name = 'BadRequestException';
  }
}
