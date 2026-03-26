export type SyncMode = 'archive' | 'mirror';

export interface SyncStrategy {
  mode: SyncMode;
  execute(taskId: string): Promise<void>;
}
