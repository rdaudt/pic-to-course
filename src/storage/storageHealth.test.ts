import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStorageHealth, requestPersistentStorage } from './storageHealth';

const megabyte = 1024 * 1024;

describe('storage health', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests persistent storage when supported', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('returns undefined when persistence is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });

  it.each([
    [49 * megabyte, 'critical'],
    [199 * megabyte, 'warning'],
    [200 * megabyte, 'ok'],
  ] as const)('classifies %d bytes free as %s', async (free, level) => {
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn().mockResolvedValue({ usage: megabyte, quota: megabyte + free }) },
    });

    await expect(getStorageHealth()).resolves.toEqual({
      usage: megabyte,
      quota: megabyte + free,
      free,
      level,
    });
  });

  it('returns unknown without quota APIs', async () => {
    vi.stubGlobal('navigator', {});

    await expect(getStorageHealth()).resolves.toEqual({ level: 'unknown' });
  });
});
