import { HealthStatus, Prisma, PrismaClient } from '@prisma/client';
import type { CreateRemoteInput, RemoteUsageAggregate } from './cloud-inventory.service.js';

export class CloudInventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listRemotes(remoteIds?: bigint[]) {
    return this.prisma.cloudRemote.findMany({
      where: remoteIds && remoteIds.length > 0 ? { id: { in: remoteIds } } : undefined,
      include: {
        mappingTaskRemotes: {
          include: {
            mappingTask: {
              select: {
                id: true,
                name: true,
                localPath: true,
                isActive: true,
                deletedAt: true
              }
            }
          }
        }
      },
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }]
    });
  }

  async findRemoteById(remoteId: bigint) {
    return this.prisma.cloudRemote.findUnique({
      where: { id: remoteId },
      include: {
        mappingTaskRemotes: {
          include: {
            mappingTask: {
              select: {
                id: true,
                name: true,
                localPath: true,
                isActive: true,
                deletedAt: true
              }
            }
          }
        }
      }
    });
  }

  async getRemoteByDisplayName(displayName: string) {
    return this.prisma.cloudRemote.findUnique({
      where: { displayName },
      include: {
        mappingTaskRemotes: {
          include: {
            mappingTask: {
              select: {
                id: true,
                name: true,
                localPath: true,
                isActive: true,
                deletedAt: true
              }
            }
          }
        }
      }
    });
  }

  async getRemoteByBoundRemoteName(remoteName: string) {
    return this.prisma.cloudRemote.findUnique({
      where: { remoteName },
      include: {
        mappingTaskRemotes: {
          include: {
            mappingTask: {
              select: {
                id: true,
                name: true,
                localPath: true,
                isActive: true,
                deletedAt: true
              }
            }
          }
        }
      }
    });
  }

  async createRemote(input: CreateRemoteInput) {
    return this.prisma.cloudRemote.create({
      data: {
        displayName: input.displayName,
        remoteName: input.remoteName,
        totalCapacity: input.totalCapacity ?? 0n,
        reservedCapacity: input.reservedCapacity ?? 0n,
        warningThresholdPercent: input.warningThresholdPercent ?? 85,
        cloudTrashEnabled: input.cloudTrashEnabled ?? false,
        cloudTrashBasePath: input.cloudTrashBasePath ?? '.everdrive-trash',
        remoteRootPath: input.remoteRootPath ?? '',
        healthStatus: HealthStatus.healthy,
        isActive: true,
        lastCheckedAt: new Date()
      },
      include: {
        mappingTaskRemotes: {
          include: {
            mappingTask: {
              select: {
                id: true,
                name: true,
                localPath: true,
                isActive: true,
                deletedAt: true
              }
            }
          }
        }
      }
    });
  }

  async getUsedCapacityByRemoteIds(remoteIds?: bigint[]): Promise<RemoteUsageAggregate[]> {
    const inCondition =
      remoteIds && remoteIds.length > 0 ? Prisma.sql`AND fl.remote_id IN (${Prisma.join(remoteIds)})` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ remoteId: bigint; usedCapacity: bigint }>>(Prisma.sql`
      SELECT
        fl.remote_id AS remoteId,
        COALESCE(SUM(f.file_size), 0) AS usedCapacity
      FROM file_locations fl
      INNER JOIN files f ON f.id = fl.file_id
      WHERE fl.sync_status IN ('synced', 'verifying')
      ${inCondition}
      GROUP BY fl.remote_id
    `);

    return rows;
  }

  async updateRemoteUsageSnapshot(remoteId: bigint, usedCapacity: bigint, healthStatus: HealthStatus): Promise<void> {
    await this.prisma.cloudRemote.update({
      where: { id: remoteId },
      data: {
        usedCapacity,
        healthStatus,
        lastCheckedAt: new Date()
      }
    });
  }

  async updateRemoteCapacitySettings(
    remoteId: bigint,
    input: {
      displayName?: string;
      totalCapacity?: bigint;
      reservedCapacity?: bigint;
      warningThresholdPercent?: number;
    }
  ): Promise<void> {
    await this.updateRemoteSettings(remoteId, input);
  }

  async updateRemoteSettings(
    remoteId: bigint,
    input: {
      displayName?: string;
      totalCapacity?: bigint;
      reservedCapacity?: bigint;
      warningThresholdPercent?: number;
      cloudTrashEnabled?: boolean;
      cloudTrashBasePath?: string;
      remoteName?: string;
      remoteRootPath?: string;
    }
  ): Promise<void> {
    await this.prisma.cloudRemote.update({
      where: { id: remoteId },
      data: {
        displayName: input.displayName,
        totalCapacity: input.totalCapacity,
        reservedCapacity: input.reservedCapacity,
        warningThresholdPercent: input.warningThresholdPercent,
        cloudTrashEnabled: input.cloudTrashEnabled,
        cloudTrashBasePath: input.cloudTrashBasePath,
        remoteName: input.remoteName,
        remoteRootPath: input.remoteRootPath
      }
    });
  }

  async updateRemoteBindingStatus(
    remoteId: bigint,
    input: {
      healthStatus: HealthStatus;
      isActive?: boolean;
      lastCheckedAt: Date;
      lastAlertAt?: Date;
    }
  ): Promise<void> {
    await this.prisma.cloudRemote.update({
      where: { id: remoteId },
      data: {
        healthStatus: input.healthStatus,
        isActive: input.isActive,
        lastCheckedAt: input.lastCheckedAt,
        lastAlertAt: input.lastAlertAt
      }
    });
  }

  async writeRemoteAlert(
    remoteId: bigint,
    input: { code: string; message: string; metadataJson?: Record<string, unknown> }
  ): Promise<void> {
    await this.prisma.operationLog.create({
      data: {
        operationType: 'update',
        targetType: 'remote',
        targetId: remoteId,
        message: input.message,
        metadataJson: {
          code: input.code,
          ...(input.metadataJson ?? {})
        }
      }
    });
  }

  async updateRemoteActiveState(remoteId: bigint, isActive: boolean): Promise<void> {
    await this.prisma.cloudRemote.update({
      where: { id: remoteId },
      data: {
        isActive,
        healthStatus: isActive ? HealthStatus.healthy : HealthStatus.unavailable
      }
    });
  }

  async deleteRemote(remoteId: bigint): Promise<void> {
    await this.prisma.cloudRemote.delete({
      where: { id: remoteId }
    });
  }
}
