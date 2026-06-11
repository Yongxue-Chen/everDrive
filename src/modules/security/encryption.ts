import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
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

export async function decryptFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
  const stat = await fsp.stat(inputPath);
  const headerSize = FILE_MAGIC.length + 12;
  const authTagSize = 16;
  if (stat.size <= headerSize + authTagSize) throw new AppError({ code: 'BAD_REQUEST', message: 'encrypted file is truncated', statusCode: 400 });
  const handle = await fsp.open(inputPath, 'r');
  try {
    const header = Buffer.alloc(headerSize);
    const authTag = Buffer.alloc(authTagSize);
    await handle.read(header, 0, header.length, 0);
    await handle.read(authTag, 0, authTag.length, stat.size - authTagSize);
    if (!header.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) throw new AppError({ code: 'BAD_REQUEST', message: 'file is not an everDrive encrypted file', statusCode: 400 });
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(FILE_MAGIC.length));
    decipher.setAuthTag(authTag);
    await pipeline(fs.createReadStream(inputPath, { start: headerSize, end: stat.size - authTagSize - 1 }), decipher, fs.createWriteStream(outputPath));
  } finally { await handle.close(); }
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
