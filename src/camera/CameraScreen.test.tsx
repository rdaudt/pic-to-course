import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendPage } from '../db/database';
import { processCapturedImage } from '../image/processImage';
import { getStorageHealth } from '../storage/storageHealth';
import { captureFrame } from './captureFrame';
import { CameraScreen } from './CameraScreen';

vi.mock('../db/database', () => ({ appendPage: vi.fn() }));
vi.mock('../image/processImage', () => ({ processCapturedImage: vi.fn() }));
vi.mock('../storage/storageHealth', () => ({ getStorageHealth: vi.fn() }));
vi.mock('./captureFrame', () => ({ captureFrame: vi.fn() }));

const asset = {
  imageBlob: new Blob(['full'], { type: 'image/jpeg' }),
  thumbnailBlob: new Blob(['thumbnail'], { type: 'image/jpeg' }),
  width: 1200,
  height: 900,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mediaStream() {
  const stop = vi.fn();
  return {
    getTracks: () => [{ stop }],
    stop,
  };
}

async function makeViewfinderReady() {
  const video = await screen.findByLabelText('Camera viewfinder');
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1440 },
  });
  fireEvent.loadedMetadata(video);
}

describe('CameraScreen', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue(mediaStream());
    vi.mocked(getStorageHealth).mockReset();
    vi.mocked(getStorageHealth).mockResolvedValue({ level: 'ok' });
    vi.mocked(captureFrame).mockReset();
    vi.mocked(captureFrame).mockResolvedValue(new Blob(['source'], { type: 'image/jpeg' }));
    vi.mocked(processCapturedImage).mockReset();
    vi.mocked(processCapturedImage).mockResolvedValue(asset);
    vi.mocked(appendPage).mockReset();
    vi.mocked(appendPage).mockResolvedValue({ id: 'page-1' } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests the rear camera with the iPad capture profile', async () => {
    render(<CameraScreen ebookId="ebook-1" onClose={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    }));
    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
    await makeViewfinderReady();
    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
    expect(screen.getByText('0 pages captured')).toBeVisible();
  });

  it('gives iPad Settings guidance when camera permission is denied', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    render(<CameraScreen ebookId="ebook-1" onClose={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allow Camera in iPad Settings',
    );
    expect(screen.getByRole('button', { name: 'Try camera again' })).toBeEnabled();
  });

  it('disables capture through frame processing and persistence, then increments only after append resolves', async () => {
    const saved = deferred<never>();
    const source = new Blob(['source'], { type: 'image/jpeg' });
    vi.mocked(captureFrame).mockResolvedValueOnce(source);
    vi.mocked(appendPage).mockReturnValueOnce(saved.promise);
    const user = userEvent.setup();
    render(<CameraScreen ebookId="ebook-1" onClose={vi.fn()} />);
    await makeViewfinderReady();

    await user.click(await screen.findByRole('button', { name: 'Capture photo' }));

    await screen.findByText('Saving page…');
    expect(screen.getByRole('button', { name: 'Saving page…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close camera' })).toBeDisabled();
    expect(screen.getByText('0 pages captured')).toBeVisible();
    expect(processCapturedImage).toHaveBeenCalledWith(source);
    expect(appendPage).toHaveBeenCalledWith('ebook-1', asset);

    saved.resolve(undefined as never);
    expect(await screen.findByText('1 page captured')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  it('blocks capture at critical storage but keeps a warning visible and capture available', async () => {
    vi.mocked(getStorageHealth).mockResolvedValueOnce({ level: 'critical', free: 10 });
    vi.mocked(getStorageHealth).mockResolvedValueOnce({ level: 'warning', free: 100 });
    const user = userEvent.setup();
    render(<CameraScreen ebookId="ebook-1" onClose={vi.fn()} />);
    await makeViewfinderReady();

    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough space');
    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Check storage again' }));

    expect(await screen.findByText(/Storage is running low/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  it('offers retry after processing fails without creating a page', async () => {
    vi.mocked(processCapturedImage)
      .mockRejectedValueOnce(new Error('encode failed'))
      .mockResolvedValueOnce(asset);
    const user = userEvent.setup();
    render(<CameraScreen ebookId="ebook-1" onClose={vi.fn()} />);
    await makeViewfinderReady();

    await user.click(await screen.findByRole('button', { name: 'Capture photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be processed or saved');
    expect(appendPage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Capture photo' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Capture photo' }));
    await screen.findByText('1 page captured');
    expect(appendPage).toHaveBeenCalledTimes(1);
  });

  it('stops every camera track when unmounted', async () => {
    const stream = mediaStream();
    getUserMedia.mockResolvedValueOnce(stream);
    const { unmount } = render(<CameraScreen ebookId="ebook-1" onClose={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();

    expect(stream.stop).toHaveBeenCalledOnce();
  });

  it('does not close while a page is saving', async () => {
    const saved = deferred<never>();
    vi.mocked(appendPage).mockReturnValueOnce(saved.promise);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CameraScreen ebookId="ebook-1" onClose={onClose} />);
    await makeViewfinderReady();

    await user.click(await screen.findByRole('button', { name: 'Capture photo' }));
    await screen.findByText('Saving page…');
    fireEvent.click(screen.getByRole('button', { name: 'Close camera' }));
    expect(onClose).not.toHaveBeenCalled();

    saved.resolve(undefined as never);
    await screen.findByText('1 page captured');
    await user.click(screen.getByRole('button', { name: 'Close camera' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
