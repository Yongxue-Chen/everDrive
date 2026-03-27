const BYTES_PER_GB = 1024 ** 3;

export function formatBytes(value: string | number): string {
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let current = bytes;
  let unit = 0;

  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }

  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatGigabytes(value: string | number): string {
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }

  return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
}

export function bytesToGigabyteInput(value: string | number): string {
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0';
  }

  return (bytes / BYTES_PER_GB).toFixed(2);
}

export function gigabytesToBytes(value: string): string {
  const gigabytes = Number(value);
  if (!Number.isFinite(gigabytes) || gigabytes <= 0) {
    return '0';
  }

  return Math.round(gigabytes * BYTES_PER_GB).toString();
}

export function formatDate(value: string | null): string {
  if (!value) {
    return '从未';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间无效';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
