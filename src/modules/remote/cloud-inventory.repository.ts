import { HealthStatus, Prisma, PrismaClient } from '@prisma/client';

export type RemoteUsageAggregate = {
  remoteId: bigint;
  usedCapacity: bigint;
};

export type SyncRemotesSummary = {
  added: string[];
  reactivated: string[];
  disabled: string[];
};

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
                isActive: true
              }
            }
          }
        }
      },
      orderBy: [{ isActive: 'desc' }, { remoteName: 'asc' }]
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
                isActive: true
              }
            }
          }
        }
      }
    });
  }

  async syncRemotesFromRclone(remoteNames: string[]): Promise<SyncRemotesSummary> {
    const normalized = [...new Set(remoteNames.map((name) => name.replace(/:$/, '').trim()).filter(Boolean))];
    const now = new Date();

    const existing = await this.prisma.cloudRemote.findMany({
      select: {
        remoteName: true,
        isActive: true
      }
    });

    const existingMap = new Map(existing.map((item) => [item.remoteName, item]));
    const added: string[] = [];
    const reactivated: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const remoteName of normalized) {
        const found = existingMap.get(remoteName);

        if (!found) {
          added.push(remoteName);
          await tx.cloudRemote.create({
            data: {
              remoteName,
              displayName: remoteName,
              isActive: true,
              healthStatus: HealthStatus.healthy,
              lastSyncAt: now
            }
          });
          continue;
        }

        if (!found.isActive) {
          reactivated.push(remoteName);
        }

        await tx.cloudRemote.update({
          where: { remoteName },
          data: {
            isActive: true,
            healthStatus: HealthStatus.healthy,
            lastSyncAt: now
          }
        });
      }

      await tx.cloudRemote.updateMany({
        where: {
          remoteName: { notIn: normalized },
          isActive: true
        },
        data: {
          isActive: false,
          healthStatus: HealthStatus.unavailable,
          lastSyncAt: now
        }
      });
    });

    const disabled = existing
      .filter((item) => item.isActive && !normalized.includes(item.remoteName))
      .map((item) => item.remoteName);

    return {
      added,
      reactivated,
      disabled
    };
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
        healthStatus
      }
    });
  }

  async updateRemoteCapacitySettings(
    remoteId: bigint,
    input: {
      totalCapacity?: bigint;
      reservedCapacity?: bigint;
      warningThresholdPercent?: number;
    }
  ): Promise<void> {
    await this.prisma.cloudRemote.update({
      where: { id: remoteId },
      data: {
        totalCapacity: input.totalCapacity,
        reservedCapacity: input.reservedCapacity,
        warningThresholdPercent: input.warningThresholdPercent
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
}
