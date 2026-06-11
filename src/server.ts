import { createApp } from './app/create-app.js';
import { getEnv } from './config/env.js';
import { database } from './infrastructure/db/database.js';
import { OperationLogRepository } from './infrastructure/repositories/operation-log.repository.js';
import { rcloneClient } from './infrastructure/rclone/rclone-rcd-client.js';
import { RcloneService } from './infrastructure/rclone/rclone.service.js';
import { logger as baseLogger } from './lib/logger.js';
import { createMappingTaskRouter } from './modules/mapping-task/mapping-task.controller.js';
import { MappingTaskPrismaRepository } from './modules/mapping-task/mapping-task.repository.js';
import { MappingTaskService } from './modules/mapping-task/mapping-task.service.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.controller.js';
import { DashboardRepository } from './modules/dashboard/dashboard.repository.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { createAuditRouter } from './modules/audit/audit.controller.js';
import { AuditService } from './modules/audit/audit.service.js';
import { createJobQueueRouter } from './modules/job-queue/job-queue.controller.js';
import { createMaintenanceRouter } from './modules/maintenance/maintenance.controller.js';
import { JobQueueService } from './modules/job-queue/job-queue.service.js';
import { createMigrationRouter } from './modules/migration/migration.controller.js';
import { MigrationRepository } from './modules/migration/migration.repository.js';
import { MigrationService } from './modules/migration/migration.service.js';
import { CloudInventoryRepository } from './modules/remote/cloud-inventory.repository.js';
import { CloudInventoryService } from './modules/remote/cloud-inventory.service.js';
import { createRemoteRouter } from './modules/remote/remote.controller.js';
import { createRcloneConfigRouter } from './modules/rclone-config/rclone-config.controller.js';
import { RcloneConfigService } from './modules/rclone-config/rclone-config.service.js';
import { createRenameDetectRouter } from './modules/rename-detect/rename-detect.controller.js';
import { RenameDetectRepository } from './modules/rename-detect/rename-detect.repository.js';
import { RenameDetectService } from './modules/rename-detect/rename-detect.service.js';
import { RedundancyBackupService } from './modules/redundancy/redundancy-backup.service.js';
import { createRedundancyRouter } from './modules/redundancy/redundancy.controller.js';
import { RedundancyRecoveryService } from './modules/redundancy/redundancy-recovery.service.js';
import { RedundancyRepository } from './modules/redundancy/redundancy.repository.js';
import { RedundancyViewService } from './modules/redundancy/redundancy-view.service.js';
import { createScanRouter } from './modules/scan/scan.controller.js';
import { ScanRepository } from './modules/scan/scan.repository.js';
import { ScanService } from './modules/scan/scan.service.js';
import { createMetricsRouter } from './modules/observability/metrics.controller.js';
import { MetricsService } from './modules/observability/metrics.service.js';
import { createSettingsRouter } from './modules/settings/settings.controller.js';
import { SettingsService } from './modules/settings/settings.service.js';
import { createSyncRouter } from './modules/sync/sync.controller.js';
import { SyncEngineRepository } from './modules/sync/sync-engine.repository.js';
import { SyncOrchestrationService } from './modules/sync/sync-orchestration.service.js';
import { AutoSyncSchedulerService } from './modules/scheduler/auto-sync-scheduler.service.js';
import { CloudTrashCleanupService } from './modules/cloud-trash/cloud-trash-cleanup.service.js';
import { createLocalPathRouter } from './modules/local-path/local-path.controller.js';
import { LocalPathService } from './modules/local-path/local-path.service.js';
import { RcloneSourceService } from './modules/source/rclone-source.service.js';
import { createRcloneSourceRouter } from './modules/source/rclone-source.controller.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();

  await database.connect();

  const operationLogRepository = new OperationLogRepository(database.prisma);
  const auditService = new AuditService(operationLogRepository);
  const logger = baseLogger.withOperationLogRepository(operationLogRepository).withContext({ module: 'server' });
  const jobQueue = new JobQueueService({
    longWorkerConcurrency: env.JOB_WORKER_CONCURRENCY,
    shortWorkerConcurrency: env.JOB_SHORT_WORKER_CONCURRENCY,
    remoteConcurrencyLimit: env.JOB_REMOTE_CONCURRENCY_LIMIT
  });
  const cloudInventoryRepository = new CloudInventoryRepository(database.prisma);
  const rcloneConfigService = new RcloneConfigService(
    rcloneClient,
    async (remoteName) => {
      const cloud = await cloudInventoryRepository.getRemoteByBoundRemoteName(remoteName);
      if (cloud) return cloud;
      const sourceTask = await database.prisma.mappingTask.findFirst({ where: { sourceType: 'rclone', sourceRemoteName: remoteName, deletedAt: null }, select: { id: true, name: true } });
      return sourceTask ? { id: sourceTask.id, displayName: `source mapping ` } : null;
    },
    async () => cloudInventoryRepository.listRemotes()
  );
  const rcloneConfigRouter = createRcloneConfigRouter(rcloneConfigService, auditService);
  const cloudInventoryService = new CloudInventoryService(cloudInventoryRepository, rcloneClient);
  const remoteRouter = createRemoteRouter(cloudInventoryService, jobQueue, auditService);
  const rcloneSourceService = new RcloneSourceService(rcloneClient, async (name) => Boolean(await cloudInventoryRepository.getRemoteByBoundRemoteName(name)));
  const rcloneSourceRouter = createRcloneSourceRouter(rcloneSourceService);
  const mappingTaskRepository = new MappingTaskPrismaRepository(database.prisma);
  const mappingTaskService = new MappingTaskService(mappingTaskRepository);
  const mappingTaskRouter = createMappingTaskRouter(mappingTaskService, jobQueue, auditService, rcloneSourceService);
  const scanRepository = new ScanRepository(database.prisma);
  const scanService = new ScanService(scanRepository, undefined, undefined, rcloneSourceService);
  const scanRouter = createScanRouter(scanService, jobQueue);
  const migrationRepository = new MigrationRepository(database.prisma);
  const migrationService = new MigrationService(migrationRepository, new RcloneService(rcloneClient));
  const migrationRouter = createMigrationRouter(migrationService, jobQueue);
  const renameDetectRepository = new RenameDetectRepository(database.prisma);
  const renameDetectService = new RenameDetectService(renameDetectRepository);
  const renameDetectRouter = createRenameDetectRouter(renameDetectService, jobQueue);
  const syncRepository = new SyncEngineRepository(database.prisma);
  const syncService = new SyncOrchestrationService(syncRepository, rcloneClient);
  const syncRouter = createSyncRouter(syncService, jobQueue);
  const jobQueueRouter = createJobQueueRouter(jobQueue);
  const maintenanceRouter = createMaintenanceRouter(jobQueue, auditService);
  const redundancyRepository = new RedundancyRepository(database.prisma);
  const redundancyViewService = new RedundancyViewService(redundancyRepository);
  const redundancyBackupService = new RedundancyBackupService(syncRepository, rcloneClient);
  const redundancyRecoveryService = new RedundancyRecoveryService(
    redundancyRepository,
    redundancyBackupService,
    syncRepository
  );
  const redundancyRouter = createRedundancyRouter(redundancyViewService, redundancyRecoveryService);
  const dashboardRepository = new DashboardRepository(database.prisma);
  const dashboardService = new DashboardService(dashboardRepository);
  const dashboardRouter = createDashboardRouter(dashboardService);
  const auditRouter = createAuditRouter(auditService);
  const metricsService = new MetricsService(database.prisma);
  const metricsRouter = createMetricsRouter(metricsService);
  const settingsService = await SettingsService.create();
  rcloneClient.setExecutionProfileProvider(() => settingsService.getCurrentConfig().syncProfile);
  const settingsRouter = createSettingsRouter(settingsService, auditService);
  const localPathService = new LocalPathService(env.LOCAL_PATH_ALLOWED_ROOTS.split(','));
  const localPathRouter = createLocalPathRouter(localPathService);
  const cloudTrashCleanupService = new CloudTrashCleanupService({
    settingsService,
    listActiveRemotes: async () => {
      const remotes = await cloudInventoryRepository.listRemotes();
      return remotes
        .filter((remote) => remote.isActive)
        .map((remote) => ({
          id: remote.id,
          remoteName: remote.remoteName,
          remoteRootPath: remote.remoteRootPath,
          cloudTrashEnabled: remote.cloudTrashEnabled,
          cloudTrashBasePath: remote.cloudTrashBasePath
        }));
    }
  });
  const autoSyncScheduler = new AutoSyncSchedulerService(
    jobQueue,
    async () => mappingTaskService.listActiveTaskIds(),
    env.SCAN_INTERVAL_SECONDS,
    {
      getCloudTrashSettings: () => settingsService.getCurrentConfig().cloudTrash,
      getSyncIntervalSeconds: () => settingsService.getCurrentConfig().defaultScanIntervalSeconds,
      hasCloudTrashEnabledRemotes: async () => {
        const remotes = await cloudInventoryRepository.listRemotes();
        return remotes.some((remote) => remote.isActive && remote.cloudTrashEnabled && remote.cloudTrashBasePath.trim().length > 0);
      }
    }
  );
  settingsService.subscribe(() => {
    autoSyncScheduler.refreshSchedule();
  });

  jobQueue.registerHandler('scan', async (job) => {
    if (!job.mappingTaskId) {
      throw new Error('scan job missing mappingTaskId');
    }
    const summary = await scanService.runTaskScan(BigInt(job.mappingTaskId));
    return { summary };
  });

  jobQueue.registerHandler('rename_detect', async (job) => {
    if (!job.mappingTaskId) {
      throw new Error('rename_detect job missing mappingTaskId');
    }
    const candidateWindowSeconds = Number(job.payload.candidateWindowSeconds ?? 5);
    const summary = await renameDetectService.detectAndApply(BigInt(job.mappingTaskId), candidateWindowSeconds);
    return { summary };
  });

  jobQueue.registerHandler('sync', async (job) => {
    if (!job.mappingTaskId) {
      throw new Error('sync job missing mappingTaskId');
    }
    const options = {
      deleteGraceSeconds:
        job.payload.deleteGraceSeconds === undefined || job.payload.deleteGraceSeconds === null
          ? undefined
          : Number(job.payload.deleteGraceSeconds),
      renameHintWindowSeconds:
        job.payload.renameHintWindowSeconds === undefined || job.payload.renameHintWindowSeconds === null
          ? undefined
          : Number(job.payload.renameHintWindowSeconds)
    };
    const result = await syncService.execute(BigInt(job.mappingTaskId), options);
    return result as unknown as Record<string, unknown>;
  });

  jobQueue.registerHandler('migrate', async (job) => {
    if (!job.mappingTaskId) {
      throw new Error('migrate job missing mappingTaskId');
    }

    const sourceRemoteId = BigInt(String(job.payload.sourceRemoteId));
    const targetRemoteId = BigInt(String(job.payload.targetRemoteId));
    const summary = await migrationService.runMigration({
      mappingTaskId: BigInt(job.mappingTaskId),
      sourceRemoteId,
      targetRemoteId,
      scopeRelativePath:
        typeof job.payload.scopeRelativePath === 'string' ? job.payload.scopeRelativePath : undefined,
      targetBasePath: typeof job.payload.targetBasePath === 'string' ? job.payload.targetBasePath : undefined,
      removeSourceReplica: Boolean(job.payload.removeSourceReplica)
    });

    return { summary };
  });

  jobQueue.registerHandler('remote_stats_refresh', async () => {
    const summary = await cloudInventoryService.refreshRemoteStats();
    return { summary };
  });

  jobQueue.registerHandler('cloud_trash_cleanup', async () => {
    const summary = await cloudTrashCleanupService.runCleanup();
    return { summary };
  });

  const app = createApp({
    checkDb: () => database.isHealthy(),
    checkRclone: () => rcloneClient.checkOnline(),
    remoteRouter,
    rcloneConfigRouter,
    rcloneSourceRouter,
    mappingTaskRouter,
    scanRouter,
    renameDetectRouter,
    syncRouter,
    redundancyRouter,
    migrationRouter,
    jobQueueRouter,
    maintenanceRouter,
    dashboardRouter,
    settingsRouter,
    auditRouter,
    metricsRouter,
    localPathRouter
  });

  const server = app.listen(env.PORT, () => {
    logger.info('everDrive backend started', { port: env.PORT });
  });
  autoSyncScheduler.start();

  const remoteHealthCheckTimer = setInterval(() => {
    void cloudInventoryService.checkRemoteBindings().catch((error) => {
      logger.warn('remote binding health check failed', { err: error });
    });
  }, env.REMOTE_HEALTHCHECK_INTERVAL_SECONDS * 1000);
  void cloudInventoryService.checkRemoteBindings().catch((error) => {
    logger.warn('initial remote binding health check failed', { err: error });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutdown started', { signal });
    autoSyncScheduler.stop();
    clearInterval(remoteHealthCheckTimer);

    await logger.audit({
      operationType: 'update',
      targetType: 'sync_job',
      message: `Service shutdown requested by ${signal}`,
      metadataJson: { signal }
    });

    server.close(async () => {
      await database.disconnect();
      logger.info('shutdown completed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  baseLogger.error('Application bootstrap failed', { err: error });
  process.exit(1);
});
