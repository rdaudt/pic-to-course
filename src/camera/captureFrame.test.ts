import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureFrame } from './captureFrame';

describe('captureFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes the current video frame as a transient high-quality JPEG', async () => {
    const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      callback(new Blob(['frame'], { type: `${type};q=${quality}` }));
    });
    const context = { drawImage: vi.fn() };
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
      return { width: 0, height: 0, getContext: () => context, toBlob } as unknown as HTMLCanvasElement;
    });
    const video = { videoWidth: 1920, videoHeight: 1440 } as HTMLVideoElement;

    const frame = await captureFrame(video);

    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1440);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95);
    expect(frame.type).toBe('image/jpeg;q=0.95');
  });

  it('refuses to capture before the camera has a frame', async () => {
    const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;

    await expect(captureFrame(video)).rejects.toThrow('Camera frame is not ready');
  });
});
