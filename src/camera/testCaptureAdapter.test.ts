import { describe, expect, it } from 'vitest';
import { installTestCaptureAdapter, takeTestCaptureAsset } from './testCaptureAdapter';

function jpegDimensions(bytes: Uint8Array) {
  for (let offset = 2; offset < bytes.length - 9;) {
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG marker.');
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes[offset + 5] * 256 + bytes[offset + 6],
        width: bytes[offset + 7] * 256 + bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  throw new Error('JPEG dimensions are missing.');
}

describe('test capture adapter', () => {
  it('returns a valid JPEG full image while keeping deterministic thumbnail identity', async () => {
    const uninstall = installTestCaptureAdapter();
    window.__PHOTO_EBOOK_TEST__!.setCaptureCount(1);

    const asset = takeTestCaptureAsset();
    const bytes = new Uint8Array(await asset.imageBlob.arrayBuffer());

    expect(asset.imageBlob.type).toBe('image/jpeg');
    expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...bytes.slice(-2)]).toEqual([0xff, 0xd9]);
    expect(jpegDimensions(bytes)).toEqual({ width: asset.width, height: asset.height });
    expect(asset.thumbnailBlob.type).toBe('image/svg+xml');
    expect(await asset.thumbnailBlob.text()).toContain('<title>Test page 1</title>');

    uninstall();
  });
});
