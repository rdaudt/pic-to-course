import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CameraScreen } from '../camera/CameraScreen';
import { EditorScreen } from '../editor/EditorScreen';
import { ExportScreen } from '../export/ExportScreen';
import { LibraryScreen } from '../library/LibraryScreen';

export type Route =
  | { screen: 'library'; focusEbookId?: string }
  | { screen: 'editor'; ebookId: string; focus: 'heading' | 'capture' | 'export' }
  | { screen: 'camera'; ebookId: string }
  | { screen: 'export'; ebookId: string };

export function App() {
  const [route, setRoute] = useState<Route>({ screen: 'library' });
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (route.screen === 'library') {
    return (
      <>
        <LibraryScreen
          initialFocusEbookId={route.focusEbookId}
          onOpen={(ebookId) => setRoute({ screen: 'editor', ebookId, focus: 'heading' })}
        />
        {needRefresh && (
          <aside className="app-update" aria-live="polite">
            <span>A new version is ready.</span>
            <button type="button" onClick={() => void updateServiceWorker(true)}>Update app now</button>
          </aside>
        )}
      </>
    );
  }

  if (route.screen === 'editor') {
    return (
      <EditorScreen
        ebookId={route.ebookId}
        initialFocus={route.focus}
        onClose={() => setRoute({ screen: 'library', focusEbookId: route.ebookId })}
        onCapture={() => setRoute({ screen: 'camera', ebookId: route.ebookId })}
        onExport={() => setRoute({ screen: 'export', ebookId: route.ebookId })}
      />
    );
  }

  if (route.screen === 'camera') {
    return (
      <CameraScreen
        ebookId={route.ebookId}
        initialFocus
        onClose={() => setRoute({ screen: 'editor', ebookId: route.ebookId, focus: 'capture' })}
      />
    );
  }

  return (
    <ExportScreen
      ebookId={route.ebookId}
      initialFocus
      onClose={() => setRoute({ screen: 'editor', ebookId: route.ebookId, focus: 'export' })}
    />
  );
}
