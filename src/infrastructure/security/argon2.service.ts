import * as argon2 from 'argon2';
import { IHashService } from '../../domain/services/hash.service';

export class Argon2HashService implements IHashService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
