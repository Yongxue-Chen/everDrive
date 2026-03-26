import type { OperationType, Prisma, PrismaClient, TargetType } from '@prisma/client';

export type CreateOperationLogInput = {
  operationType: OperationType;
  targetType: TargetType;
  targetId?: bigint;
  message: string;
  metadataJson?: Prisma.InputJsonValue;
};

export class OperationLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateOperationLogInput): Promise<void> {
    await this.prisma.operationLog.create({
      data: {
        operationType: input.operationType,
        targetType: input.targetType,
        targetId: input.targetId,
        message: input.message,
        metadataJson: input.metadataJson
      }
    });
  }

  async list(input?: {
    operationType?: OperationType;
    targetType?: TargetType;
    targetId?: bigint;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<
    Array<{
      id: bigint;
      operationType: OperationType;
      targetType: TargetType;
      targetId: bigint | null;
      message: string;
      metadataJson: Prisma.JsonValue | null;
      createdAt: Date;
    }>
  > {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 500);
    const where: Prisma.OperationLogWhereInput = {
      ...(input?.operationType ? { operationType: input.operationType } : {}),
      ...(input?.targetType ? { targetType: input.targetType } : {}),
      ...(input?.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(input?.from || input?.to
        ? {
            createdAt: {
              ...(input?.from ? { gte: input.from } : {}),
              ...(input?.to ? { lte: input.to } : {})
            }
          }
        : {})
    };

    return this.prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
