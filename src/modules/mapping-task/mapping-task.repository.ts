import { JobStatus, JobType, PrismaClient } from '@prisma/client';
import type {
  CreateMappingTaskInput,
  MappingRemoteBinding,
  MappingTaskListQuery,
  MappingTaskRecord,
  RemoteCapacityRecord,
  UpdateMappingTaskInput
} from './mapping-task.service.js';

const mappingTaskInclude = {
  mappingTaskRemotes: {
    include: {
      remote: {
        select: {
          id: true,
          remoteName: true,
          displayName: true,
          isActive: true,
          healthStatus: true,
          totalCapacity: true,
          usedCapacity: true,
          reservedCapacity: true
        }
      }
    },
    orderBy: { priority: 'asc' as const }
  },
  syncJobs: {
    where: {
      jobType: JobType.sync,
      status: JobStatus.success,
      finishedAt: { not: null }
    },
    orderBy: { finishedAt: 'desc' as const },
    take: 1,
    select: { finishedAt: true }
  }
};

type PrismaTask = any;

export class MappingTaskPrismaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(
    input: Omit<CreateMappingTaskInput, 'expectedDataSizeBytes' | 'remoteBindings'> & { remoteBindings: MappingRemoteBinding[] }
  ): Promise<MappingTaskRecord> {
    const created = await this.prisma.mappingTask.create({
      data: {
        name: input.name,
        localPath: input.localPath,
        syncMode: input.syncMode,
        encryptionEnabled: input.encryptionEnabled,
        redundancyEnabled: input.redundancyEnabled,
        splitEnabled: input.splitEnabled,
        mappingTaskRemotes: {
          createMany: {
            data: input.remoteBindings.map((item) => ({
              remoteId: item.remoteId,
              role: item.role,
              priority: item.priority,
              remoteBasePath: item.remoteBasePath
            }))
          }
        }
      },
      include: mappingTaskInclude
    });

    return this.toRecord(created as PrismaTask);
  }

  async listTasks(query?: MappingTaskListQuery): Promise<MappingTaskRecord[]> {
    const items = await this.prisma.mappingTask.findMany({
      where: this.buildListWhere(query),
      include: mappingTaskInclude,
      orderBy: [{ createdAt: 'desc' }]
    });

    return items.map((item) => this.toRecord(item as PrismaTask));
  }

  async listActiveTaskIds(): Promise<bigint[]> {
    const rows = await this.prisma.mappingTask.findMany({
      where: {
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });
    return rows.map((item) => item.id);
  }

  async findTaskById(taskId: bigint, query?: Pick<MappingTaskListQuery, 'includeDeleted'>): Promise<MappingTaskRecord | null> {
    const item = await this.prisma.mappingTask.findFirst({
      where: {
        id: taskId,
        ...(query?.includeDeleted ? {} : { deletedAt: null })
      },
      include: mappingTaskInclude
    });

    if (!item) {
      return null;
    }

    return this.toRecord(item as PrismaTask);
  }

  async updateTask(
    taskId: bigint,
    input: Omit<UpdateMappingTaskInput, 'expectedDataSizeBytes' | 'remoteBindings'> & { remoteBindings?: MappingRemoteBinding[] }
  ): Promise<MappingTaskRecord> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.mappingTask.update({
        where: { id: taskId },
        data: {
          name: input.name,
          localPath: input.localPath,
          syncMode: input.syncMode,
          encryptionEnabled: input.encryptionEnabled,
          redundancyEnabled: input.redundancyEnabled,
          splitEnabled: input.splitEnabled
        }
      });

      if (input.remoteBindings) {
        await tx.mappingTaskRemote.deleteMany({ where: { mappingTaskId: taskId } });
        await tx.mappingTaskRemote.createMany({
          data: input.remoteBindings.map((item) => ({
            mappingTaskId: taskId,
            remoteId: item.remoteId,
            role: item.role,
            priority: item.priority,
            remoteBasePath: item.remoteBasePath
          }))
        });
      }

      return tx.mappingTask.findUnique({
        where: { id: taskId },
        include: mappingTaskInclude
      });
    });

    return this.toRecord(updated as PrismaTask);
  }

  async setTaskActive(taskId: bigint, isActive: boolean): Promise<MappingTaskRecord> {
    const updated = await this.prisma.mappingTask.update({
      where: { id: taskId },
      data: { isActive },
      include: mappingTaskInclude
    });

    return this.toRecord(updated as PrismaTask);
  }

  async softDeleteTask(taskId: bigint): Promise<MappingTaskRecord> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.mappingTask.findUnique({
        where: { id: taskId },
        select: { name: true, localPath: true }
      });

      const now = new Date();
      const suffix = `__deleted_${now.getTime()}`;
      const renamedName = existing ? `${existing.name}${suffix}`.slice(0, 128) : `deleted_${taskId.toString()}_${now.getTime()}`.slice(0, 128);
      const renamedPath = existing ? `${existing.localPath}${suffix}`.slice(0, 512) : `/deleted/${taskId.toString()}/${now.getTime()}`.slice(0, 512);

      await tx.mappingTask.update({
        where: { id: taskId },
        data: {
          isActive: false,
          deletedAt: now,
          name: renamedName,
          localPath: renamedPath
        } as any
      });

      return tx.mappingTask.findUnique({
        where: { id: taskId },
        include: mappingTaskInclude
      });
    });

    return this.toRecord(updated as PrismaTask);
  }

  async hardDeleteTask(taskId: bigint): Promise<void> {
    await this.prisma.mappingTask.delete({
      where: { id: taskId }
    });
  }

  async listRemoteCapacities(remoteIds: bigint[]): Promise<RemoteCapacityRecord[]> {
    if (remoteIds.length === 0) {
      return [];
    }

    const items = await this.prisma.cloudRemote.findMany({
      where: { id: { in: remoteIds } },
      select: {
        id: true,
        remoteName: true,
        displayName: true,
        isActive: true,
        healthStatus: true,
        totalCapacity: true,
        usedCapacity: true,
        reservedCapacity: true
      }
    });

    return items.map((item) => ({
      remoteId: item.id,
      remoteName: item.remoteName,
      displayName: item.displayName,
      isActive: item.isActive,
      healthStatus: item.healthStatus,
      totalCapacity: item.totalCapacity,
      usedCapacity: item.usedCapacity,
      reservedCapacity: item.reservedCapacity
    }));
  }

  private buildListWhere(query?: MappingTaskListQuery) {
    if (!query || (!query.status && !query.includeDeleted)) {
      return { deletedAt: null };
    }

    if (query.status === 'deleted') {
      return { deletedAt: { not: null } };
    }

    if (query.status === 'active') {
      return { deletedAt: null, isActive: true };
    }

    if (query.status === 'inactive') {
      return { deletedAt: null, isActive: false };
    }

    if (query.status === 'all' || query.includeDeleted) {
      return undefined;
    }

    return { deletedAt: null };
  }

  private toRecord(item: PrismaTask): MappingTaskRecord {
    return {
      id: item.id,
      name: item.name,
      localPath: item.localPath,
      syncMode: item.syncMode,
      encryptionEnabled: item.encryptionEnabled,
      redundancyEnabled: item.redundancyEnabled,
      splitEnabled: item.splitEnabled,
      isActive: item.isActive,
      deletedAt: item.deletedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastSyncAt: item.syncJobs[0]?.finishedAt ?? null,
      remotes: item.mappingTaskRemotes.map((link: any) => ({
        id: link.id,
        remoteId: link.remoteId,
        role: link.role,
        priority: link.priority,
        remoteBasePath: link.remoteBasePath,
        remote: {
          id: link.remote.id,
          remoteName: link.remote.remoteName,
          displayName: link.remote.displayName,
          isActive: link.remote.isActive,
          healthStatus: link.remote.healthStatus,
          totalCapacity: link.remote.totalCapacity,
          usedCapacity: link.remote.usedCapacity,
          reservedCapacity: link.remote.reservedCapacity
        }
      }))
    };
  }
}
