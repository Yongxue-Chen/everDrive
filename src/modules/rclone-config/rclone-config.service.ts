import { AppError } from '../../errors/app-error.js';
import type { IRcloneConfigClient, RcloneConfigParameters } from '../../infrastructure/rclone/rclone-rcd-client.js';
import type { RcloneRemoteMetadataRepository } from './rclone-remote-metadata.repository.js';

export type BoundRemote = { id: bigint; displayName: string } | null;
export type BoundRemoteLookup = (remoteName: string) => Promise<BoundRemote>;
export type BoundRemoteList = () => Promise<Array<{ id: bigint; remoteName: string; displayName: string }>>;

const SENSITIVE_FIELD = /(pass(word)?|secret|token|credential|private[_-]?key|access[_-]?key)/i;
const VISIBLE_CONNECTION_FIELDS = new Set(['host', 'user', 'username', 'domain', 'port', 'key_file']);

function isSensitiveOption(option: { Name?: string; Sensitive?: boolean; IsPassword?: boolean }): boolean {
  const name = option.Name ?? '';
  if (VISIBLE_CONNECTION_FIELDS.has(name)) return false;
  return Boolean(option.IsPassword || option.Sensitive || SENSITIVE_FIELD.test(name));
}
const PROVIDER_FIELDS = ['Name', 'Prefix', 'Description', 'Hide'] as const;
const OPTION_FIELDS = ['Name', 'Help', 'Required', 'IsPassword', 'Sensitive', 'Advanced', 'DefaultStr', 'Type', 'Examples', 'Hide'] as const;

function pickFields(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((field) => field in source).map((field) => [field, source[field]]));
}

export class RcloneConfigService {
  constructor(
    private readonly client: IRcloneConfigClient,
    private readonly findBoundRemote: BoundRemoteLookup,
    private readonly listBoundRemotes?: BoundRemoteList,
    private readonly metadata?: RcloneRemoteMetadataRepository
  ) {}

  async listProviders() {
    const data = await this.client.getConfigProviders();
    return {
      providers: data.providers.map((provider) => ({
        ...pickFields(provider, PROVIDER_FIELDS),
        Options: Array.isArray(provider.Options)
          ? provider.Options.map((option) => ({ ...pickFields(option as Record<string, unknown>, OPTION_FIELDS), Sensitive: isSensitiveOption(option as { Name?: string; Sensitive?: boolean; IsPassword?: boolean }) }))
          : []
      }))
    };
  }

  async listRemotes() {
    const names = await this.client.listRemotes();
    const webUrlByName = new Map((await this.metadata?.list() ?? []).map((item) => [item.remoteName, item.webUrl]));
    if (this.listBoundRemotes) {
      const boundByName = new Map((await this.listBoundRemotes()).map((remote) => [remote.remoteName, remote]));
      return names.map((name) => {
        const bound = boundByName.get(name);
        return { name, boundRemoteId: bound?.id.toString() ?? null, boundDisplayName: bound?.displayName ?? null, webUrl: webUrlByName.get(name) ?? null };
      });
    }
    return Promise.all(names.map(async (name) => {
      const bound = await this.findBoundRemote(name);
      return { name, boundRemoteId: bound?.id.toString() ?? null, boundDisplayName: bound?.displayName ?? null, webUrl: webUrlByName.get(name) ?? null };
    }));
  }

  private async getSensitiveFields(type: string): Promise<Set<string>> {
    const providerData = await this.client.getConfigProviders();
    const provider = providerData.providers.find((item) => item.Prefix === type || item.Name === type) as { Options?: Array<{ Name?: string; Sensitive?: boolean; IsPassword?: boolean }> } | undefined;
    return new Set((provider?.Options ?? []).filter((option) => isSensitiveOption(option)).map((option) => option.Name).filter((field): field is string => Boolean(field)));
  }

  async getRemote(name: string) {
    const config = await this.client.getRemoteConfig(name);
    const type = typeof config.type === 'string' ? config.type : '';
    const providerSensitiveFields = await this.getSensitiveFields(type);
    const parameters: Record<string, unknown> = {};
    const sensitiveFields: string[] = [];
    for (const [key, value] of Object.entries(config)) {
      if (key === 'type') continue;
      if (SENSITIVE_FIELD.test(key) || providerSensitiveFields.has(key)) {
        parameters[key] = '';
        sensitiveFields.push(key);
      } else {
        parameters[key] = value;
      }
    }
    return { name, type, parameters, sensitiveFields };
  }

  async createRemote(input: { name: string; type: string; parameters: RcloneConfigParameters }) {
    await this.client.createRemoteConfig(input);
    return this.getRemote(input.name);
  }

  async updateRemote(name: string, parameters: RcloneConfigParameters) {
    const current = await this.client.getRemoteConfig(name);
    const type = typeof current.type === 'string' ? current.type : '';
    const providerSensitiveFields = await this.getSensitiveFields(type);
    const cleaned = Object.fromEntries(Object.entries(parameters).filter(([key, value]) => value !== '' || (!SENSITIVE_FIELD.test(key) && !providerSensitiveFields.has(key)))) as RcloneConfigParameters;
    await this.client.updateRemoteConfig({ name, parameters: cleaned });
    return this.getRemote(name);
  }

  async deleteRemote(name: string): Promise<void> {
    const bound = await this.findBoundRemote(name);
    if (bound) {
      throw new AppError({ code: 'CONFLICT', message: `rclone remote is bound to ${bound.displayName}`, statusCode: 409 });
    }
    await this.client.deleteRemoteConfig(name);
    await this.metadata?.delete(name);
  }

  async setWebUrl(name: string, webUrl: string | null): Promise<{ webUrl: string | null }> {
    const normalized = webUrl?.trim() || null;
    await this.metadata?.setWebUrl(name, normalized);
    return { webUrl: normalized };
  }

  async runConfigFlow(input: { action: 'create' | 'update'; name: string; type?: string; parameters: RcloneConfigParameters; state?: string; result?: string }) {
    return this.client.runConfigFlow(input);
  }

  async testRemote(name: string): Promise<{ online: boolean; error?: string }> {
    try {
      await this.client.testRemote(name);
      return { online: true };
    } catch (error) {
      return { online: false, error: error instanceof Error ? error.message : 'Connection test failed' };
    }
  }
}
