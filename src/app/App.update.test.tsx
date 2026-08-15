import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from './App';

const updateServiceWorker = vi.fn().mockResolvedValue(undefined);

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [true, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

vi.mock('../library/LibraryScreen', () => ({
  LibraryScreen: ({ onOpen }: { onOpen: (ebookId: string) => void }) => (
    <button type="button" onClick={() => onOpen('ebook-1')}>Open mock ebook</button>
  ),
}));

vi.mock('../editor/EditorScreen', () => ({
  EditorScreen: () => <h1>Mock editor</h1>,
}));

it('offers a pending app update only from the safe library route', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Update app now' }));
  expect(updateServiceWorker).toHaveBeenCalledOnce();

  await user.click(screen.getByRole('button', { name: 'Open mock ebook' }));
  expect(screen.getByRole('heading', { name: 'Mock editor' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Update app now' })).not.toBeInTheDocument();
});
