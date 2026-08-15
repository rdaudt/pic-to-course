import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

it('opens on the library', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'New ebook' })).toBeVisible();
});
