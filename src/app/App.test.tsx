import { render, screen } from '@testing-library/react';
import { App } from './App';

it('opens on the library', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'New ebook' })).toBeVisible();
});
