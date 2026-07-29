import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readCompose(): Promise<string> {
  return readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');
}

describe('docker compose deployment contract', () => {
  it('mounts the host data directory into backend and rclone at the same path', async () => {
    const compose = await readCompose();
    const readonlyDataMount = '- "${DATA_ROOT:-./data}:/data:ro"';
    const writableDataMount = '- "${DATA_ROOT:-./data}:/data:rw"';
    expect(compose.split(readonlyDataMount)).toHaveLength(2);
    expect(compose).toContain(writableDataMount);
    expect(compose).toContain('LOCAL_PATH_ALLOWED_ROOTS: ${DOCKER_LOCAL_PATH_ALLOWED_ROOTS:-/data}');
  });

  it('uses a Docker-specific rclone URL instead of inheriting the host URL', async () => {
    const compose = await readCompose();

    expect(compose).toContain('RCLONE_RCD_URL: ${DOCKER_RCLONE_RCD_URL:-http://rclone:5572}');
  });

  it('shares the encryption temporary directory with rclone', async () => {
    const compose = await readCompose();

    expect(compose).toContain('TMPDIR: /var/lib/everdrive/tmp');
    expect(compose).toContain('- everdrive_tmp:/var/lib/everdrive/tmp');
    expect(compose.split('- everdrive_tmp:/var/lib/everdrive/tmp')).toHaveLength(3);
    expect(compose).not.toContain('- everdrive_tmp:/var/lib/everdrive/tmp:ro');
    expect(compose).toMatch(/\n  everdrive_tmp:\s*$/m);
  });

  it('binds internal service ports to localhost by default', async () => {
    const compose = await readCompose();

    expect(compose).toContain('"${MYSQL_BIND_ADDRESS:-127.0.0.1}:${MYSQL_PORT:-3306}:3306"');
    expect(compose).toContain('"${RCLONE_BIND_ADDRESS:-127.0.0.1}:${RCLONE_RCD_PORT:-5572}:5572"');
    expect(compose).toContain('"${BACKEND_BIND_ADDRESS:-127.0.0.1}:${BACKEND_PORT:-43107}:43107"');
  });

  it('pins rclone and waits for healthy dependencies', async () => {
    const compose = await readCompose();

    expect(compose).toContain('image: ${RCLONE_IMAGE:-rclone/rclone:1.73.2}');
    expect(compose.match(/healthcheck:/g)).toHaveLength(4);
    expect(compose).toContain('rclone:\n        condition: service_healthy');
    expect(compose).toContain('backend:\n        condition: service_healthy');
  });
});
