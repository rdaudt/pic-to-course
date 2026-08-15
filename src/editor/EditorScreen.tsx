import { type RefObject, useEffect, useRef, useState } from 'react';
import { SaveStatus, type SaveState } from '../app/SaveStatus';
import { db, deletePage, reorderPages, rotatePage } from '../db/database';
import type { EbookRecord } from '../domain/models';
import { PageGrid, type EditorPage } from './PageGrid';

interface EditorScreenProps {
  ebookId: string;
  onClose: () => void;
  onCapture: () => void;
  onExport: () => void;
  initialFocus?: 'heading' | 'capture' | 'export';
}

function useNativeModal(dialogRef: RefObject<HTMLDialogElement | null>, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('button')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [dialogRef, isOpen]);
}

export function EditorScreen({ ebookId, onClose, onCapture, onExport, initialFocus }: EditorScreenProps) {
  const [ebook, setEbook] = useState<EbookRecord | null>(null);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EditorPage | null>(null);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const captureButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const initialFocusAppliedRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const thumbnailUrlsRef = useRef<Set<string>>(new Set());

  useNativeModal(deleteDialogRef, Boolean(deleteTarget));

  useEffect(() => {
    if (!ebook || !initialFocus || initialFocusAppliedRef.current) return;
    initialFocusAppliedRef.current = true;
    if (initialFocus === 'heading') headingRef.current?.focus();
    if (initialFocus === 'capture') captureButtonRef.current?.focus();
    if (initialFocus === 'export') exportButtonRef.current?.focus();
  }, [ebook, initialFocus]);

  useEffect(() => {
    if (!shouldRestoreFocus || deleteTarget) return;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    setShouldRestoreFocus(false);
    if (target?.isConnected) {
      target.focus();
    } else {
      captureButtonRef.current?.focus();
    }
  }, [deleteTarget, shouldRestoreFocus]);

  useEffect(() => {
    let active = true;
    const createdUrls = new Set<string>();
    thumbnailUrlsRef.current = createdUrls;

    async function loadEditor() {
      try {
        const loadedEbook = await db.ebooks.get(ebookId);
        if (!loadedEbook) throw new Error('Ebook not found');
        const loadedPages = await Promise.all(
          loadedEbook.pageIds.map(async (pageId): Promise<EditorPage> => {
            const page = await db.pages.get(pageId);
            if (!page || page.ebookId !== ebookId) throw new Error('Page not found');
            const thumbnailUrl = URL.createObjectURL(page.thumbnailBlob);
            createdUrls.add(thumbnailUrl);
            if (!active) {
              createdUrls.delete(thumbnailUrl);
              URL.revokeObjectURL(thumbnailUrl);
            }
            return { ...page, thumbnailUrl };
          }),
        );
        if (!active) return;
        setEbook(loadedEbook);
        setPages(loadedPages);
        setLoadError('');
      } catch {
        const shouldReportError = active;
        active = false;
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        createdUrls.clear();
        if (shouldReportError) setLoadError('This ebook could not be loaded. Return to My ebooks and try again.');
      }
    }

    void loadEditor();
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
      createdUrls.clear();
    };
  }, [ebookId]);

  useEffect(
    () => () => {
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current.clear();
    },
    [],
  );

  async function save(action: () => Promise<void>) {
    setIsSaving(true);
    setSaveError('');
    setSaveState('saving');
    try {
      await action();
      setSaveState('saved');
    } catch {
      setSaveState('idle');
      setSaveError('Your page changes could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleReorder(pageIds: string[]) {
    void save(async () => {
      await reorderPages(ebookId, pageIds);
      setPages((current) => pageIds.flatMap((id) => current.filter((page) => page.id === id)));
    });
  }

  function handleRotate(pageId: string) {
    void save(async () => {
      await rotatePage(ebookId, pageId);
      setPages((current) => current.map((page) => (
        page.id === pageId
          ? { ...page, rotation: ((page.rotation + 90) % 360) as EditorPage['rotation'] }
          : page
      )));
    });
  }

  function dismissDeleteDialog(restoreCaptureFocus = false) {
    if (restoreCaptureFocus) returnFocusRef.current = captureButtonRef.current;
    setDeleteTarget(null);
    setShouldRestoreFocus(true);
  }

  function requestDelete(page: EditorPage, trigger: HTMLElement) {
    returnFocusRef.current = trigger;
    setDeleteTarget(page);
  }

  function handleDelete() {
    const page = deleteTarget;
    if (!page) return;
    void save(async () => {
      await deletePage(ebookId, page.id);
      thumbnailUrlsRef.current.delete(page.thumbnailUrl);
      URL.revokeObjectURL(page.thumbnailUrl);
      setPages((current) => current.filter((item) => item.id !== page.id));
      setEbook((current) => current ? { ...current, pageIds: current.pageIds.filter((id) => id !== page.id) } : current);
      dismissDeleteDialog(true);
    });
  }

  return (
    <main className="app editor-screen">
      <header className="editor-header">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>{ebook?.title ?? 'Ebook editor'}</h1>
          <p>{pages.length} {pages.length === 1 ? 'page' : 'pages'}</p>
        </div>
        <button type="button" onClick={onClose} disabled={isSaving}>Close</button>
      </header>

      <SaveStatus state={saveState} />
      {loadError && <p role="alert">{loadError}</p>}
      {saveError && <p role="alert">{saveError}</p>}

      <PageGrid
        pages={pages}
        onReorder={handleReorder}
        onRotate={handleRotate}
        onDelete={requestDelete}
        disabled={isSaving}
      />

      <nav className="editor-navigation" aria-label="Ebook actions">
        <button ref={captureButtonRef} type="button" onClick={() => onCapture()} disabled={isSaving}>Capture a photo</button>
        <button ref={exportButtonRef} type="button" onClick={() => onExport()} disabled={isSaving}>Create PDF</button>
      </nav>

      {deleteTarget && (
        <dialog
          ref={deleteDialogRef}
          aria-labelledby="delete-page-title"
          aria-describedby="delete-page-description"
          onCancel={(event) => {
            event.preventDefault();
            if (isSaving) return;
            dismissDeleteDialog();
          }}
        >
          <h2 id="delete-page-title">Delete page</h2>
          <p id="delete-page-description">Permanently delete this picture and page? This cannot be undone.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => dismissDeleteDialog()} disabled={isSaving}>Cancel</button>
            <button type="button" className="destructive" onClick={handleDelete} disabled={isSaving}>Delete page</button>
          </div>
        </dialog>
      )}
    </main>
  );
}
