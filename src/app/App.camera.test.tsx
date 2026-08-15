import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('../library/LibraryScreen', () => ({
  LibraryScreen: ({ onOpen }: { onOpen: (ebookId: string) => void }) => (
    <button type="button" onClick={() => onOpen('ebook-1')}>Open mock ebook</button>
  ),
}));

vi.mock('../editor/EditorScreen', () => ({
  EditorScreen: ({ onCapture }: { onCapture: () => void }) => (
    <button type="button" onClick={onCapture}>Open camera</button>
  ),
}));

vi.mock('../camera/CameraScreen', () => ({
  CameraScreen: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>Close mock camera</button>
  ),
}));

it('opens the camera from the editor and returns to that editor on close', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Open mock ebook' }));
  await user.click(screen.getByRole('button', { name: 'Open camera' }));
  expect(screen.getByRole('button', { name: 'Close mock camera' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Close mock camera' }));
  expect(screen.getByRole('button', { name: 'Open camera' })).toBeVisible();
});
