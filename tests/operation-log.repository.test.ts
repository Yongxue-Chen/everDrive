import { describe, expect, it, vi } from 'vitest';
import { OperationLogRepository } from '../src/infrastructure/repositories/operation-log.repository.js';

describe('OperationLogRepository', () => {
  it('creates operation log row', async () => {
    const create = vi.fn(async () => ({}));
    const repository = new OperationLogRepository({
      operationLog: { create }
    } as any);

    await repository.create({
      operationType: 'create',
      targetType: 'mapping_task',
      targetId: 1n,
      message: 'created',
      metadataJson: { key: 'value' }
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationType: 'create',
          targetType: 'mapping_task',
          targetId: 1n
        })
      })
    );
  });

  it('lists logs with filters and limit bound', async () => {
    const findMany = vi.fn(async () => []);
    const repository = new OperationLogRepository({
      operationLog: { findMany }
    } as any);

    await repository.list({
      operationType: 'sync',
      targetType: 'file',
      targetId: 99n,
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-31T00:00:00.000Z'),
      limit: 999
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: expect.objectContaining({
          operationType: 'sync',
          targetType: 'file',
          targetId: 99n
        })
      })
    );
  });
});
