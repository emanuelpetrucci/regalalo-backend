export class GoneException extends Error {
  constructor(message = 'Gone') {
    super(message);
    this.name = 'GoneException';
  }
}
