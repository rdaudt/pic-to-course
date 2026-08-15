import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as database from '../db/database';
import { appendPage, createEbook, db, reorderPages } from '../db/database';
import { EditorScreen } from './EditorScreen';

const asset = (label: string) => ({
  imageBlob: new Blob([`full ${label}`], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob([`thumbnail ${label}`], { type: 'image/jpeg' }),
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

async function seededEditor() {
  const ebook = await createEbook('Field Notes');
  const first = await appendPage(ebook.id, asset('first'));
  const second = await appendPage(ebook.id, asset('second'));
  return { ebook, first, second };
}

describe('EditorScreen', () => {
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
      createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`),
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

  it('renders thumbnails in exactly the ebook pageIds order and labels the first page as cover', async () => {
    const { ebook, first, second } = await seededEditor();
    await reorderPages(ebook.id, [second.id, first.id]);
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;
    createObjectURL
      .mockReturnValueOnce('blob:second-page')
      .mockReturnValueOnce('blob:first-page');

    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    const thumbnails = await screen.findAllByRole('img');
    expect(thumbnails.map((thumbnail) => thumbnail.getAttribute('alt'))).toEqual([
      'Thumbnail for page 1',
      'Thumbnail for page 2',
    ]);
    expect(thumbnails.map((thumbnail) => thumbnail.getAttribute('src'))).toEqual([
      'blob:second-page',
      'blob:first-page',
    ]);
    expect(screen.getByText('Cover')).toBeVisible();
  });

  it('only reorders through the labelled keyboard drag handle and persists the result', async () => {
    const { ebook, first, second } = await seededEditor();
    const user = userEvent.setup();
    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    await screen.findByRole('img', { name: 'Thumbnail for page 1' });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const page = this.closest('article');
      const pageIndex = page ? [...document.querySelectorAll('article')].indexOf(page) : 0;
      return new DOMRect(0, pageIndex * 200, 300, 150);
    });
    await user.click(screen.getByRole('img', { name: 'Thumbnail for page 1' }));
    expect((await db.ebooks.get(ebook.id))?.pageIds).toEqual([first.id, second.id]);

    const firstHandle = screen.getByRole('button', { name: 'Reorder page 1' });
    firstHandle.focus();
    await user.keyboard('[Space][ArrowDown][Space]');

    await waitFor(async () =>
      expect((await db.ebooks.get(ebook.id))?.pageIds).toEqual([second.id, first.id]),
    );
  });

  it('rotates the page by 90 degrees, reflects its orientation, and persists it', async () => {
    const { ebook, first } = await seededEditor();
    const user = userEvent.setup();
    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Rotate page 1' }));

    await waitFor(async () => expect((await db.pages.get(first.id))?.rotation).toBe(90));
    expect(screen.getByRole('img', { name: 'Thumbnail for page 1' })).toHaveStyle({
      transform: 'rotate(90deg) scale(0.75)',
    });
  });

  it('deletes a page only after confirmation and restores focus to Capture when the trigger disappears', async () => {
    const { ebook, first } = await seededEditor();
    const user = userEvent.setup();
    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Delete page 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete page' });
    expect(showModal).toHaveBeenCalledWith();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await db.pages.get(first.id)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Delete page 1' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete page' })).getByRole('button', { name: 'Delete page' }));

    await waitFor(async () => expect(await db.pages.get(first.id)).toBeUndefined());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture a photo' })).toHaveFocus());
  });

  it('announces saving and disables Close while an awaited mutation is in progress', async () => {
    const { ebook } = await seededEditor();
    let resolveRotation: () => void = () => undefined;
    vi.spyOn(database, 'rotatePage').mockImplementationOnce(
      () => new Promise((resolve) => { resolveRotation = () => resolve(undefined as never); }),
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EditorScreen ebookId={ebook.id} onClose={onClose} onCapture={vi.fn()} onExport={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Rotate page 1' }));
    expect(screen.getByText('Saving…')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();

    resolveRotation();
    await screen.findByText('Saved');
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
  });

  it('keeps a confirmed deletion dialog open when Escape is pressed during its save', async () => {
    const { ebook } = await seededEditor();
    let resolveDeletion: () => void = () => undefined;
    vi.spyOn(database, 'deletePage').mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveDeletion = resolve; }),
    );
    const user = userEvent.setup();
    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Delete page 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete page' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete page' }));
    await screen.findByText('Saving…');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));

    expect(screen.getByRole('dialog', { name: 'Delete page' })).toBeVisible();
    resolveDeletion();
    await screen.findByText('Saved');
  });

  it('navigates to capture and PDF creation', async () => {
    const ebook = await createEbook('Navigation');
    const onCapture = vi.fn();
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={onCapture} onExport={onExport} />);

    await user.click(await screen.findByRole('button', { name: 'Capture a photo' }));
    await user.click(screen.getByRole('button', { name: 'Create PDF' }));

    expect(onCapture).toHaveBeenCalledWith();
    expect(onExport).toHaveBeenCalledWith();
  });

  it('focuses its heading on forward navigation and the export action on intentional return', async () => {
    const ebook = await createEbook('Focus route');
    const firstRender = render(
      <EditorScreen
        ebookId={ebook.id}
        onClose={vi.fn()}
        onCapture={vi.fn()}
        onExport={vi.fn()}
        initialFocus="heading"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Focus route' })).toHaveFocus();
    firstRender.unmount();

    render(
      <EditorScreen
        ebookId={ebook.id}
        onClose={vi.fn()}
        onCapture={vi.fn()}
        onExport={vi.fn()}
        initialFocus="export"
      />,
    );
    await screen.findByRole('heading', { name: 'Focus route' });
    expect(screen.getByRole('button', { name: 'Create PDF' })).toHaveFocus();
  });

  it('revokes thumbnail URLs when the screen closes while thumbnails are loading', async () => {
    const { ebook, first } = await seededEditor();
    let resolvePage: (value: typeof first) => void = () => undefined;
    const delayedPage = new Promise<typeof first>((resolve) => { resolvePage = resolve; });
    vi.spyOn(db.pages, 'get').mockResolvedValueOnce(delayedPage as never);

    const { unmount } = render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);
    await waitFor(() => expect(db.pages.get).toHaveBeenCalledWith(first.id));
    unmount();
    resolvePage(first);

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${first.thumbnailBlob.size}`));
  });

  it('revokes thumbnails already created when another page fails to load', async () => {
    const { ebook, first } = await seededEditor();
    vi.spyOn(db.pages, 'get')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(undefined);

    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    await screen.findByRole('alert');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${first.thumbnailBlob.size}`));
  });

  it('revokes a delayed thumbnail when another page fails first', async () => {
    const { ebook, second } = await seededEditor();
    let resolvePage: (value: typeof second) => void = () => undefined;
    const delayedPage = new Promise<typeof second>((resolve) => { resolvePage = resolve; });
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;
    createObjectURL.mockReturnValue('blob:delayed-page');
    vi.spyOn(db.pages, 'get')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(delayedPage as never);

    render(<EditorScreen ebookId={ebook.id} onClose={vi.fn()} onCapture={vi.fn()} onExport={vi.fn()} />);

    await screen.findByRole('alert');
    resolvePage(second);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:delayed-page'));
  });
});
