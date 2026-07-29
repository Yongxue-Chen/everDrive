import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('frontend encryption recovery', () => {
  it('provides a controlled encrypted recovery page and navigation entry', async () => {
    const page = await readFile('frontend/src/pages/EncryptionRecoveryPage.tsx', 'utf8');
    const router = await readFile('frontend/src/router.tsx', 'utf8');
    const sidebar = await readFile('frontend/src/components/Sidebar.tsx', 'utf8');
    const api = await readFile('frontend/src/lib/api.ts', 'utf8');
    expect(page).toContain('加密恢复');
    expect(page).toContain('ENCRYPTION_MASTER_KEY');
    expect(page).toContain('解密下载');
    expect(router).toContain("path: 'encryption-recovery'");
    expect(sidebar).toContain("['/encryption-recovery','加密恢复'");
    expect(api).toContain('/api/encryption-recovery/files/');
  });
});
