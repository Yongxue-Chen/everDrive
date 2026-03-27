import path from 'node:path';
import fs from 'node:fs/promises';
import { AppError } from '../../errors/app-error.js';

export type LocalPathItem = {
  name: string;
  path: string;
  isDirectory: true;
};

export type LocalPathBrowseResult = {
  currentPath: string;
  parentPath: string | null;
  roots: string[];
  items: LocalPathItem[];
};

export class LocalPathService {
  private readonly allowedRoots: string[];

  constructor(allowedRoots: string[]) {
    this.allowedRoots = [...new Set(allowedRoots.map((item) => path.resolve(item.trim())).filter(Boolean))];
    if (this.allowedRoots.length === 0) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'LOCAL_PATH_ALLOWED_ROOTS cannot be empty',
        statusCode: 400
      });
    }
  }

  async browse(rawPath?: string): Promise<LocalPathBrowseResult> {
    const currentPath = this.resolveRequestedPath(rawPath);
    await this.ensureDirectory(currentPath);

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const items = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(currentPath, entry.name),
        isDirectory: true as const
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const parentCandidate = path.dirname(currentPath);
    const parentPath = parentCandidate !== currentPath && this.isAllowed(parentCandidate) ? parentCandidate : null;

    return {
      currentPath,
      parentPath,
      roots: this.allowedRoots,
      items
    };
  }

  private resolveRequestedPath(rawPath?: string): string {
    if (!rawPath) {
      return this.allowedRoots[0];
    }

    const resolved = path.resolve(rawPath);
    if (!this.isAllowed(resolved)) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `path is outside allowed roots: ${rawPath}`,
        statusCode: 400
      });
    }

    return resolved;
  }

  private isAllowed(candidate: string): boolean {
    return this.allowedRoots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
  }

  private async ensureDirectory(targetPath: string): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(targetPath);
    } catch {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `path does not exist: ${targetPath}`,
        statusCode: 400
      });
    }

    if (!stat.isDirectory()) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `path is not a directory: ${targetPath}`,
        statusCode: 400
      });
    }
  }
}
