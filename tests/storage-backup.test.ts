import { describe, expect, it } from 'vitest';
import {
  buildAssetsBackupLabel,
  buildAssetsLocalBackupDir,
  buildAssetsRemoteBackupPrefix,
} from '../scripts/lib/storage-backup';

describe('storage-backup helpers', () => {
  it('genera label y rutas de backup de assets', () => {
    const label = buildAssetsBackupLabel(new Date('2026-06-18T14:05:20.123Z'));
    expect(label).toBe('2026-06-18T14-05-20');
    expect(buildAssetsLocalBackupDir(label)).toBe('.bk/assets/2026-06-18T14-05-20');
    expect(buildAssetsRemoteBackupPrefix(label)).toBe('assets/2026-06-18T14-05-20');
  });
});
