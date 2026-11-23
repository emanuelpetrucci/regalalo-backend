export interface IStorageService {
  upload(buffer: Buffer, mimeType: string, storagePath: string): Promise<void>;
}
