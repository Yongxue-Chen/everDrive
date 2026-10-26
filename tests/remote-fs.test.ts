import { describe, expect, it } from 'vitest';
import { buildDestinationPath, buildRemoteFs } from '../src/modules/remote/remote-fs.js';

describe('remote fs helpers', () => {
  it('builds rclone fs strings', () => {
    expect(buildRemoteFs('gdrive')).toBe('gdrive:');
    expect(buildRemoteFs('blomp', '/user@example.com/')).toBe('blomp:user@example.com');
  });

  it('joins root and base path into a readable destination', () => {
    expect(buildDestinationPath('gdrive')).toBe('gdrive:/');
    expect(buildDestinationPath('gdrive', '', 'team/photos')).toBe('gdrive:/team/photos');
    expect(buildDestinationPath('blomp', '/user@example.com/', '/photos/')).toBe('blomp:/user@example.com/photos');
  });
});
