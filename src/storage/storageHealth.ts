export type StorageHealth = {
  usage?: number;
  quota?: number;
  free?: number;
  level: 'ok' | 'warning' | 'critical' | 'unknown';
};

const WARNING_FREE_BYTES = 200 * 1024 * 1024;
const CRITICAL_FREE_BYTES = 50 * 1024 * 1024;

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  const persist = globalThis.navigator?.storage?.persist;
  if (!persist) return undefined;

  try {
    return await persist.call(globalThis.navigator.storage);
  } catch {
    return undefined;
  }
}

export async function getStorageHealth(): Promise<StorageHealth> {
  const estimate = globalThis.navigator?.storage?.estimate;
  if (!estimate) return { level: 'unknown' };

  try {
    const { usage, quota } = await estimate.call(globalThis.navigator.storage);
    if (typeof usage !== 'number' || typeof quota !== 'number') return { level: 'unknown' };

    const free = quota - usage;
    const level: StorageHealth['level'] =
      free < CRITICAL_FREE_BYTES
        ? 'critical'
        : free < WARNING_FREE_BYTES
          ? 'warning'
          : 'ok';

    return { usage, quota, free, level };
  } catch {
    return { level: 'unknown' };
  }
}
