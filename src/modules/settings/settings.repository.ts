import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SettingsSchema, type Settings } from './settings.dto.js';

export class SettingsRepository {
  constructor(private readonly filePath = path.resolve(process.cwd(), 'runtime', 'settings.json')) {}

  async load(defaults: Settings): Promise<Settings> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return SettingsSchema.parse(parsed);
    } catch {
      await this.save(defaults);
      return defaults;
    }
  }

  async save(settings: Settings): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const content = JSON.stringify(settings, null, 2);
    await writeFile(this.filePath, content, { encoding: 'utf8', mode: 0o600 });
  }
}
