import { describe, expect, it } from 'vitest';
import { bytesToGigabyteInput, formatGigabytes, gigabytesToBytes } from '../frontend/src/lib/format.js';

describe('frontend format helpers', () => {
  it('formats bytes as gigabytes', () => {
    expect(formatGigabytes('1073741824')).toBe('1.00 GB');
    expect(bytesToGigabyteInput('2147483648')).toBe('2.00');
  });

  it('converts gigabyte inputs to bytes', () => {
    expect(gigabytesToBytes('1')).toBe('1073741824');
    expect(gigabytesToBytes('2.5')).toBe('2684354560');
  });
});
