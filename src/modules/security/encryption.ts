import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../../errors/app-error.js';

const FILE_MAGIC = Buffer.from('EDV1');

function normalizeInputPath(input: string): string {
  return input.replace(/\\/g, '/');
}

export function resolveEncryptionKey(rawKey: string | undefined): Buffer | null {
  if (!rawKey || !rawKey.trim()) {
    return null;
  }

  const value = rawKey.trim();
  let source: Buffer;
  if (value.startsWith('hex:')) {
    source = Buffer.from(value.slice(4), 'hex');
  } else if (value.startsWith('base64:')) {
    source = Buffer.from(value.slice(7), 'base64');
  } else if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    source = Buffer.from(value, 'hex');
  } else {
    source = Buffer.from(value, 'utf8');
  }

  if (source.length === 0) {
    return null;
  }

  return createHash('sha256').update(source).digest();
}

export function buildEncryptedRemotePath(relativePath: string, key: Buffer): string {
  const normalized = normalizeInputPath(relativePath);
  const digest = createHmac('sha256', key).update(normalized).digest('hex');
  return `${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest}.edc`;
}

export async function encryptFileToTemp(localPath: string, key: Buffer): Promise<{ encryptedPath: string; cleanup: () => Promise<void> }> {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'everdrive-enc-'));
  const encryptedPath = path.join(tmpRoot, 'payload.edc');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const source = fs.createReadStream(localPath);
  const destination = fs.createWriteStream(encryptedPath);
  destination.write(FILE_MAGIC);
  destination.write(iv);

  await pipeline(source, cipher, destination);
  await fsp.appendFile(encryptedPath, cipher.getAuthTag());

  return {
    encryptedPath,
    cleanup: async () => {
      await fsp.rm(tmpRoot, { recursive: true, force: true });
    }
  };
}

export function requireEncryptionKeyOrThrow(rawKey: string | undefined): Buffer {
  const key = resolveEncryptionKey(rawKey);
  if (!key) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: 'encryptionEnabled task requires ENCRYPTION_MASTER_KEY',
      statusCode: 400
    });
  }
  return key;
}
