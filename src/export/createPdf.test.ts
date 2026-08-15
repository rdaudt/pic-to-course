import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import type { EbookRecord, PageRecord } from '../domain/models';
import { createPdf } from './createPdf';

const jpeg = (marker: string) => new Blob([
  Uint8Array.from(atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AR//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  ), (character) => character.charCodeAt(0)), marker], { type: 'image/jpeg' });

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
    expect(output).toContain('0 720 -360 0 360 0 cm');
    expect(output).toContain('-720 0 0 -360 720 360 cm');
    expect(output).toContain('0 -720 360 0 0 720 cm');
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
