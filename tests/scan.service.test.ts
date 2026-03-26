import { ScanStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ScanService } from '../src/modules/scan/scan.service.js';
import type { ExistingFileRecord, MappingTaskForScan, ScanRepository, UpsertScannedFileInput } from '../src/modules/scan/scan.repository.js';

function task(localPath = '/tmp'): MappingTaskForScan {
  return {
    id: 1n,
    localPath,
    isActive: true,
    deletedAt: null
  };
}

describe('ScanService', () => {
  it('marks changed and unchanged files idempotently', async () => {
    const existing: ExistingFileRecord[] = [
      {
        id: 11n,
        localPath: '/tmp/a.txt',
        md5Hash: 'md5-a',
        sha1Hash: 'sha1-a',
        fileHash: 'md5-a',
        fileSize: 10n,
        modifiedTime: new Date('2026-03-26T10:00:00.000Z')
      }
    ];

    const upserts: UpsertScannedFileInput[] = [];
    const repository: Partial<ScanRepository> = {
      findScannableTask: vi.fn(async () => task()),
      createScanJob: vi.fn(async () => 99n),
      completeScanJob: vi.fn(async () => undefined),
      failScanJob: vi.fn(async () => undefined),
      listExistingFiles: vi.fn(async () => existing),
      upsertScannedFile: vi.fn(async (input) => {
        upserts.push(input);
      }),
      markMissingFiles: vi.fn(async () => 0)
    };

    const service = new ScanService(repository as ScanRepository, {
      scan: vi.fn(async () => [
        {
          absolutePath: '/tmp/a.txt',
          relativePath: 'a.txt',
          sizeBytes: 10n,
          modifiedTime: new Date('2026-03-26T10:00:00.000Z')
        },
        {
          absolutePath: '/tmp/b.txt',
          relativePath: 'b.txt',
          sizeBytes: 20n,
          modifiedTime: new Date('2026-03-26T10:00:01.000Z')
        }
      ])
    } as any, {
      hash: vi
        .fn()
        .mockResolvedValueOnce({ md5: 'md5-a', sha1: 'sha1-a' })
        .mockResolvedValueOnce({ md5: 'md5-b', sha1: 'sha1-b' })
    } as any);

    const summary = await service.runTaskScan(1n);

    expect(summary.scannedCount).toBe(2);
    expect(summary.createdCount).toBe(1);
    expect(summary.unchangedCount).toBe(1);
    expect(summary.changedCount).toBe(0);
    expect(upserts[0]?.scanStatus).toBe(ScanStatus.scanned);
    expect(upserts[1]?.scanStatus).toBe(ScanStatus.changed);
  });

  it('fails when mapping task is not active', async () => {
    const repository: Partial<ScanRepository> = {
      findScannableTask: vi.fn(async () => null)
    };

    const service = new ScanService(repository as ScanRepository);

    await expect(service.runTaskScan(1n)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    });
  });
});
