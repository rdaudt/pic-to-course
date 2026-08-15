import { expect, test, type Page } from '@playwright/test';

type PersistedTestPage = {
  identity: string;
  rotation: number;
};

async function persistedTestPages(page: Page): Promise<PersistedTestPage[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('photo-ebook');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['ebooks', 'pages'], 'readonly');
    const ebooks = transaction.objectStore('ebooks');
    const pages = transaction.objectStore('pages');
    const ebook = await new Promise<{ pageIds: string[] }>((resolve, reject) => {
      const request = ebooks.getAll();
      request.onsuccess = () => resolve(request.result[0]);
      request.onerror = () => reject(request.error);
    });

    return Promise.all(ebook.pageIds.map(async (pageId) => {
      const record = await new Promise<{ rotation: number; thumbnailBlob: Blob }>((resolve, reject) => {
        const request = pages.get(pageId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const identity = /<title>(Test page \d+)<\/title>/.exec(await record.thumbnailBlob.text())?.[1];
      if (!identity) throw new Error('The deterministic page metadata is missing.');
      return { identity, rotation: record.rotation };
    }));
  });
}

test('persists deterministic captured pages through close, reopen, reorder, rotation, deletion, and reload', async ({ page }) => {
  await page.goto('/pic-to-course/');
  await page.getByRole('button', { name: 'New ebook' }).click();
  await page.getByLabel('Title').fill('Weekend field notes');
  await page.getByRole('button', { name: 'Create ebook' }).click();

  await page.getByRole('button', { name: 'Capture a photo' }).click();
  await page.waitForFunction(() => Boolean(window.__PHOTO_EBOOK_TEST__));
  await page.evaluate(() => window.__PHOTO_EBOOK_TEST__!.setCaptureCount(3));
  await page.getByRole('button', { name: 'Capture photo' }).click();
  await page.getByRole('button', { name: 'Capture photo' }).click();
  await page.getByRole('button', { name: 'Capture photo' }).click();
  await expect(page.getByText('3 pages captured')).toBeVisible();
  await expect(persistedTestPages(page)).resolves.toEqual([
    { identity: 'Test page 1', rotation: 0 },
    { identity: 'Test page 2', rotation: 0 },
    { identity: 'Test page 3', rotation: 0 },
  ]);

  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect(page.getByRole('heading', { name: 'Weekend field notes' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Thumbnail for page 3' })).toBeVisible();

  const firstHandle = page.getByRole('button', { name: 'Reorder page 1' });
  const secondHandle = page.getByRole('button', { name: 'Reorder page 2' });
  const firstBox = await firstHandle.boundingBox();
  const secondBox = await secondHandle.boundingBox();
  if (!firstBox || !secondBox) throw new Error('The reorder handles were not visible.');
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2 + 12);
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => persistedTestPages(page)).toEqual([
    { identity: 'Test page 2', rotation: 0 },
    { identity: 'Test page 1', rotation: 0 },
    { identity: 'Test page 3', rotation: 0 },
  ]);
  await page.getByRole('button', { name: 'Rotate page 1' }).click();
  await expect(persistedTestPages(page)).resolves.toEqual([
    { identity: 'Test page 2', rotation: 90 },
    { identity: 'Test page 1', rotation: 0 },
    { identity: 'Test page 3', rotation: 0 },
  ]);
  await page.getByRole('button', { name: 'Delete page 3' }).click();
  await page.getByRole('dialog', { name: 'Delete page' }).getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByText('2 pages')).toBeVisible();
  await expect(persistedTestPages(page)).resolves.toEqual([
    { identity: 'Test page 2', rotation: 90 },
    { identity: 'Test page 1', rotation: 0 },
  ]);

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Open Weekend field notes' }).click();
  await expect(page.getByText('2 pages')).toBeVisible();
  await expect(persistedTestPages(page)).resolves.toEqual([
    { identity: 'Test page 2', rotation: 90 },
    { identity: 'Test page 1', rotation: 0 },
  ]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Weekend field notes' }).click();
  await expect(page.getByText('2 pages')).toBeVisible();
  await expect(persistedTestPages(page)).resolves.toEqual([
    { identity: 'Test page 2', rotation: 90 },
    { identity: 'Test page 1', rotation: 0 },
  ]);
});

test('loads the built application from its cache while offline', async ({ page, context }) => {
  await page.goto('/pic-to-course/');
  await expect(page.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
});
