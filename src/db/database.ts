import Dexie, { type Table } from 'dexie';
import type { EbookRecord, PageAsset, PageRecord, Rotation } from '../domain/models';

class EbookDatabase extends Dexie {
  ebooks!: Table<EbookRecord, string>;
  pages!: Table<PageRecord, string>;

  constructor() {
    super('photo-ebook');

    this.version(1).stores({
      ebooks: '&id, updatedAt',
      pages: '&id, ebookId, capturedAt',
    });
  }
}

export const db = new EbookDatabase();

function normalizedTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) {
    throw new Error('Title is required');
  }

  return normalized;
}

async function requiredEbook(ebookId: string): Promise<EbookRecord> {
  const ebook = await db.ebooks.get(ebookId);
  if (!ebook) {
    throw new Error('Ebook not found');
  }

  return ebook;
}

async function requiredOwnedPage(ebookId: string, pageId: string): Promise<PageRecord> {
  const page = await db.pages.get(pageId);
  if (!page || page.ebookId !== ebookId) {
    throw new Error('Page not found');
  }

  return page;
}

export async function createEbook(title: string): Promise<EbookRecord> {
  const normalized = normalizedTitle(title);
  const createdAt = Date.now();
  const ebook: EbookRecord = {
    id: crypto.randomUUID(),
    title: normalized,
    createdAt,
    updatedAt: createdAt,
    pageIds: [],
  };

  await db.transaction('rw', db.ebooks, async () => {
    await db.ebooks.add(ebook);
  });

  return ebook;
}

export async function listEbooks(): Promise<EbookRecord[]> {
  return db.ebooks.orderBy('updatedAt').reverse().toArray();
}

export async function renameEbook(ebookId: string, title: string): Promise<EbookRecord> {
  const normalized = normalizedTitle(title);
  let renamed!: EbookRecord;

  await db.transaction('rw', db.ebooks, async () => {
    const ebook = await requiredEbook(ebookId);
    renamed = { ...ebook, title: normalized, updatedAt: Date.now() };
    await db.ebooks.put(renamed);
  });

  return renamed;
}

export async function appendPage(ebookId: string, asset: PageAsset): Promise<PageRecord> {
  let page!: PageRecord;

  await db.transaction('rw', db.ebooks, db.pages, async () => {
    const ebook = await requiredEbook(ebookId);
    const capturedAt = Date.now();
    page = {
      id: crypto.randomUUID(),
      ebookId,
      ...asset,
      rotation: 0,
      capturedAt,
    };

    await db.pages.add(page);
    await db.ebooks.put({
      ...ebook,
      pageIds: [...ebook.pageIds, page.id],
      updatedAt: capturedAt,
    });
  });

  return page;
}

export async function reorderPages(ebookId: string, pageIds: string[]): Promise<void> {
  await db.transaction('rw', db.ebooks, db.pages, async () => {
    const ebook = await requiredEbook(ebookId);
    const knownPageIds = new Set(ebook.pageIds);
    const isExactSet =
      pageIds.length === ebook.pageIds.length &&
      new Set(pageIds).size === pageIds.length &&
      pageIds.every((pageId) => knownPageIds.has(pageId));

    if (!isExactSet) {
      throw new Error('Page IDs must exactly match the ebook pages');
    }

    const pages = await db.pages.bulkGet(pageIds);
    if (pages.some((page) => !page || page.ebookId !== ebookId)) {
      throw new Error('Page IDs must exactly match the ebook pages');
    }

    await db.ebooks.put({ ...ebook, pageIds: [...pageIds], updatedAt: Date.now() });
  });
}

export async function rotatePage(ebookId: string, pageId: string): Promise<PageRecord> {
  let rotated!: PageRecord;

  await db.transaction('rw', db.ebooks, db.pages, async () => {
    const ebook = await requiredEbook(ebookId);
    const page = await requiredOwnedPage(ebookId, pageId);
    rotated = { ...page, rotation: ((page.rotation + 90) % 360) as Rotation };

    await db.pages.put(rotated);
    await db.ebooks.put({ ...ebook, updatedAt: Date.now() });
  });

  return rotated;
}

export async function deletePage(ebookId: string, pageId: string): Promise<void> {
  await db.transaction('rw', db.ebooks, db.pages, async () => {
    const ebook = await requiredEbook(ebookId);
    await requiredOwnedPage(ebookId, pageId);

    if (!ebook.pageIds.includes(pageId)) {
      throw new Error('Page not found');
    }

    await db.pages.delete(pageId);
    await db.ebooks.put({
      ...ebook,
      pageIds: ebook.pageIds.filter((id) => id !== pageId),
      updatedAt: Date.now(),
    });
  });
}

export async function deleteEbook(ebookId: string): Promise<void> {
  await db.transaction('rw', db.ebooks, db.pages, async () => {
    await requiredEbook(ebookId);
    await db.pages.where('ebookId').equals(ebookId).delete();
    await db.ebooks.delete(ebookId);
  });
}
