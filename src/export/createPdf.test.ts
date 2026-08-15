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
  afterEach(() => vi.restoreAllMocks());

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
  });

  it('swaps natural page dimensions for quarter-turn rotations', async () => {
    const { ebook, pages } = ebookWithPages();
    pages.set('first', { ...pages.get('first')!, rotation: 90 });
    pages.set('second', { ...pages.get('second')!, rotation: 270 });
    vi.spyOn(db.pages, 'get').mockImplementation(((id: string) => Promise.resolve(pages.get(id))) as never);

    const blob = await createPdf(ebook);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());

    expect(pdf.getPages().map((page) => page.getSize())).toEqual([
      { width: 720, height: 480 },
      { width: 360, height: 720 },
    ]);
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
});
