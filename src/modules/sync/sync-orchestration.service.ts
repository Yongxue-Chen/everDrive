import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';
import { SyncEngineRepository } from './sync-engine.repository.js';
import { SyncExecutor, type SyncExecutionSummary } from './sync-executor.service.js';
import { SyncPlanner, type SyncPlan } from './sync-planner.service.js';

export class SyncOrchestrationService {
  private readonly planner: SyncPlanner;
  private readonly executor: SyncExecutor;

  constructor(repository: SyncEngineRepository, rcloneClient: IRcloneClient) {
    this.planner = new SyncPlanner(repository);
    this.executor = new SyncExecutor(repository, rcloneClient);
  }

  async createPlan(mappingTaskId: bigint, options?: { deleteGraceSeconds?: number; renameHintWindowSeconds?: number }): Promise<SyncPlan> {
    return this.planner.buildPlan(mappingTaskId, options);
  }

  async execute(mappingTaskId: bigint, options?: { deleteGraceSeconds?: number; renameHintWindowSeconds?: number }): Promise<{
    plan: SyncPlan;
    summary: SyncExecutionSummary;
  }> {
    const plan = await this.createPlan(mappingTaskId, options);
    const summary = await this.executor.executePlan(plan);
    return { plan, summary };
  }
}
