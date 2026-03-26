import { describe, expect, it, vi } from 'vitest';
import type { RenameCandidate, RenameDetectRepository } from '../src/modules/rename-detect/rename-detect.repository.js';
import { RenameDetectService } from '../src/modules/rename-detect/rename-detect.service.js';

function candidate(partial: Partial<RenameCandidate>): RenameCandidate {
  return {
    id: 1n,
    localPath: '/data/a.txt',
    relativePath: 'a.txt',
    md5Hash: 'md5-a',
    sha1Hash: 'sha1-a',
    fileSize: 100n,
    modifiedTime: new Date('2026-03-26T10:00:00.000Z'),
    updatedAt: new Date('2026-03-26T10:00:01.000Z'),
    fileLocationsCount: 1,
    ...partial
  };
}

function repoStub(overrides: Partial<RenameDetectRepository> = {}): RenameDetectRepository {
  return {
    findTask: vi.fn(async () => ({ id: 1n, isActive: true, deletedAt: null })),
    createRenameJob: vi.fn(async () => 10n),
    completeRenameJob: vi.fn(async () => undefined),
    failRenameJob: vi.fn(async () => undefined),
    listMissingCandidates: vi.fn(async () => []),
    listPresentCandidates: vi.fn(async () => []),
    applyRenamePairs: vi.fn(async () => 0),
    ...overrides
  } as unknown as RenameDetectRepository;
}

describe('RenameDetectService', () => {
  it('matches missing+present by md5/sha1/size and applies cloud-move plan', async () => {
    const repository = repoStub({
      listMissingCandidates: vi.fn(async () => [
        candidate({
          id: 101n,
          localPath: '/data/old-name.txt',
          relativePath: 'old-name.txt',
          md5Hash: 'm1',
          sha1Hash: 's1',
          fileSize: 333n,
          fileLocationsCount: 2
        })
      ]),
      listPresentCandidates: vi.fn(async () => [
        candidate({
          id: 202n,
          localPath: '/data/new-name.txt',
          relativePath: 'new-name.txt',
          md5Hash: 'm1',
          sha1Hash: 's1',
          fileSize: 333n,
          fileLocationsCount: 0
        })
      ]),
      applyRenamePairs: vi.fn(async () => 1)
    });

    const service = new RenameDetectService(repository);
    const summary = await service.detectAndApply(1n, 5);

    expect(summary.matchedPairs).toBe(1);
    expect(summary.appliedPairs).toBe(1);
    expect(summary.plannedCloudMoves).toBe(1);
    expect(repository.applyRenamePairs).toHaveBeenCalledWith(
      1n,
      expect.arrayContaining([
        expect.objectContaining({
          sourceFileId: 101n,
          targetFileId: 202n,
          targetLocalPath: '/data/new-name.txt'
        })
      ])
    );
  });

  it('rejects invalid candidate window', async () => {
    const service = new RenameDetectService(repoStub());

    await expect(service.detectAndApply(1n, 0)).rejects.toMatchObject({
      code: 'BAD_REQUEST'
    });
  });

  it('skips when fingerprint does not match', async () => {
    const repository = repoStub({
      listMissingCandidates: vi.fn(async () => [candidate({ id: 1n, md5Hash: 'm1', sha1Hash: 's1' })]),
      listPresentCandidates: vi.fn(async () => [candidate({ id: 2n, md5Hash: 'm2', sha1Hash: 's2' })]),
      applyRenamePairs: vi.fn(async () => 0)
    });

    const service = new RenameDetectService(repository);
    const summary = await service.detectAndApply(1n, 5);

    expect(summary.matchedPairs).toBe(0);
    expect(summary.appliedPairs).toBe(0);
    expect(repository.applyRenamePairs).toHaveBeenCalledWith(1n, []);
  });
});
