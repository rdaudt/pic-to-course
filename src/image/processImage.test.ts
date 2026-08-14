import { afterEach, describe, expect, it, vi } from 'vitest';
import { processCapturedImage } from './processImage';

type CanvasCall = { width: number; height: number; type: string; quality: number };

describe('processCapturedImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('encodes oriented full and thumbnail JPEGs within the fixed size profile', async () => {
    const source = new Blob(['original'], { type: 'image/heic' });
    const close = vi.fn();
    const canvasCalls: CanvasCall[] = [];

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4800, height: 3200, close }),
    );
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);

      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback, type?: string, quality?: number) => {
          canvasCalls.push({
            width: canvas.width,
            height: canvas.height,
            type: type ?? '',
            quality: quality ?? 0,
          });
          callback(new Blob(['encoded'], { type }));
        },
      };
      return canvas as unknown as HTMLElement;
    });

    const asset = await processCapturedImage(source);

    expect(createImageBitmap).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
    expect(asset).toMatchObject({ width: 2400, height: 1600 });
    expect(asset.imageBlob).not.toBe(source);
    expect(asset.thumbnailBlob).not.toBe(source);
    expect(canvasCalls).toEqual([
      { width: 2400, height: 1600, type: 'image/jpeg', quality: 0.86 },
      { width: 360, height: 240, type: 'image/jpeg', quality: 0.76 },
    ]);
    expect(close).toHaveBeenCalledOnce();
  });
});
