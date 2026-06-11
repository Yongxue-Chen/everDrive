import path from 'node:path';
import { AppError } from '../../errors/app-error.js';
import type { IRcloneClient, RcloneListEntry } from '../../infrastructure/rclone/rclone-rcd-client.js';

export type RemoteSourceFile = {
  relativePath: string;
  sizeBytes: bigint;
  modifiedTime: Date;
  md5: string | null;
  sha1: string | null;
};

export class RcloneSourceService {
  constructor(
    private readonly client: IRcloneClient,
    private readonly isBusinessRemote?: (name: string) => Promise<boolean>
  ) {}

  async listSources(): Promise<Array<{ name: string; type: 'smb' | 'sftp' }>> {
    const names = await this.client.listRemotes();
    const rows = await Promise.all(
      names.map(async (name) => ({ name, type: String((await this.requireGetRemoteConfig()(name)).type ?? '') }))
    );
    const allowed = rows.filter((item): item is { name: string; type: 'smb' | 'sftp' } => item.type === 'smb' || item.type === 'sftp');

    if (!this.isBusinessRemote) {
      return allowed;
    }

    const availability = await Promise.all(
      allowed.map(async (item) => ({ item, bound: await this.isBusinessRemote!(item.name) }))
    );
    return availability.filter((item) => !item.bound).map((item) => item.item);
  }

  async browse(remoteName: string, sourcePath = ''): Promise<Array<{ name: string; path: string; isDirectory: boolean; sizeBytes: string }>> {
    await this.ensureAllowed(remoteName);
    const normalizedPath = this.normalizePath(sourcePath);
    const rows = await this.requireListEntries()(`${remoteName}:`, normalizedPath, false);
    return rows.map((item) => ({
      name: item.Name,
      path: path.posix.join(normalizedPath, item.Name).replace(/^\.\//, ''),
      isDirectory: item.IsDir,
      sizeBytes: String(item.Size ?? 0)
    }));
  }

  async scan(remoteName: string, sourcePath = ''): Promise<RemoteSourceFile[]> {
    await this.ensureAllowed(remoteName);
    const rows = await this.requireListEntries()(`${remoteName}:`, this.normalizePath(sourcePath), true);
    return rows.filter((item) => !item.IsDir).map((item) => this.toFile(item));
  }

  async test(remoteName: string, sourcePath = ''): Promise<{ online: true }> {
    await this.ensureAllowed(remoteName);
    await this.requireListEntries()(`${remoteName}:`, this.normalizePath(sourcePath), false);
    return { online: true };
  }

  private requireGetRemoteConfig() {
    if (!this.client.getRemoteConfig) throw new Error('rclone config API unavailable');
    return this.client.getRemoteConfig.bind(this.client);
  }

  private requireListEntries() {
    if (!this.client.listEntries) throw new Error('rclone list API unavailable');
    return this.client.listEntries.bind(this.client);
  }

  private async ensureAllowed(name: string): Promise<void> {
    if (this.isBusinessRemote && (await this.isBusinessRemote(name))) {
      throw new AppError({ code: 'BAD_REQUEST', message: `rclone remote ${name} is already used as a business target`, statusCode: 400 });
    }
    const type = String((await this.requireGetRemoteConfig()(name)).type ?? '');
    if (type !== 'smb' && type !== 'sftp') {
      throw new AppError({ code: 'BAD_REQUEST', message: `rclone remote ${name} is not an SMB/SFTP source`, statusCode: 400 });
    }
  }

  private normalizePath(value: string): string {
    const normalized = path.posix.normalize(value.trim().replace(/\\/g, '/')).replace(/^\/+|\/+$/g, '');
    if (normalized === '.' || !normalized) return '';
    if (normalized === '..' || normalized.startsWith('../')) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'sourcePath is invalid', statusCode: 400 });
    }
    return normalized;
  }

  private toFile(item: RcloneListEntry): RemoteSourceFile {
    return {
      relativePath: item.Path.replace(/^\/+/, ''),
      sizeBytes: BigInt(item.Size ?? 0),
      modifiedTime: new Date(item.ModTime),
      md5: item.Hashes?.MD5 ?? item.Hashes?.md5 ?? null,
      sha1: item.Hashes?.SHA1 ?? item.Hashes?.sha1 ?? null
    };
  }
}
