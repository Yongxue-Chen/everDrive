import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileHasher } from '../src/modules/scan/file-hasher.js';

const tempPaths: string[] = [];

async function createTempFile(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'everdrive-hash-'));
  const filePath = path.join(dir, 'sample.txt');
  await fs.writeFile(filePath, content, 'utf8');
  tempPaths.push(dir);
  return filePath;
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('FileHasher', () => {
  it('computes md5 and sha1 for file content', async () => {
    const filePath = await createTempFile('everdrive-phase7');
    const hasher = new FileHasher();

    const result = await hasher.hash(filePath);

    expect(result.md5).toBe('7d0adf5470b39069b6ab7971c1990481');
    expect(result.sha1).toBe('0e18c6cc909448a67cdfe156f44866ecc04eae8e');
  });
});
