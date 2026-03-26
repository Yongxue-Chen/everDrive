import { createHash } from 'node:crypto';
import fs from 'node:fs';

export type FileFingerprint = {
  md5: string;
  sha1: string;
};

export class FileHasher {
  async hash(filePath: string): Promise<FileFingerprint> {
    const md5 = createHash('md5');
    const sha1 = createHash('sha1');

    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: Buffer | string) => {
        const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        md5.update(data);
        sha1.update(data);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve());
    });

    return {
      md5: md5.digest('hex'),
      sha1: sha1.digest('hex')
    };
  }
}
