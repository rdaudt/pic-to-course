import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import type { EbookRecord, PageRecord } from '../domain/models';
import { createPdf } from './createPdf';

const jpeg = (marker: string) => new Blob([
  Uint8Array.from(atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AR//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  ), (character) => character.charCodeAt(0)), marker], { type: 'image/jpeg' });

// 40x30: red/green/blue/yellow corners with a black right-pointing arrow.
const asymmetricJpeg = new Blob([Uint8Array.from(atob(
  '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',
), (character) => character.charCodeAt(0))], { type: 'image/jpeg' });

function mapPdfImageCorner(matrix: number[], corner: [number, number]): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [a * corner[0] + c * corner[1] + e, b * corner[0] + d * corner[1] + f];
}

function ebookWithPages() {
  const ebook: EbookRecord = {
    id: 'ebook-1', title: 'Field Notes', createdAt: 1, updatedAt: 1, pageIds: ['second', 'first'],
  };
  const pages = new Map<string, PageRecord>([
    ['first', { id: 'first', ebookId: ebook.id, imageBlob: jpeg('first'), thumbnailBlob: jpeg('first thumb'), width: 960, height: 480, rotation: 0, capturedAt: 1 }],
    ['second', { id: 'second', ebookId: ebook.id, imageBlob: jpeg('second'), thumbnailBlob: jpeg('second thumb'), width: 640, height: 960, rotation: 0, capturedAt: 2 }],
  ]);
  return { ebook, pages };
}

describe('createPdf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports page records sequentially in ebook order with natural point dimensions', async () => {
    const { ebook, pages } = ebookWithPages();
    const readPage = vi.spyOn(db.pages, 'get').mockImplementation(((id: string) => Promise.resolve(pages.get(id))) as never);
    const progress = vi.fn();

    const blob = await createPdf(ebook, { onProgress: progress });
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(readPage.mock.calls.map(([id]) => id)).toEqual(['second', 'first']);
    expect(pdf.getPages().map((page) => page.getSize())).toEqual([
      { width: 480, height: 720 },
      { width: 720, height: 360 },
    ]);
    expect(progress).toHaveBeenNthCalledWith(1, { completed: 1, total: 2 });
    expect(progress).toHaveBeenNthCalledWith(2, { completed: 2, total: 2 });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const trailer = new TextDecoder().decode(bytes.slice(-512));
    const xrefOffset = Number(/startxref\s+(\d+)/.exec(trailer)?.[1]);
    expect(new TextDecoder().decode(bytes.slice(xrefOffset, xrefOffset + 4))).toBe('xref');

    const output = await blob.text();
    expect(output.indexOf('second')).toBeLessThan(output.indexOf('first'));
  });

  it('writes the correct page dimensions and image transform for every quarter turn', async () => {
    const { ebook, pages } = ebookWithPages();
    ebook.pageIds = ['zero', 'ninety', 'one-eighty', 'two-seventy'];
    const basePage: PageRecord = {
      id: 'zero', ebookId: ebook.id, imageBlob: jpeg('rotation'), thumbnailBlob: jpeg('thumb'),
      width: 960, height: 480, rotation: 0, capturedAt: 1,
    };
    pages.clear();
    pages.set('zero', basePage);
    pages.set('ninety', { ...basePage, id: 'ninety', rotation: 90 });
    pages.set('one-eighty', { ...basePage, id: 'one-eighty', rotation: 180 });
    pages.set('two-seventy', { ...basePage, id: 'two-seventy', rotation: 270 });
    vi.spyOn(db.pages, 'get').mockImplementation(((id: string) => Promise.resolve(pages.get(id))) as never);

    const blob = await createPdf(ebook);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    expect(pdf.getPages().map((page) => page.getSize())).toEqual([
      { width: 720, height: 360 },
      { width: 360, height: 720 },
      { width: 720, height: 360 },
      { width: 360, height: 720 },
    ]);
    const output = await blob.text();
    expect(output).toContain('720 0 0 360 0 0 cm');
    expect(output).toContain('0 -720 360 0 0 720 cm');
    expect(output).toContain('-720 0 0 -360 720 360 cm');
    expect(output).toContain('0 720 -360 0 360 0 cm');
  });

  it('maps asymmetric JPEG corners clockwise for 90 degrees and counterclockwise for 270 degrees', async () => {
    const ebook: EbookRecord = {
      id: 'asymmetric', title: 'Arrow', createdAt: 1, updatedAt: 1, pageIds: ['clockwise', 'counterclockwise'],
    };
    const base: PageRecord = {
      id: 'clockwise', ebookId: ebook.id, imageBlob: asymmetricJpeg, thumbnailBlob: asymmetricJpeg,
      width: 40, height: 30, rotation: 90, capturedAt: 1,
    };
    const pages = new Map<string, PageRecord>([
      ['clockwise', base],
      ['counterclockwise', { ...base, id: 'counterclockwise', rotation: 270 }],
    ]);
    vi.spyOn(db.pages, 'get').mockImplementation(((id: string) => Promise.resolve(pages.get(id))) as never);

    const blob = await createPdf(ebook);
    const parsed = await PDFDocument.load(await blob.arrayBuffer());
    const matrices = [...(await blob.text()).matchAll(/q\n([-\d. ]+) cm\n\/Im0 Do/g)]
      .map((match) => match[1].split(' ').map(Number));
    const [clockwiseSize, counterclockwiseSize] = parsed.getPages().map((page) => page.getSize());
    const imageCorners = {
      topLeft: [0, 1] as [number, number],
      topRight: [1, 1] as [number, number],
      bottomLeft: [0, 0] as [number, number],
      bottomRight: [1, 0] as [number, number],
    };

    expect(clockwiseSize).toEqual({ width: 22.5, height: 30 });
    expect(mapPdfImageCorner(matrices[0], imageCorners.topLeft)).toEqual([clockwiseSize.width, clockwiseSize.height]);
    expect(mapPdfImageCorner(matrices[0], imageCorners.topRight)).toEqual([clockwiseSize.width, 0]);
    expect(mapPdfImageCorner(matrices[0], imageCorners.bottomLeft)).toEqual([0, clockwiseSize.height]);
    expect(mapPdfImageCorner(matrices[0], imageCorners.bottomRight)).toEqual([0, 0]);
    expect(counterclockwiseSize).toEqual({ width: 22.5, height: 30 });
    expect(mapPdfImageCorner(matrices[1], imageCorners.topLeft)).toEqual([0, 0]);
    expect(mapPdfImageCorner(matrices[1], imageCorners.topRight)).toEqual([0, counterclockwiseSize.height]);
    expect(mapPdfImageCorner(matrices[1], imageCorners.bottomLeft)).toEqual([counterclockwiseSize.width, 0]);
    expect(mapPdfImageCorner(matrices[1], imageCorners.bottomRight)).toEqual([counterclockwiseSize.width, counterclockwiseSize.height]);
  });

  it('stops between pages with an AbortError and does not read another page', async () => {
    const { ebook, pages } = ebookWithPages();
    const controller = new AbortController();
    const progress = vi.fn(() => controller.abort());
    const readPage = vi.spyOn(db.pages, 'get').mockImplementation(((id: string) => Promise.resolve(pages.get(id))) as never);

    await expect(createPdf(ebook, { signal: controller.signal, onProgress: progress })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(readPage.mock.calls.map(([id]) => id)).toEqual(['second']);
  });

  it('rejects an empty ebook instead of creating an invalid PDF', async () => {
    const ebook: EbookRecord = { id: 'empty', title: 'Empty', createdAt: 1, updatedAt: 1, pageIds: [] };

    await expect(createPdf(ebook)).rejects.toThrow('This ebook has no pages to export.');
  });

  it('keeps a cancelled export from mutating the ebook or its pages', async () => {
    const { ebook, pages } = ebookWithPages();
    const beforeEbook = structuredClone(ebook);
    const beforePages = [...pages.values()].map(({ imageBlob, thumbnailBlob, ...page }) => page);
    const controller = new AbortController();
    vi.spyOn(db.pages, 'get').mockImplementation(((id: string) => Promise.resolve(pages.get(id))) as never);

    await expect(createPdf(ebook, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(ebook).toEqual(beforeEbook);
    expect([...pages.values()].map(({ imageBlob, thumbnailBlob, ...page }) => page)).toEqual(beforePages);
  });

  it('builds 100 pages through sequential reads while retaining JPEG Blob parts without monolithic copies', async () => {
    const RealBlob = Blob;
    const imageBlobs = Array.from({ length: 100 }, (_, index) => jpeg(`page-${index + 1}`));
    const ebook: EbookRecord = {
      id: 'stress', title: 'Stress', createdAt: 1, updatedAt: 1,
      pageIds: imageBlobs.map((_, index) => `page-${index + 1}`),
    };
    const pages = new Map(ebook.pageIds.map((id, index) => [id, {
      id,
      ebookId: ebook.id,
      imageBlob: imageBlobs[index],
      thumbnailBlob: imageBlobs[index],
      width: 1600,
      height: 1200,
      rotation: (index % 4 * 90) as PageRecord['rotation'],
      capturedAt: index,
    } satisfies PageRecord]));
    let inFlight = 0;
    let maxInFlight = 0;
    const readPage = vi.spyOn(db.pages, 'get').mockImplementation((async (id: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      const page = pages.get(id);
      inFlight -= 1;
      return page;
    }) as never);
    const arrayBuffer = vi.spyOn(RealBlob.prototype, 'arrayBuffer');
    let finalParts: BlobPart[] = [];
    class InspectingBlob extends RealBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        finalParts = parts ?? [];
      }
    }
    vi.stubGlobal('Blob', InspectingBlob);

    const result = await createPdf(ebook);

    expect(result.type).toBe('application/pdf');
    expect(result.size).toBeGreaterThan(imageBlobs.reduce((size, blob) => size + blob.size, 0));
    expect(readPage.mock.calls.map(([id]) => id)).toEqual(ebook.pageIds);
    expect(maxInFlight).toBe(1);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(imageBlobs.every((image) => finalParts.includes(image))).toBe(true);
    expect(finalParts.some((part) => part instanceof ArrayBuffer)).toBe(false);
  });
});
