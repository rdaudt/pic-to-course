import type { PageAsset } from '../domain/models';

declare global {
  interface Window {
    __PHOTO_EBOOK_TEST__?: {
      setCaptureCount: (count: number) => void;
    };
  }
}

let remainingCaptures = 0;
let captureNumber = 0;

export const isTestCaptureMode = import.meta.env.MODE === 'test' && !import.meta.env.VITEST;

export function installTestCaptureAdapter() {
  window.__PHOTO_EBOOK_TEST__ = {
    setCaptureCount(count: number) {
      remainingCaptures = Math.max(0, Math.floor(count));
    },
  };

  return () => {
    delete window.__PHOTO_EBOOK_TEST__;
  };
}

export function takeTestCaptureAsset(): PageAsset {
  if (remainingCaptures <= 0) {
    throw new Error('Set the deterministic test capture count before capturing.');
  }

  remainingCaptures -= 1;
  captureNumber += 1;
  const image = new Blob([
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><title>Test page ${captureNumber}</title><text y="48">Test page ${captureNumber}</text></svg>`,
  ], { type: 'image/svg+xml' });

  return {
    imageBlob: image,
    thumbnailBlob: image,
    width: 1200,
    height: 900,
  };
}
