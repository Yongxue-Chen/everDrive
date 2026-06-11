import { getEnv } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export type RcloneErrorCode =
  | 'AUTH_FAILED'
  | 'REMOTE_NOT_FOUND'
  | 'NETWORK_TIMEOUT'
  | 'PATH_CONFLICT'
  | 'NETWORK_ERROR'
  | 'RCLONE_API_ERROR';

export class RcloneClientError extends Error {
  readonly code: RcloneErrorCode;
  readonly statusCode?: number;
  readonly method: string;
  readonly responseBody?: unknown;

  constructor(params: {
    code: RcloneErrorCode;
    message: string;
    method: string;
    statusCode?: number;
    responseBody?: unknown;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'RcloneClientError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.method = params.method;
    this.responseBody = params.responseBody;
  }
}

export type RcloneOperationResult =
  | { async: true; jobId: number }
  | { async: false; result: Record<string, unknown> };

export type TransferOperationInput = {
  srcFs: string;
  srcRemote: string;
  dstFs: string;
  dstRemote: string;
  createEmptySrcDirs?: boolean;
  async?: boolean;
};

export type DeleteOperationInput = {
  fs: string;
  remote: string;
  async?: boolean;
};

export type MkdirOperationInput = {
  fs: string;
  remote: string;
  async?: boolean;
};

export type RcloneJobStatus = {
  finished: boolean;
  success: boolean;
  error?: string;
  output?: unknown;
  duration?: number;
  startTime?: string;
  endTime?: string;
};

export type RcloneConfigProviders = {
  providers: Array<Record<string, unknown>>;
};

export type RcloneListEntry = { Path: string; Name: string; IsDir: boolean; Size: number; ModTime: string; Hashes?: Record<string, string> };

export type RcloneAboutResult = {
  total: string | null;
  used: string | null;
  free: string | null;
};

type RcloneClientOptions = {
  baseUrl?: string;
  user?: string;
  pass?: string;
  timeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  getExecutionProfile?: () => {
    transfers: number;
    checkers: number;
    bufferSizeMiB: number;
    tpsLimit: number;
    bwLimitMiB: number;
  };
};

type RcloneRpcResponseBody = {
  error?: string;
  status?: number;
  [key: string]: unknown;
};

export type RcloneConfigValue = string | number | boolean;
export type RcloneConfigParameters = Record<string, RcloneConfigValue>;
export type RcloneConfigMutationInput = {
  name: string;
  type?: string;
  parameters: RcloneConfigParameters;
};

export interface IRcloneConfigClient {
  listRemotes(): Promise<string[]>;
  getConfigProviders(): Promise<RcloneConfigProviders>;
  getRemoteConfig(name: string): Promise<Record<string, unknown>>;
  createRemoteConfig(input: RcloneConfigMutationInput & { type: string }): Promise<Record<string, unknown>>;
  updateRemoteConfig(input: RcloneConfigMutationInput): Promise<Record<string, unknown>>;
  deleteRemoteConfig(name: string): Promise<void>;
  testRemote(name: string): Promise<boolean>;
}

export interface IRcloneClient {
  checkOnline(): Promise<boolean>;
  listRemotes(): Promise<string[]>;
  getAbout(fs: string): Promise<RcloneAboutResult>;
  stat(fs: string, remote: string): Promise<boolean>;
  getRemoteConfig?(name: string): Promise<Record<string, unknown>>;
  listEntries?(fs: string, remote: string, recursive?: boolean): Promise<RcloneListEntry[]>;
  getConfigProviders(): Promise<RcloneConfigProviders>;
  copy(input: TransferOperationInput): Promise<RcloneOperationResult>;
  sync(input: TransferOperationInput): Promise<RcloneOperationResult>;
  move(input: TransferOperationInput): Promise<RcloneOperationResult>;
  deleteFile(input: DeleteOperationInput): Promise<RcloneOperationResult>;
  purge(input: DeleteOperationInput): Promise<RcloneOperationResult>;
  mkdir(input: MkdirOperationInput): Promise<RcloneOperationResult>;
  copyRemoteToRemote(input: TransferOperationInput): Promise<RcloneOperationResult>;
  getJobStatus(jobId: number): Promise<RcloneJobStatus>;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RcloneClient implements IRcloneClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private getExecutionProfile?: RcloneClientOptions['getExecutionProfile'];
  private readonly log = logger.withContext({ module: 'rclone-client' });

  constructor(options?: RcloneClientOptions) {
    const env = getEnv();
    const user = options?.user ?? env.RCLONE_RCD_USER;
    const pass = options?.pass ?? env.RCLONE_RCD_PASS;

    this.baseUrl = (options?.baseUrl ?? env.RCLONE_RCD_URL).replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? env.RCLONE_HTTP_TIMEOUT_MS;
    this.retryAttempts = options?.retryAttempts ?? env.RCLONE_RETRY_ATTEMPTS;
    this.retryDelayMs = options?.retryDelayMs ?? env.RCLONE_RETRY_DELAY_MS;
    this.getExecutionProfile = options?.getExecutionProfile;
    this.authHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  setExecutionProfileProvider(provider?: RcloneClientOptions['getExecutionProfile']): void {
    this.getExecutionProfile = provider;
  }

  async checkOnline(): Promise<boolean> {
    try {
      await this.post('core/version', {});
      return true;
    } catch (error) {
      this.log.warn('rclone rcd is offline', { err: error });
      return false;
    }
  }

  async listRemotes(): Promise<string[]> {
    const response = await this.post<{ remotes?: string[] }>('config/listremotes', {});
    return (response.remotes ?? []).map((remote) => remote.replace(/:$/, ''));
  }

  async getAbout(fs: string): Promise<RcloneAboutResult> {
    const response = await this.post<Record<string, unknown>>('operations/about', { fs });

    const readBigintLike = (value: unknown): string | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value).toString();
      }

      if (typeof value === 'string' && value.trim()) {
        return value;
      }

      return null;
    };

    return {
      total: readBigintLike(response.total),
      used: readBigintLike(response.used),
      free: readBigintLike(response.free)
    };
  }

  async stat(fs: string, remote: string): Promise<boolean> {
    const response = await this.post<{ item?: Record<string, unknown> | null }>('operations/stat', {
      fs,
      remote
    });
    return response.item !== null && response.item !== undefined;
  }

  async listEntries(fs: string, remote: string, recursive = false): Promise<RcloneListEntry[]> {
    const response = await this.post<{ list?: RcloneListEntry[] }>('operations/list', { fs, remote, opt: { recurse: recursive, showHash: false } });
    return response.list ?? [];
  }

  async getConfigProviders(): Promise<RcloneConfigProviders> {
    return this.post<RcloneConfigProviders>('config/providers', {});
  }

  async getRemoteConfig(name: string): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>('config/get', { name });
  }

  async createRemoteConfig(input: RcloneConfigMutationInput & { type: string }): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>('config/create', {
      name: input.name,
      type: input.type,
      parameters: input.parameters,
      opt: { nonInteractive: true, obscure: true }
    });
  }

  async updateRemoteConfig(input: RcloneConfigMutationInput): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>('config/update', {
      name: input.name,
      parameters: input.parameters,
      opt: { nonInteractive: true, obscure: true }
    });
  }

  async deleteRemoteConfig(name: string): Promise<void> {
    await this.post<Record<string, unknown>>('config/delete', { name });
  }

  async testRemote(name: string): Promise<boolean> {
    await this.post<Record<string, unknown>>('operations/list', {
      fs: `${name}:`,
      remote: '',
      opt: { maxDepth: 1 },
      _config: { MaxDepth: 1 }
    });
    return true;
  }

  async copy(input: TransferOperationInput): Promise<RcloneOperationResult> {
    return this.transfer('operations/copyfile', input);
  }

  async sync(input: TransferOperationInput): Promise<RcloneOperationResult> {
    return this.transfer('sync/sync', input);
  }

  async move(input: TransferOperationInput): Promise<RcloneOperationResult> {
    return this.transfer('operations/movefile', input);
  }

  async copyRemoteToRemote(input: TransferOperationInput): Promise<RcloneOperationResult> {
    return this.transfer('sync/copy', input);
  }

  async deleteFile(input: DeleteOperationInput): Promise<RcloneOperationResult> {
    return this.callOperation('operations/deletefile', {
      fs: input.fs,
      remote: input.remote,
      _async: input.async ?? false
    });
  }

  async purge(input: DeleteOperationInput): Promise<RcloneOperationResult> {
    return this.callOperation('operations/purge', {
      fs: input.fs,
      remote: input.remote,
      _async: input.async ?? false
    });
  }

  async mkdir(input: MkdirOperationInput): Promise<RcloneOperationResult> {
    return this.callOperation('operations/mkdir', {
      fs: input.fs,
      remote: input.remote,
      _async: input.async ?? false
    });
  }

  async getJobStatus(jobId: number): Promise<RcloneJobStatus> {
    const response = await this.post<RcloneJobStatus>('job/status', {
      jobid: jobId
    });
    return response;
  }

  private async transfer(method: string, input: TransferOperationInput): Promise<RcloneOperationResult> {
    return this.callOperation(method, this.withExecutionProfile({
      srcFs: input.srcFs,
      srcRemote: input.srcRemote,
      dstFs: input.dstFs,
      dstRemote: input.dstRemote,
      createEmptySrcDirs: input.createEmptySrcDirs ?? false,
      _async: input.async ?? false
    }));
  }

  private async callOperation(
    method: string,
    payload: Record<string, unknown> & { _async: boolean }
  ): Promise<RcloneOperationResult> {
    const response = await this.post<{ jobid?: number } & Record<string, unknown>>(method, payload);

    if (payload._async) {
      if (typeof response.jobid !== 'number') {
        throw new RcloneClientError({
          code: 'RCLONE_API_ERROR',
          message: `rclone async call missing job id for ${method}`,
          method,
          responseBody: response
        });
      }
      return { async: true, jobId: response.jobid };
    }

    return { async: false, result: response };
  }

  private withExecutionProfile(payload: Record<string, unknown> & { _async: boolean }): Record<string, unknown> & { _async: boolean } {
    const profile = this.getExecutionProfile?.();
    if (!profile) {
      return payload;
    }

    return {
      ...payload,
      _config: {
        Transfers: profile.transfers,
        Checkers: profile.checkers,
        BufferSize: profile.bufferSizeMiB * 1024 * 1024,
        TPSLimit: profile.tpsLimit,
        BwLimit: `${profile.bwLimitMiB}M`
      }
    };
  }

  private async post<TResult extends Record<string, unknown>>(method: string, body: Record<string, unknown>): Promise<TResult> {
    const startedAt = Date.now();

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        this.log.debug('rclone request', { method, attempt, body });

        const response = await fetch(`${this.baseUrl}/${method}`, {
          method: 'POST',
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const responseBody = (await response.json().catch(async () => {
          const textBody = await response.text();
          return { error: textBody };
        })) as RcloneRpcResponseBody;

        if (!response.ok) {
          const error = this.mapResponseError(method, response.status, responseBody);
          this.log.error('rclone request failed', {
            method,
            attempt,
            code: error.code,
            statusCode: error.statusCode,
            responseBody: error.responseBody
          });

          if (attempt < this.retryAttempts && this.shouldRetry(error)) {
            await sleep(this.retryDelayMs);
            continue;
          }
          throw error;
        }

        this.log.info('rclone request succeeded', {
          method,
          attempt,
          durationMs: Date.now() - startedAt
        });
        return responseBody as TResult;
      } catch (error) {
        const mapped = this.mapThrownError(method, error);
        this.log.error('rclone request exception', {
          method,
          attempt,
          code: mapped.code,
          err: error
        });

        if (attempt < this.retryAttempts && this.shouldRetry(mapped)) {
          await sleep(this.retryDelayMs);
          continue;
        }
        throw mapped;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new RcloneClientError({
      code: 'RCLONE_API_ERROR',
      message: `rclone request exhausted retries for ${method}`,
      method
    });
  }

  private shouldRetry(error: RcloneClientError): boolean {
    return error.code === 'NETWORK_ERROR' || error.code === 'NETWORK_TIMEOUT';
  }

  private mapResponseError(method: string, statusCode: number, responseBody: RcloneRpcResponseBody): RcloneClientError {
    const message = responseBody.error ?? `rclone returned status ${statusCode}`;
    const lowerMessage = message.toLowerCase();

    if (statusCode === 401 || statusCode === 403) {
      return new RcloneClientError({
        code: 'AUTH_FAILED',
        message,
        method,
        statusCode,
        responseBody
      });
    }

    if (
      lowerMessage.includes("didn't find section in config file") ||
      lowerMessage.includes('remote not found') ||
      lowerMessage.includes('did not find config')
    ) {
      return new RcloneClientError({
        code: 'REMOTE_NOT_FOUND',
        message,
        method,
        statusCode,
        responseBody
      });
    }

    if (statusCode === 409 || lowerMessage.includes('already exists') || lowerMessage.includes('file exists')) {
      return new RcloneClientError({
        code: 'PATH_CONFLICT',
        message,
        method,
        statusCode,
        responseBody
      });
    }

    return new RcloneClientError({
      code: 'RCLONE_API_ERROR',
      message,
      method,
      statusCode,
      responseBody
    });
  }

  private mapThrownError(method: string, error: unknown): RcloneClientError {
    if (error instanceof RcloneClientError) {
      return error;
    }

    if (isAbortError(error)) {
      return new RcloneClientError({
        code: 'NETWORK_TIMEOUT',
        message: `rclone request timed out for ${method}`,
        method,
        cause: error
      });
    }

    return new RcloneClientError({
      code: 'NETWORK_ERROR',
      message: `rclone request failed for ${method}`,
      method,
      cause: error
    });
  }
}

export const rcloneClient = new RcloneClient();
