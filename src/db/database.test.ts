import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendPage,
  createEbook,
  db,
  deleteEbook,
  deletePage,
  listEbooks,
  renameEbook,
  reorderPages,
  rotatePage,
} from './database';

const asset = () => ({
  imageBlob: new Blob(['full image'], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob(['thumbnail'], { type: 'image/jpeg' }),
  width: 1200,
  height: 900,
});

describe('local ebook database', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('rejects a blank ebook title', async () => {
    await expect(createEbook('   ')).rejects.toThrow('Title is required');
  });

  it('trims titles and lists ebooks newest first', async () => {
    const first = await createEbook(' First ');
    await new Promise((resolve) => setTimeout(resolve, 1));
    const second = await createEbook('Second');

    await renameEbook(first.id, ' Renamed ');

    expect(await listEbooks()).toEqual([
      expect.objectContaining({ id: first.id, title: 'Renamed' }),
      expect.objectContaining({ id: second.id, title: 'Second' }),
    ]);
  });

  it('atomically appends a page and records it at the ebook end', async () => {
    const book = await createEbook('Field Notes');
    const page = await appendPage(book.id, asset());

    expect((await db.ebooks.get(book.id))?.pageIds).toEqual([page.id]);
    expect(await db.pages.get(page.id)).toMatchObject({
      ebookId: book.id,
      rotation: 0,
      width: 1200,
      height: 900,
    });
  });

  it('rejects an append to a missing ebook without storing a page', async () => {
    await expect(appendPage('missing', asset())).rejects.toThrow('Ebook not found');

    expect(await db.pages.count()).toBe(0);
  });

  it('rejects reordered page IDs that are missing or foreign', async () => {
    const firstBook = await createEbook('First');
    const secondBook = await createEbook('Second');
    const firstPage = await appendPage(firstBook.id, asset());
    const secondPage = await appendPage(firstBook.id, asset());
    const foreignPage = await appendPage(secondBook.id, asset());

    await expect(reorderPages(firstBook.id, [firstPage.id])).rejects.toThrow(
      'Page IDs must exactly match the ebook pages',
    );
    await expect(reorderPages(firstBook.id, [secondPage.id, foreignPage.id])).rejects.toThrow(
      'Page IDs must exactly match the ebook pages',
    );

    expect((await db.ebooks.get(firstBook.id))?.pageIds).toEqual([
      firstPage.id,
      secondPage.id,
    ]);
  });

  it('persists a valid page reordering', async () => {
    const book = await createEbook('Ordering');
    const firstPage = await appendPage(book.id, asset());
    const secondPage = await appendPage(book.id, asset());

    await reorderPages(book.id, [secondPage.id, firstPage.id]);

    expect((await db.ebooks.get(book.id))?.pageIds).toEqual([
      secondPage.id,
      firstPage.id,
    ]);
  });

  it('cycles a page rotation through quarter turns', async () => {
    const book = await createEbook('Rotation');
    const page = await appendPage(book.id, asset());

    await rotatePage(book.id, page.id);
    expect((await db.pages.get(page.id))?.rotation).toBe(90);
    await rotatePage(book.id, page.id);
    expect((await db.pages.get(page.id))?.rotation).toBe(180);
    await rotatePage(book.id, page.id);
    expect((await db.pages.get(page.id))?.rotation).toBe(270);
    await rotatePage(book.id, page.id);
    expect((await db.pages.get(page.id))?.rotation).toBe(0);
  });

  it('deletes a page blob record and its ebook ID', async () => {
    const book = await createEbook('Delete page');
    const page = await appendPage(book.id, asset());

    await deletePage(book.id, page.id);

    expect(await db.pages.get(page.id)).toBeUndefined();
    expect((await db.ebooks.get(book.id))?.pageIds).toEqual([]);
  });

  it('deletes an ebook and only its owned pages', async () => {
    const firstBook = await createEbook('First');
    const secondBook = await createEbook('Second');
    const ownedPage = await appendPage(firstBook.id, asset());
    const retainedPage = await appendPage(secondBook.id, asset());

    await deleteEbook(firstBook.id);

    expect(await db.ebooks.get(firstBook.id)).toBeUndefined();
    expect(await db.pages.get(ownedPage.id)).toBeUndefined();
    expect(await db.pages.get(retainedPage.id)).toBeDefined();
  });
});
