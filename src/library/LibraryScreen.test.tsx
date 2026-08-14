import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendPage, createEbook, db } from '../db/database';
import { LibraryScreen } from './LibraryScreen';

const asset = () => ({
  imageBlob: new Blob(['full image'], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob(['thumbnail'], { type: 'image/jpeg' }),
  width: 1200,
  height: 900,
});

describe('LibraryScreen', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:cover'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a trimmed title before creating and opening an ebook', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<LibraryScreen onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: 'New ebook' }));
    const dialog = screen.getByRole('dialog', { name: 'Create ebook' });
    await user.type(within(dialog).getByLabelText('Title'), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Create ebook' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter an ebook title.');
    expect(onOpen).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), '  Field Notes  ');
    await user.click(within(dialog).getByRole('button', { name: 'Create ebook' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    const [ebookId] = onOpen.mock.calls[0];
    expect(await db.ebooks.get(ebookId)).toMatchObject({ title: 'Field Notes' });
  });

  it('shows newest ebooks first with first-page cover, page count, and edit date', async () => {
    const first = await createEbook('Older');
    await appendPage(first.id, asset());
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createEbook('Newer');

    render(<LibraryScreen onOpen={vi.fn()} />);

    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Newer',
      'Older',
    ]);
    expect(within(cards[0]).getByText('0 pages')).toBeVisible();
    expect(within(cards[0]).getByText(/Last edited /)).toBeVisible();
    expect(within(cards[1]).getByRole('img', { name: 'Cover for Older' })).toHaveAttribute(
      'src',
      'blob:cover',
    );
    expect(within(cards[1]).getByText('1 page')).toBeVisible();
  });

  it('revokes a cover URL when the screen closes while that cover is loading', async () => {
    const ebook = await createEbook('Closing');
    const page = await appendPage(ebook.id, asset());
    let resolvePage: (value: typeof page) => void = () => undefined;
    const delayedPage = new Promise<typeof page>((resolve) => {
      resolvePage = resolve;
    });
    vi.spyOn(db.pages, 'get').mockResolvedValueOnce(delayedPage as never);

    const { unmount } = render(<LibraryScreen onOpen={vi.fn()} />);
    await waitFor(() => expect(db.pages.get).toHaveBeenCalledWith(page.id));
    unmount();
    resolvePage(page);

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover'));
  });

  it('opens and renames an ebook with a valid trimmed title', async () => {
    const ebook = await createEbook('Original');
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<LibraryScreen onOpen={onOpen} />);

    await user.click(await screen.findByRole('button', { name: 'Open Original' }));
    expect(onOpen).toHaveBeenCalledWith(ebook.id);

    await user.click(screen.getByRole('button', { name: 'Rename Original' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename ebook' });
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), '  Renamed  ');
    await user.click(within(dialog).getByRole('button', { name: 'Rename ebook' }));

    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeVisible();
    expect(await db.ebooks.get(ebook.id)).toMatchObject({ title: 'Renamed' });
  });

  it('only deletes an ebook after explicit confirmation and supports cancel', async () => {
    const ebook = await createEbook('Keep me');
    const user = userEvent.setup();
    render(<LibraryScreen onOpen={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Delete Keep me' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete ebook' });
    expect(within(dialog).getByText(/permanently delete/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(await db.ebooks.get(ebook.id)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Delete Keep me' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete ebook' })).getByRole('button', {
        name: 'Delete ebook',
      }),
    );

    await waitFor(async () => expect(await db.ebooks.get(ebook.id)).toBeUndefined());
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Keep me' })).not.toBeInTheDocument(),
    );
  });

  it('warns that clearing website data permanently erases editable ebooks', async () => {
    render(<LibraryScreen onOpen={vi.fn()} />);

    expect(
      await screen.findByText(
        /clearing Safari or PWA website data permanently erases your editable ebooks/i,
      ),
    ).toBeVisible();
  });
});
