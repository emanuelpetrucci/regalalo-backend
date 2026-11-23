export class ConflictException extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictException';
  }
}
