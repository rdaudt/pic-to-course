import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendPage, createEbook, db } from '../db/database';
import { createPdf } from './createPdf';
import { ExportScreen, sanitizePdfFilename } from './ExportScreen';

vi.mock('./createPdf', () => ({
  createPdf: vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })),
}));

const jpeg = new Blob([Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AR//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
), (character) => character.charCodeAt(0))], { type: 'image/jpeg' });

async function seededEbook(title = 'Field Notes') {
  const ebook = await createEbook(title);
  await appendPage(ebook.id, { imageBlob: jpeg, thumbnailBlob: jpeg, width: 1, height: 1 });
  return ebook;
}

describe('ExportScreen', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.mocked(createPdf).mockReset().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares an exported PDF only when the browser supports file sharing', async () => {
    const ebook = await seededEbook();
    const canShare = vi.fn(() => true);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    const user = userEvent.setup();

    render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));

    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(canShare).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('focuses the screen heading when entered from the editor', () => {
    render(<ExportScreen ebookId="ebook-1" onClose={vi.fn()} initialFocus />);

    expect(screen.getByRole('heading', { name: 'Create PDF' })).toHaveFocus();
  });

  it('shows a persistent download link without clicking or revoking it when file sharing is unavailable', async () => {
    const ebook = await seededEbook();
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => false) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();

    const { unmount } = render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));

    const link = await screen.findByRole('link', { name: 'Download PDF' });
    expect(link).toHaveAttribute('href', 'blob:pdf');
    expect(link).toHaveAttribute('download', 'Field Notes.pdf');
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf');
  });

  it('offers a persistent download link after native sharing fails', async () => {
    const ebook = await seededEbook();
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new Error('Share failed')) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDF is ready, but sharing did not finish. Try again.');
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', 'blob:pdf');
    expect(click).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the previous fallback only when a replacement PDF is ready, then revokes the current URL on unmount', async () => {
    const ebook = await seededEbook();
    const firstPdf = new Blob(['first'], { type: 'application/pdf' });
    const secondPdf = new Blob(['second'], { type: 'application/pdf' });
    vi.mocked(createPdf).mockResolvedValueOnce(firstPdf).mockResolvedValueOnce(secondPdf);
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:first-pdf')
      .mockReturnValueOnce('blob:second-pdf');
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => false) });
    const user = userEvent.setup();
    const { unmount } = render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', 'blob:first-pdf');
    await user.click(screen.getByRole('button', { name: 'Create another PDF' }));

    await waitFor(() => expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', 'blob:second-pdf'));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first-pdf');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:second-pdf');
  });

  it('blocks an empty ebook with a helpful message', async () => {
    const ebook = await createEbook('Empty');
    const user = userEvent.setup();
    render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one page before creating a PDF.');
  });

  it('starts the busy state before loading the ebook to prevent concurrent exports', async () => {
    const ebook = await seededEbook();
    const storedEbook = (await db.ebooks.get(ebook.id))!;
    let resolveEbook: (value: typeof storedEbook) => void = () => undefined;
    const pendingEbook = new Promise<typeof storedEbook>((resolve) => { resolveEbook = resolve; });
    vi.spyOn(db.ebooks, 'get').mockImplementationOnce(() => pendingEbook as never);
    const user = userEvent.setup();
    render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Create PDF' }));

    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeDisabled();
    resolveEbook(storedEbook);
    await waitFor(() => expect(createPdf).toHaveBeenCalled());
  });

  it('clears stale sharing feedback and blocks a second retry while native sharing is pending', async () => {
    const ebook = await seededEbook();
    let finishShare: () => void = () => undefined;
    const pendingShare = new Promise<void>((resolve) => { finishShare = resolve; });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(pendingShare),
    });
    const user = userEvent.setup();
    render(<ExportScreen ebookId={ebook.id} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));
    await screen.findByRole('status', { name: '' });
    await user.click(screen.getByRole('button', { name: 'Retry sharing' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry sharing' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel PDF creation' })).not.toBeInTheDocument();

    finishShare();
    await screen.findByRole('status', { name: '' });
  });

  it('disables Back during native sharing and ignores share completion after unmount', async () => {
    const ebook = await seededEbook();
    let finishShare: () => void = () => undefined;
    const pendingShare = new Promise<void>((resolve) => { finishShare = resolve; });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn(() => pendingShare) });
    const onClose = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { unmount } = render(<ExportScreen ebookId={ebook.id} onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));
    await screen.findByText('Sharing PDF…');
    expect(screen.getByRole('button', { name: 'Back to ebook editor' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Back to ebook editor' }));
    expect(onClose).not.toHaveBeenCalled();

    unmount();
    finishShare();
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('sanitizes a user title for the shared file name', () => {
    expect(sanitizePdfFilename(' Notes: / first draft? ')).toBe('Notes_ _ first draft_.pdf');
    expect(sanitizePdfFilename('...')).toBe('ebook.pdf');
  });
});
