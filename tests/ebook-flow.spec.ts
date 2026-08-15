import { expect, test } from '@playwright/test';

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

  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect(page.getByRole('heading', { name: 'Weekend field notes' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Thumbnail for page 3' })).toBeVisible();

  const firstHandle = page.getByRole('button', { name: 'Reorder page 1' });
  await firstHandle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Rotate page 1' }).click();
  await expect(page.getByRole('img', { name: 'Thumbnail for page 1' })).toHaveCSS('transform', /matrix/);
  await page.getByRole('button', { name: 'Delete page 3' }).click();
  await page.getByRole('dialog', { name: 'Delete page' }).getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByText('2 pages')).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Open Weekend field notes' }).click();
  await expect(page.getByText('2 pages')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Weekend field notes' }).click();
  await expect(page.getByText('2 pages')).toBeVisible();
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
