import fs from 'node:fs/promises';
import path from 'node:path';

export type DiscoveredFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: bigint;
  modifiedTime: Date;
};

export class LocalFileScanner {
  async scan(basePath: string): Promise<DiscoveredFile[]> {
    const files: DiscoveredFile[] = [];
    await this.walk(basePath, basePath, files);
    return files;
  }

  private async walk(basePath: string, currentPath: string, files: DiscoveredFile[]): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.walk(basePath, absolutePath, files);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stat = await fs.stat(absolutePath);
      files.push({
        absolutePath,
        relativePath: path.relative(basePath, absolutePath).replace(/\\/g, '/'),
        sizeBytes: BigInt(stat.size),
        modifiedTime: stat.mtime
      });
    }
  }
}
