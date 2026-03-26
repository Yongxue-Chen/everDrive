import { RcloneClientError, type IRcloneClient, type RcloneJobStatus } from './rclone-rcd-client.js';
import { logger } from '../../lib/logger.js';

export type WaitJobOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

export type RemoteToRemoteCopyInput = {
  sourceRemote: string;
  sourcePath: string;
  targetRemote: string;
  targetPath: string;
  async?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RcloneService {
  private readonly log = logger.withContext({ module: 'rclone-service' });

  constructor(private readonly client: IRcloneClient) {}

  async ensureOnline(): Promise<void> {
    const online = await this.client.checkOnline();
    if (!online) {
      throw new RcloneClientError({
        code: 'NETWORK_ERROR',
        message: 'rclone rcd is offline',
        method: 'core/version'
      });
    }
  }

  async listRemotes(): Promise<string[]> {
    return this.client.listRemotes();
  }

  async listConfigProviders(): Promise<{ providers: Array<Record<string, unknown>> }> {
    return this.client.getConfigProviders();
  }

  async remoteToRemoteCopy(input: RemoteToRemoteCopyInput) {
    this.log.info('remote-to-remote copy requested', {
      sourceRemote: input.sourceRemote,
      sourcePath: input.sourcePath,
      targetRemote: input.targetRemote,
      targetPath: input.targetPath,
      async: input.async ?? false
    });

    return this.client.copyRemoteToRemote({
      srcFs: input.sourceRemote,
      srcRemote: input.sourcePath,
      dstFs: input.targetRemote,
      dstRemote: input.targetPath,
      async: input.async ?? false
    });
  }

  async waitForJob(jobId: number, options?: WaitJobOptions): Promise<RcloneJobStatus> {
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const intervalMs = options?.intervalMs ?? 1_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.client.getJobStatus(jobId);

      if (!status.finished) {
        await sleep(intervalMs);
        continue;
      }

      if (!status.success) {
        throw new RcloneClientError({
          code: 'RCLONE_API_ERROR',
          message: status.error ?? `rclone job ${jobId} failed`,
          method: 'job/status',
          responseBody: status
        });
      }

      return status;
    }

    throw new RcloneClientError({
      code: 'NETWORK_TIMEOUT',
      message: `waiting for rclone job ${jobId} timed out after ${timeoutMs}ms`,
      method: 'job/status'
    });
  }
}
