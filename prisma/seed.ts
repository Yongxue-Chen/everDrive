import {
  JobStatus,
  JobType,
  PrismaClient,
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
        payloadJson: { uploaded: 0, failed: 0 },
        startedAt: new Date(now.getTime() - 10 * 60 * 1000),
        finishedAt: new Date(now.getTime() - 9 * 60 * 1000)
      },
      {
        jobType: JobType.sync,
        mappingTaskId: taskByName.get('Workspace Photos')!,
        status: JobStatus.failed,
        payloadJson: { uploaded: 0, failed: 1 },
        errorMessage: 'no business remote bound',
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
  await seedMappingTasks();
  await seedSyncJobs();

  console.log('Seed completed: mapping_tasks and sync_jobs; no business remotes are created by default');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
