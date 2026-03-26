import pino from 'pino';
import type { OperationType, Prisma, TargetType } from '@prisma/client';
import type { OperationLogRepository } from '../infrastructure/repositories/operation-log.repository.js';
import { getEnv } from '../config/env.js';

type LoggerContext = {
  requestId?: string;
  jobId?: string;
  module?: string;
};

type LogMeta = Record<string, unknown>;

type AuditPayload = {
  operationType: OperationType;
  targetType: TargetType;
  targetId?: bigint;
  message: string;
  metadataJson?: Prisma.InputJsonValue;
};

const env = getEnv();

const baseLogger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'everdrive-backend'
  }
});

export class AppLogger {
  constructor(
    private readonly pinoLogger: pino.Logger,
    private readonly context: LoggerContext = {},
    private readonly operationLogRepository?: OperationLogRepository
  ) {}

  withContext(context: LoggerContext): AppLogger {
    return new AppLogger(this.pinoLogger, { ...this.context, ...context }, this.operationLogRepository);
  }

  withOperationLogRepository(operationLogRepository: OperationLogRepository): AppLogger {
    return new AppLogger(this.pinoLogger, this.context, operationLogRepository);
  }

  info(message: string, meta?: LogMeta): void {
    this.pinoLogger.info({ ...this.context, ...meta }, message);
  }

  warn(message: string, meta?: LogMeta): void {
    this.pinoLogger.warn({ ...this.context, ...meta }, message);
  }

  error(message: string, meta?: LogMeta): void {
    this.pinoLogger.error({ ...this.context, ...meta }, message);
  }

  debug(message: string, meta?: LogMeta): void {
    this.pinoLogger.debug({ ...this.context, ...meta }, message);
  }

  async audit(payload: AuditPayload): Promise<void> {
    this.info(payload.message, {
      operationType: payload.operationType,
      targetType: payload.targetType,
      targetId: payload.targetId,
      metadataJson: payload.metadataJson
    });

    if (!this.operationLogRepository) {
      this.warn('Operation log repository is not configured; audit log skipped');
      return;
    }

    await this.operationLogRepository.create(payload);
  }
}

export const rawLogger = baseLogger;
export const logger = new AppLogger(baseLogger);
