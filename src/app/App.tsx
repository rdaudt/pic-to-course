import { useState } from 'react';
import { LibraryScreen } from '../library/LibraryScreen';

export type Route =
  | { screen: 'library' }
  | { screen: 'editor'; ebookId: string }
  | { screen: 'camera'; ebookId: string }
  | { screen: 'export'; ebookId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ screen: 'library' });

  if (route.screen === 'library') {
    return <LibraryScreen onOpen={(ebookId) => setRoute({ screen: 'editor', ebookId })} />;
  }

  return (
    <main className="app">
      <h1>{route.screen === 'editor' ? 'Ebook editor' : route.screen}</h1>
      <p>This screen will be available in a later update.</p>
      <button type="button" onClick={() => setRoute({ screen: 'library' })}>
        Back to My ebooks
      </button>
    </main>
  );
}
