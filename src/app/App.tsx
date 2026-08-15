import { useState } from 'react';
import { CameraScreen } from '../camera/CameraScreen';
import { EditorScreen } from '../editor/EditorScreen';
import { ExportScreen } from '../export/ExportScreen';
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

  if (route.screen === 'editor') {
    return (
      <EditorScreen
        ebookId={route.ebookId}
        onClose={() => setRoute({ screen: 'library' })}
        onCapture={() => setRoute({ screen: 'camera', ebookId: route.ebookId })}
        onExport={() => setRoute({ screen: 'export', ebookId: route.ebookId })}
      />
    );
  }

  if (route.screen === 'camera') {
    return (
      <CameraScreen
        ebookId={route.ebookId}
        onClose={() => setRoute({ screen: 'editor', ebookId: route.ebookId })}
      />
    );
  }

  return <ExportScreen ebookId={route.ebookId} onClose={() => setRoute({ screen: 'editor', ebookId: route.ebookId })} />;
}
