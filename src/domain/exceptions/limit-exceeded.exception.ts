import { ConflictException } from './conflict.exception';

export class LimitExceededException extends ConflictException {
  constructor() {
    super('Request limit reached');
    this.name = 'LimitExceededException';
  }
}
