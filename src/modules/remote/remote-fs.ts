export function normalizeRemoteRootPath(remoteRootPath?: string | null): string {
  return (remoteRootPath ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

export function buildRemoteFs(remoteName: string, remoteRootPath?: string | null): string {
  const normalizedRootPath = normalizeRemoteRootPath(remoteRootPath);
  if (!normalizedRootPath) {
    return `${remoteName}:`;
  }
  return `${remoteName}:${normalizedRootPath}`;
}

export function buildDestinationPath(remoteName: string, remoteRootPath?: string | null, remoteBasePath?: string | null): string {
  const segments = [normalizeRemoteRootPath(remoteRootPath), normalizeRemoteRootPath(remoteBasePath)].filter(Boolean);
  return `${remoteName}:${segments.length ? `/${segments.join('/')}` : '/'}`;
}
