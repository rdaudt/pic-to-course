import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendPage, createEbook, db } from '../db/database';
import * as storageHealth from '../storage/storageHealth';
import { LibraryScreen } from './LibraryScreen';

const asset = () => ({
  imageBlob: new Blob(['full image'], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob(['thumbnail'], { type: 'image/jpeg' }),
  width: 1200,
  height: 900,
});

const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
const closeModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = false;
});
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalCloseModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

describe('LibraryScreen', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: closeModal,
    });
  });

  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:cover'),
      revokeObjectURL: vi.fn(),
    });
    showModal.mockClear();
    closeModal.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    if (originalShowModal) {
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    }
    if (originalCloseModal) {
      Object.defineProperty(HTMLDialogElement.prototype, 'close', originalCloseModal);
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
    }
  });

  it('opens a native modal, focuses its field, dismisses on Escape, and returns focus', async () => {
    const user = userEvent.setup();
    render(<LibraryScreen onOpen={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'New ebook' });

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Create ebook' });
    expect(showModal).toHaveBeenCalledWith();
    expect(within(dialog).getByLabelText('Title')).toHaveFocus();

    fireEvent(dialog, new Event('cancel', { cancelable: true }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create ebook' })).toBeNull());
    expect(trigger).toHaveFocus();
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

  it('requests persistent storage only after the user confirms ebook creation', async () => {
    const requestPersistence = vi.spyOn(storageHealth, 'requestPersistentStorage').mockResolvedValue(true);
    const user = userEvent.setup();
    render(<LibraryScreen onOpen={vi.fn()} />);

    expect(requestPersistence).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'New ebook' }));
    expect(requestPersistence).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Create ebook' });
    await user.type(within(dialog).getByLabelText('Title'), 'Persistent book');
    await user.click(within(dialog).getByRole('button', { name: 'Create ebook' }));

    await waitFor(() => expect(requestPersistence).toHaveBeenCalledOnce());
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

  it('shows the first page cover with its saved rotation fitted inside the card', async () => {
    const ebook = await createEbook('Rotated cover');
    const page = await appendPage(ebook.id, asset());
    await db.pages.update(page.id, { rotation: 270 });

    render(<LibraryScreen onOpen={vi.fn()} />);

    const cover = await screen.findByRole('img', { name: 'Cover for Rotated cover' });
    expect(cover).toHaveStyle({
      width: '75%',
      height: '75%',
      transform: 'rotate(270deg)',
    });
    expect(cover.parentElement).toHaveClass('ebook-cover-viewport');
  });

  it('uses stored cover dimensions to fill the viewport after a portrait quarter turn', async () => {
    const ebook = await createEbook('Portrait cover');
    const page = await appendPage(ebook.id, { ...asset(), width: 900, height: 1200 });
    await db.pages.update(page.id, { rotation: 90 });

    render(<LibraryScreen onOpen={vi.fn()} />);

    expect(await screen.findByRole('img', { name: 'Cover for Portrait cover' })).toHaveStyle({
      width: '75%',
      height: '133.333333%',
      transform: 'rotate(90deg)',
    });
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

  it('keeps the current cover URL until a refreshed cover is ready', async () => {
    const ebook = await createEbook('Refreshing');
    const page = await appendPage(ebook.id, asset());
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;
    let coverNumber = 0;
    createObjectURL.mockImplementation(() => `blob:cover-${++coverNumber}`);

    let resolveRefreshedPage: (value: typeof page) => void = () => undefined;
    const refreshedPage = new Promise<typeof page>((resolve) => {
      resolveRefreshedPage = resolve;
    });
    vi.spyOn(db.pages, 'get')
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(refreshedPage as never);

    const user = userEvent.setup();
    render(<LibraryScreen onOpen={vi.fn()} />);
    expect((await screen.findByRole('img', { name: 'Cover for Refreshing' })).getAttribute('src')).toBe(
      'blob:cover-1',
    );

    await user.click(screen.getByRole('button', { name: 'Rename Refreshing' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename ebook' });
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), 'Refreshed');
    await user.click(within(dialog).getByRole('button', { name: 'Rename ebook' }));
    await waitFor(() => expect(db.pages.get).toHaveBeenCalledTimes(2));

    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:cover-1');
    resolveRefreshedPage(page);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Cover for Refreshed' })).toHaveAttribute('src', 'blob:cover-2'));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover-1'));
  });

  it('revokes covers resolved by an abandoned partial library load', async () => {
    const older = await createEbook('Older cover');
    const olderPage = await appendPage(older.id, asset());
    await new Promise((resolve) => setTimeout(resolve, 2));
    const newer = await createEbook('Newer cover');
    const newerPage = await appendPage(newer.id, asset());
    let resolveOlderPage: (value: typeof olderPage) => void = () => undefined;
    const delayedOlderPage = new Promise<typeof olderPage>((resolve) => {
      resolveOlderPage = resolve;
    });
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;
    createObjectURL.mockImplementation((blob: Blob) =>
      blob === newerPage.thumbnailBlob ? 'blob:newer-cover' : 'blob:older-cover',
    );
    vi.spyOn(db.pages, 'get')
      .mockResolvedValueOnce(newerPage)
      .mockResolvedValueOnce(delayedOlderPage as never);

    const { unmount } = render(<LibraryScreen onOpen={vi.fn()} />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledWith(newerPage.thumbnailBlob));
    unmount();
    resolveOlderPage(olderPage);

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:newer-cover'));
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

  it('restores route focus to the ebook that was intentionally closed', async () => {
    const ebook = await createEbook('Return here');

    render(<LibraryScreen onOpen={vi.fn()} initialFocusEbookId={ebook.id} />);

    expect(await screen.findByRole('button', { name: 'Open Return here' })).toHaveFocus();
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

  it('returns focus to New ebook after confirmed deletion removes its trigger', async () => {
    await createEbook('Remove me');
    const user = userEvent.setup();
    render(<LibraryScreen onOpen={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Delete Remove me' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete ebook' })).getByRole('button', {
        name: 'Delete ebook',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Remove me' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'New ebook' })).toHaveFocus();
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
