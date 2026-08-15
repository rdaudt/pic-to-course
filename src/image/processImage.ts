import type { PageAsset } from '../domain/models';

const FULL_MAX_EDGE = 2400;
const THUMBNAIL_MAX_EDGE = 360;
const FULL_JPEG_QUALITY = 0.86;
const THUMBNAIL_JPEG_QUALITY = 0.76;

type DrawableBitmap = ImageBitmap;
type ImageCanvas = HTMLCanvasElement | OffscreenCanvas;

export async function processCapturedImage(source: Blob): Promise<PageAsset> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });

  try {
    const fullSize = fitWithin(bitmap.width, bitmap.height, FULL_MAX_EDGE);
    const thumbnailSize = fitWithin(bitmap.width, bitmap.height, THUMBNAIL_MAX_EDGE);

    const [imageBlob, thumbnailBlob] = await Promise.all([
      encodeJpeg(bitmap, fullSize.width, fullSize.height, FULL_JPEG_QUALITY),
      encodeJpeg(bitmap, thumbnailSize.width, thumbnailSize.height, THUMBNAIL_JPEG_QUALITY),
    ]);

    return { imageBlob, thumbnailBlob, ...fullSize };
  } finally {
    bitmap.close();
  }
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function encodeJpeg(
  bitmap: DrawableBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create an image canvas');

  context.drawImage(bitmap, 0, 0, width, height);

  if (isOffscreenCanvas(canvas)) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode image as JPEG'));
    }, 'image/jpeg', quality);
  });
}

function createCanvas(width: number, height: number): ImageCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function isOffscreenCanvas(canvas: ImageCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}
