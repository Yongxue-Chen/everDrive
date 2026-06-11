import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptFile, encryptFileToTemp, resolveEncryptionKey } from '../src/modules/security/encryption.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('encrypted file recovery', () => {
  it('decrypts an everDrive encrypted file with the same master key', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'everdrive-recovery-test-')); roots.push(root);
    const source = path.join(root, 'source.txt'); const restored = path.join(root, 'restored.txt');
    await fs.writeFile(source, 'private recovery payload');
    const key = resolveEncryptionKey('stable-master-key')!;
    const encrypted = await encryptFileToTemp(source, key);
    await decryptFile(encrypted.encryptedPath, restored, key);
    await expect(fs.readFile(restored, 'utf8')).resolves.toBe('private recovery payload');
    await encrypted.cleanup();
  });

  it('rejects recovery with a different master key', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'everdrive-recovery-test-')); roots.push(root);
    const source = path.join(root, 'source.txt'); const restored = path.join(root, 'restored.txt');
    await fs.writeFile(source, 'private recovery payload');
    const encrypted = await encryptFileToTemp(source, resolveEncryptionKey('original-key')!);
    await expect(decryptFile(encrypted.encryptedPath, restored, resolveEncryptionKey('wrong-key')!)).rejects.toThrow();
    await encrypted.cleanup();
  });
});
