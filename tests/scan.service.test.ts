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

  it('scans a readonly rclone source and does not use local filesystem hashing', async () => {
    const upserts: UpsertScannedFileInput[]=[];
    const repository: Partial<ScanRepository>={findScannableTask:vi.fn(async()=>({id:1n,localPath:'rclone://lan-smb/photos',sourceType:'rclone',sourceRemoteName:'lan-smb',sourcePath:'photos',isActive:true,deletedAt:null} as any)),createScanJob:vi.fn(async()=>9n),completeScanJob:vi.fn(async()=>undefined),failScanJob:vi.fn(async()=>undefined),listExistingFiles:vi.fn(async()=>[]),upsertScannedFile:vi.fn(async x=>{upserts.push(x)}),markMissingFiles:vi.fn(async()=>0)};
    const source={scan:vi.fn(async()=>[{relativePath:'2026/a.jpg',sizeBytes:12n,modifiedTime:new Date('2026-01-02T00:00:00Z'),md5:'abc',sha1:null}])};
    const service=new ScanService(repository as ScanRepository,undefined,undefined,source as any);
    const summary=await service.runTaskScan(1n);
    expect(summary.createdCount).toBe(1); expect(upserts[0].localPath).toBe('rclone://lan-smb/photos/2026/a.jpg'); expect(upserts[0].md5Hash).toBe('abc');
  });

  it('blocks missing-file marking when a remote source drops abnormally', async () => {
    const existing = Array.from({ length: 20 }, (_, index) => ({ id: BigInt(index + 1), localPath: `rclone://lan-smb/photos/${index}.jpg`, md5Hash: 'x', sha1Hash: 'y', fileHash: 'x', fileSize: 1n, modifiedTime: new Date('2026-01-01T00:00:00Z') }));
    const markMissingFiles = vi.fn(async () => 20);
    const repository: Partial<ScanRepository> = { findScannableTask: vi.fn(async () => ({ id: 1n, localPath: 'rclone://lan-smb/photos', sourceType: 'rclone', sourceRemoteName: 'lan-smb', sourcePath: 'photos', isActive: true, deletedAt: null } as any)), createScanJob: vi.fn(async () => 9n), completeScanJob: vi.fn(async () => undefined), failScanJob: vi.fn(async () => undefined), listExistingFiles: vi.fn(async () => existing), upsertScannedFile: vi.fn(async () => undefined), markMissingFiles };
    const source = { scan: vi.fn(async () => []) };
    const summary = await new ScanService(repository as ScanRepository, undefined, undefined, source as any).runTaskScan(1n);
    expect(summary.deletionBlocked).toBe(true); expect(markMissingFiles).not.toHaveBeenCalled();
  });

  it('does not mark files missing when remote listing fails', async () => {
    const markMissingFiles = vi.fn(async () => 1); const failScanJob = vi.fn(async () => undefined);
    const repository: Partial<ScanRepository> = { findScannableTask: vi.fn(async () => ({ id: 1n, localPath: 'rclone://lan-smb/photos', sourceType: 'rclone', sourceRemoteName: 'lan-smb', sourcePath: 'photos', isActive: true, deletedAt: null } as any)), createScanJob: vi.fn(async () => 9n), failScanJob, listExistingFiles: vi.fn(async () => []), markMissingFiles };
    const source = { scan: vi.fn(async () => { throw new Error('source offline'); }) };
    await expect(new ScanService(repository as ScanRepository, undefined, undefined, source as any).runTaskScan(1n)).rejects.toThrow('source offline');
    expect(markMissingFiles).not.toHaveBeenCalled(); expect(failScanJob).toHaveBeenCalled();
  });
});
