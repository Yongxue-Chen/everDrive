import type { Prisma } from '@prisma/client';
import type { OperationType, TargetType } from '@prisma/client';
import { OperationLogRepository } from '../../infrastructure/repositories/operation-log.repository.js';

export class AuditService {
  constructor(private readonly repository: OperationLogRepository) {}

  async write(input: {
    operationType: OperationType;
    targetType: TargetType;
    targetId?: bigint;
    message: string;
    metadataJson?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.repository.create(input);
  }

  async query(input?: {
    operationType?: OperationType;
    targetType?: TargetType;
    targetId?: bigint;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<{
    items: Array<{
      id: string;
      operationType: OperationType;
      targetType: TargetType;
      targetId: string | null;
      message: string;
      metadataJson: unknown;
      createdAt: string;
    }>;
  }> {
    const rows = await this.repository.list(input);
    return {
      items: rows.map((row) => ({
        id: row.id.toString(),
        operationType: row.operationType,
        targetType: row.targetType,
        targetId: row.targetId?.toString() ?? null,
        message: row.message,
        metadataJson: row.metadataJson,
        createdAt: row.createdAt.toISOString()
      }))
    };
  }
}
