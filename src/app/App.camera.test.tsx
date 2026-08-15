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
  LibraryScreen: ({ onOpen, initialFocusEbookId }: { onOpen: (ebookId: string) => void; initialFocusEbookId?: string }) => (
    <button type="button" data-focus-ebook={initialFocusEbookId} onClick={() => onOpen('ebook-1')}>Open mock ebook</button>
  ),
}));

vi.mock('../editor/EditorScreen', () => ({
  EditorScreen: ({ onClose, onCapture, onExport, initialFocus }: {
    onClose: () => void;
    onCapture: () => void;
    onExport: () => void;
    initialFocus?: string;
  }) => <>
    <span data-testid="editor-focus">{initialFocus}</span>
    <button type="button" onClick={onClose}>Close mock editor</button>
    <button type="button" onClick={onCapture}>Open camera</button>
    <button type="button" onClick={onExport}>Open export</button>
  </>,
}));

vi.mock('../camera/CameraScreen', () => ({
  CameraScreen: ({ onClose, initialFocus }: { onClose: () => void; initialFocus?: boolean }) => <>
    <span data-testid="camera-focus">{String(initialFocus)}</span>
    <button type="button" onClick={onClose}>Close mock camera</button>
  </>,
}));

vi.mock('../export/ExportScreen', () => ({
  ExportScreen: ({ onClose, initialFocus }: { onClose: () => void; initialFocus?: boolean }) => <>
    <span data-testid="export-focus">{String(initialFocus)}</span>
    <button type="button" onClick={onClose}>Close mock export</button>
  </>,
}));

it('opens the camera from the editor and returns to that editor on close', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Open mock ebook' }));
  expect(screen.getByTestId('editor-focus')).toHaveTextContent('heading');
  await user.click(screen.getByRole('button', { name: 'Open camera' }));
  expect(screen.getByRole('button', { name: 'Close mock camera' })).toBeVisible();
  expect(screen.getByTestId('camera-focus')).toHaveTextContent('true');

  await user.click(screen.getByRole('button', { name: 'Close mock camera' }));
  expect(screen.getByRole('button', { name: 'Open camera' })).toBeVisible();
  expect(screen.getByTestId('editor-focus')).toHaveTextContent('capture');

  await user.click(screen.getByRole('button', { name: 'Open export' }));
  expect(screen.getByTestId('export-focus')).toHaveTextContent('true');
  await user.click(screen.getByRole('button', { name: 'Close mock export' }));
  expect(screen.getByTestId('editor-focus')).toHaveTextContent('export');

  await user.click(screen.getByRole('button', { name: 'Close mock editor' }));
  expect(screen.getByRole('button', { name: 'Open mock ebook' })).toHaveAttribute('data-focus-ebook', 'ebook-1');
});
