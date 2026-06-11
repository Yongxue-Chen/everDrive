import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('frontend rclone guidance', () => {
  it('keeps native select options readable', async () => {
    const styles = await readFile('frontend/src/styles.css', 'utf8');

    expect(styles).toContain('color: var(--text);');
    expect(styles).toMatch(/select option\s*\{[^}]*color: var\(--text\);[^}]*background: #fff;/s);
  });

  it('explains how to add a missing readonly source remote', async () => {
    const page = await readFile('frontend/src/pages/MappingTasksPage.tsx', 'utf8');

    expect(page).toContain('还没有可用的 SMB/SFTP 来源 remote');
    expect(page).toContain('to="/rclone-config"');
  });

  it('prioritizes common providers in the provider picker', async () => {
    const page = await readFile('frontend/src/pages/RcloneConfigPage.tsx', 'utf8');

    expect(page).toContain('COMMON_PROVIDER_ORDER');
    expect(page).toContain("'smb'");
    expect(page).toContain("'sftp'");
    expect(page).toContain('providerLabel');
    expect(page).toContain('MAX_PROVIDER_LABEL_LENGTH');
  });
  it('prevents form controls from expanding their grid columns', async () => {
    const styles = await readFile('frontend/src/styles.css', 'utf8');

    expect(styles).toMatch(/\.settings-grid > \*\s*\{[^}]*min-width: 0;/s);
    expect(styles).toMatch(/select\s*\{[^}]*max-width: 100%;/s);
  });
  it('allows newly entered sensitive values to be revealed', async () => {
    const page = await readFile('frontend/src/pages/RcloneConfigPage.tsx', 'utf8');
    expect(page).toContain('revealedFields');
    expect(page).toContain('显示敏感内容');
    expect(page).toContain('隐藏敏感内容');
  });
  it('shows per-remote connection status and refreshes it every ten minutes', async () => {
    const page = await readFile('frontend/src/pages/RcloneConfigPage.tsx', 'utf8');
    const styles = await readFile('frontend/src/styles.css', 'utf8');

    expect(page).toContain('REMOTE_STATUS_REFRESH_MS = 10 * 60 * 1000');
    expect(page).toContain('connection-status-dot');
    expect(page).toContain('测试中...');
    expect(styles).toContain('.connection-status-dot--online');
    expect(styles).toContain('.connection-status-dot--offline');
  });
});
