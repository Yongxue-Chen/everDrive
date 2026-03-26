import {
  FileSyncStatus,
  HashType,
  JobStatus,
  JobType,
  MappingRemoteRole,
  PrismaClient,
  ScanStatus,
  SyncMode
} from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase(): Promise<void> {
  await prisma.operationLog.deleteMany();
  await prisma.syncJob.deleteMany();
  await prisma.fileLocation.deleteMany();
  await prisma.file.deleteMany();
  await prisma.mappingTaskRemote.deleteMany();
  await prisma.mappingTask.deleteMany();
  await prisma.cloudRemote.deleteMany();
}

async function seedRemotes(): Promise<void> {
  await prisma.cloudRemote.createMany({
    data: [
      {
        remoteName: 'driveA',
        displayName: 'Drive A',
        totalCapacity: 200_000_000_000n,
        usedCapacity: 80_000_000_000n,
        reservedCapacity: 0n,
        warningThresholdPercent: 85,
        isActive: true
      },
      {
        remoteName: 'driveB',
        displayName: 'Drive B',
        totalCapacity: 150_000_000_000n,
        usedCapacity: 130_000_000_000n,
        reservedCapacity: 0n,
        warningThresholdPercent: 85,
        isActive: true
      },
      {
        remoteName: 'driveC',
        displayName: 'Drive C',
        totalCapacity: 300_000_000_000n,
        usedCapacity: 40_000_000_000n,
        reservedCapacity: 0n,
        warningThresholdPercent: 90,
        isActive: true
      }
    ]
  });
}

async function seedMappingTasks(): Promise<void> {
  await prisma.mappingTask.createMany({
    data: [
      {
        name: 'Workspace Photos',
        localPath: '/data/photos',
        syncMode: SyncMode.archive,
        encryptionEnabled: true,
        redundancyEnabled: true,
        splitEnabled: false,
        isActive: true
      },
      {
        name: 'Workspace Docs',
        localPath: '/data/docs',
        syncMode: SyncMode.mirror,
        encryptionEnabled: false,
        redundancyEnabled: false,
        splitEnabled: false,
        isActive: true
      }
    ]
  });
}

async function seedBindings(): Promise<void> {
  const remotes = await prisma.cloudRemote.findMany({
    where: { remoteName: { in: ['driveA', 'driveB', 'driveC'] } }
  });
  const tasks = await prisma.mappingTask.findMany({
    where: { name: { in: ['Workspace Photos', 'Workspace Docs'] } }
  });

  const remoteByName = new Map(remotes.map((item) => [item.remoteName, item.id]));
  const taskByName = new Map(tasks.map((item) => [item.name, item.id]));

  await prisma.mappingTaskRemote.createMany({
    data: [
      {
        mappingTaskId: taskByName.get('Workspace Photos')!,
        remoteId: remoteByName.get('driveA')!,
        role: MappingRemoteRole.primary,
        priority: 100
      },
      {
        mappingTaskId: taskByName.get('Workspace Photos')!,
        remoteId: remoteByName.get('driveB')!,
        role: MappingRemoteRole.backup,
        priority: 200
      },
      {
        mappingTaskId: taskByName.get('Workspace Docs')!,
        remoteId: remoteByName.get('driveC')!,
        role: MappingRemoteRole.primary,
        priority: 100
      }
    ]
  });
}

async function seedFilesAndLocations(): Promise<void> {
  const tasks = await prisma.mappingTask.findMany({
    where: { name: { in: ['Workspace Photos', 'Workspace Docs'] } }
  });
  const remotes = await prisma.cloudRemote.findMany({
    where: { remoteName: { in: ['driveA', 'driveB', 'driveC'] } }
  });

  const taskByName = new Map(tasks.map((item) => [item.name, item.id]));
  const remoteByName = new Map(remotes.map((item) => [item.remoteName, item.id]));

  const now = new Date();
  await prisma.file.createMany({
    data: [
      {
        fileHash: 'sha1-photo-1',
        md5Hash: 'md5photo1',
        sha1Hash: 'sha1photo1',
        hashType: HashType.sha1,
        fileSize: 12_345_678n,
        modifiedTime: now,
        localPath: '/data/photos/album/a.jpg',
        relativePath: 'album/a.jpg',
        mappingTaskId: taskByName.get('Workspace Photos')!,
        scanStatus: ScanStatus.scanned
      },
      {
        fileHash: 'sha1-photo-2',
        md5Hash: 'md5photo2',
        sha1Hash: 'sha1photo2',
        hashType: HashType.sha1,
        fileSize: 22_222_222n,
        modifiedTime: now,
        localPath: '/data/photos/album/b.jpg',
        relativePath: 'album/b.jpg',
        mappingTaskId: taskByName.get('Workspace Photos')!,
        scanStatus: ScanStatus.changed
      },
      {
        fileHash: 'sha1-doc-1',
        md5Hash: 'md5doc1',
        sha1Hash: 'sha1doc1',
        hashType: HashType.sha1,
        fileSize: 8_888n,
        modifiedTime: now,
        localPath: '/data/docs/report.md',
        relativePath: 'report.md',
        mappingTaskId: taskByName.get('Workspace Docs')!,
        scanStatus: ScanStatus.scanned
      }
    ]
  });

  const files = await prisma.file.findMany({
    where: {
      localPath: {
        in: ['/data/photos/album/a.jpg', '/data/photos/album/b.jpg', '/data/docs/report.md']
      }
    }
  });
  const fileByPath = new Map(files.map((item) => [item.localPath, item.id]));

  await prisma.fileLocation.createMany({
    data: [
      {
        fileId: fileByPath.get('/data/photos/album/a.jpg')!,
        remoteId: remoteByName.get('driveA')!,
        remotePath: 'photos/album/a.jpg',
        remoteFileName: 'a.jpg',
        syncStatus: FileSyncStatus.synced
      },
      {
        fileId: fileByPath.get('/data/photos/album/a.jpg')!,
        remoteId: remoteByName.get('driveB')!,
        remotePath: 'photos/album/a.jpg',
        remoteFileName: 'a.jpg',
        syncStatus: FileSyncStatus.synced
      },
      {
        fileId: fileByPath.get('/data/photos/album/b.jpg')!,
        remoteId: remoteByName.get('driveA')!,
        remotePath: 'photos/album/b.jpg',
        remoteFileName: 'b.jpg',
        syncStatus: FileSyncStatus.failed
      },
      {
        fileId: fileByPath.get('/data/docs/report.md')!,
        remoteId: remoteByName.get('driveC')!,
        remotePath: 'docs/report.md',
        remoteFileName: 'report.md',
        syncStatus: FileSyncStatus.synced
      }
    ]
  });
}

async function seedSyncJobs(): Promise<void> {
  const tasks = await prisma.mappingTask.findMany({
    where: { name: { in: ['Workspace Photos', 'Workspace Docs'] } }
  });
  const taskByName = new Map(tasks.map((item) => [item.name, item.id]));
  const now = new Date();

  await prisma.syncJob.createMany({
    data: [
      {
        jobType: JobType.sync,
        mappingTaskId: taskByName.get('Workspace Photos')!,
        status: JobStatus.success,
        payloadJson: { uploaded: 2, failed: 0 },
        startedAt: new Date(now.getTime() - 10 * 60 * 1000),
        finishedAt: new Date(now.getTime() - 9 * 60 * 1000)
      },
      {
        jobType: JobType.sync,
        mappingTaskId: taskByName.get('Workspace Photos')!,
        status: JobStatus.failed,
        payloadJson: { uploaded: 1, failed: 1 },
        errorMessage: 'remote driveB unavailable',
        startedAt: new Date(now.getTime() - 6 * 60 * 1000),
        finishedAt: new Date(now.getTime() - 5 * 60 * 1000)
      },
      {
        jobType: JobType.scan,
        mappingTaskId: taskByName.get('Workspace Docs')!,
        status: JobStatus.queued,
        payloadJson: { source: 'seed' }
      }
    ]
  });
}

async function main(): Promise<void> {
  await resetDatabase();
  await seedRemotes();
  await seedMappingTasks();
  await seedBindings();
  await seedFilesAndLocations();
  await seedSyncJobs();

  console.log('Seed completed: remotes, mapping_tasks, files, file_locations, sync_jobs');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
