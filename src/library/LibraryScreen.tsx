import { type FormEvent, type MouseEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { SaveStatus, type SaveState } from '../app/SaveStatus';
import { createEbook, db, deleteEbook, listEbooks, renameEbook } from '../db/database';
import type { EbookRecord } from '../domain/models';

interface LibraryScreenProps {
  onOpen: (id: string) => void;
}

interface LibraryItem {
  ebook: EbookRecord;
  coverUrl?: string;
}

const isBlank = (title: string) => !title.trim();

function editedDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp);
}

function useNativeModal(dialogRef: RefObject<HTMLDialogElement | null>, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('input, button')?.focus();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [dialogRef, isOpen]);
}

export function LibraryScreen({ onOpen }: LibraryScreenProps) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createError, setCreateError] = useState('');
  const [renameTarget, setRenameTarget] = useState<EbookRecord | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EbookRecord | null>(null);
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const renameDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const newEbookButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const renderedCoverUrlsRef = useRef<Set<string>>(new Set());
  const pendingCoverUrlsRef = useRef<Set<string> | null>(null);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(false);

  useNativeModal(createDialogRef, isCreateOpen);
  useNativeModal(renameDialogRef, Boolean(renameTarget));
  useNativeModal(deleteDialogRef, Boolean(deleteTarget));

  const hasOpenDialog = isCreateOpen || Boolean(renameTarget) || Boolean(deleteTarget);

  useEffect(() => {
    if (!shouldRestoreFocus || hasOpenDialog) return;

    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    setShouldRestoreFocus(false);
    if (returnTarget?.isConnected) {
      returnTarget.focus();
    } else {
      newEbookButtonRef.current?.focus();
    }
  }, [hasOpenDialog, shouldRestoreFocus]);

  useEffect(() => {
    let active = true;
    const loadCoverUrls = new Set<string>();

    const abandonedPendingUrls = pendingCoverUrlsRef.current;
    if (abandonedPendingUrls) {
      abandonedPendingUrls.forEach((url) => URL.revokeObjectURL(url));
      pendingCoverUrlsRef.current = null;
    }

    async function loadLibrary() {
      try {
        const ebooks = await listEbooks();
        const loaded = await Promise.all(
          ebooks.map(async (ebook): Promise<LibraryItem> => {
            const firstPageId = ebook.pageIds[0];
            if (!firstPageId) return { ebook };

            const firstPage = await db.pages.get(firstPageId);
            if (!firstPage) return { ebook };

            const coverUrl = URL.createObjectURL(firstPage.thumbnailBlob);
            loadCoverUrls.add(coverUrl);
            if (!active) {
              loadCoverUrls.delete(coverUrl);
              URL.revokeObjectURL(coverUrl);
              return { ebook };
            }
            return { ebook, coverUrl };
          }),
        );

        if (active) {
          pendingCoverUrlsRef.current = loadCoverUrls;
          setItems(loaded);
          setLoadError('');
        }
      } catch {
        loadCoverUrls.forEach((url) => URL.revokeObjectURL(url));
        loadCoverUrls.clear();
        if (active) setLoadError('Your ebooks could not be loaded. Try reloading this app.');
      }
    }

    void loadLibrary();
    return () => {
      active = false;
      if (pendingCoverUrlsRef.current === loadCoverUrls) return;
      loadCoverUrls.forEach((url) => {
        if (!renderedCoverUrlsRef.current.has(url)) URL.revokeObjectURL(url);
      });
    };
  }, [refreshKey]);

  useEffect(() => {
    const pendingUrls = pendingCoverUrlsRef.current;
    const itemUrls = new Set(
      items.flatMap(({ coverUrl }) => (coverUrl ? [coverUrl] : [])),
    );
    if (!pendingUrls || pendingUrls.size !== itemUrls.size) return;
    if ([...pendingUrls].some((url) => !itemUrls.has(url))) return;

    pendingCoverUrlsRef.current = null;
    const previousUrls = renderedCoverUrlsRef.current;
    renderedCoverUrlsRef.current = pendingUrls;
    previousUrls.forEach((url) => {
      if (!pendingUrls.has(url)) URL.revokeObjectURL(url);
    });
  }, [items]);

  useEffect(
    () => () => {
      const urls = new Set([
        ...renderedCoverUrlsRef.current,
        ...(pendingCoverUrlsRef.current ?? []),
      ]);
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const refresh = () => setRefreshKey((current) => current + 1);

  function rememberTrigger(event: MouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = event.currentTarget;
  }

  function requestFocusRestore() {
    setShouldRestoreFocus(true);
  }

  function dismissCreateDialog() {
    setIsCreateOpen(false);
    requestFocusRestore();
  }

  function dismissRenameDialog() {
    setRenameTarget(null);
    requestFocusRestore();
  }

  function dismissDeleteDialog(returnToNewEbook = false) {
    if (returnToNewEbook) returnFocusRef.current = newEbookButtonRef.current;
    setDeleteTarget(null);
    requestFocusRestore();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBlank(createTitle)) {
      setCreateError('Enter an ebook title.');
      return;
    }

    setCreateError('');
    setIsSaving(true);
    setSaveState('saving');
    try {
      const ebook = await createEbook(createTitle);
      setSaveState('saved');
      dismissCreateDialog();
      setCreateTitle('');
      refresh();
      onOpen(ebook.id);
    } catch {
      setCreateError('Your ebook could not be created. Try again.');
      setSaveState('idle');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) return;
    if (isBlank(renameTitle)) {
      setRenameError('Enter an ebook title.');
      return;
    }

    setRenameError('');
    setIsSaving(true);
    setSaveState('saving');
    try {
      await renameEbook(renameTarget.id, renameTitle);
      setSaveState('saved');
      dismissRenameDialog();
      refresh();
    } catch {
      setRenameError('Your ebook could not be renamed. Try again.');
      setSaveState('idle');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setIsSaving(true);
    setSaveState('saving');
    try {
      await deleteEbook(deleteTarget.id);
      setSaveState('saved');
      dismissDeleteDialog(true);
      refresh();
    } catch {
      setLoadError('Your ebook could not be deleted. Try again.');
      setSaveState('idle');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app library-screen">
      <header className="library-header">
        <div>
          <h1>My ebooks</h1>
          <p className="local-only">Stored only on this iPad.</p>
        </div>
        <button
          ref={newEbookButtonRef}
          type="button"
          onClick={(event) => {
            rememberTrigger(event);
            setIsCreateOpen(true);
          }}
        >
          New ebook
        </button>
      </header>

      <aside className="data-warning" aria-label="Permanent data loss warning">
        <strong>Your editable ebooks live only on this iPad.</strong> Clearing Safari or PWA website data permanently erases your editable ebooks.
      </aside>

      <SaveStatus state={saveState} />
      {loadError && <p role="alert">{loadError}</p>}

      {items.length > 0 ? (
        <section className="ebook-grid" aria-label="Ebooks">
          {items.map(({ ebook, coverUrl }) => (
            <article className="ebook-card" key={ebook.id}>
              {coverUrl ? (
                <img className="ebook-cover" src={coverUrl} alt={`Cover for ${ebook.title}`} />
              ) : (
                <div className="ebook-cover ebook-cover-empty" aria-hidden="true">No pages yet</div>
              )}
              <div className="ebook-card-content">
                <h2>{ebook.title}</h2>
                <p>{`${ebook.pageIds.length} ${ebook.pageIds.length === 1 ? 'page' : 'pages'}`}</p>
                <p>Last edited {editedDate(ebook.updatedAt)}</p>
                <div className="ebook-actions">
                  <button type="button" onClick={() => onOpen(ebook.id)} aria-label={`Open ${ebook.title}`}>Open</button>
                  <button
                    type="button"
                    onClick={(event) => {
                      rememberTrigger(event);
                      setRenameTarget(ebook);
                      setRenameTitle(ebook.title);
                      setRenameError('');
                    }}
                    aria-label={`Rename ${ebook.title}`}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="destructive"
                    onClick={(event) => {
                      rememberTrigger(event);
                      setDeleteTarget(ebook);
                    }}
                    aria-label={`Delete ${ebook.title}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : <p className="empty-library">Create an ebook to start adding photo pages.</p>}

      {isCreateOpen && (
        <dialog ref={createDialogRef} aria-labelledby="create-ebook-title" onCancel={(event) => { event.preventDefault(); dismissCreateDialog(); }}>
          <form onSubmit={handleCreate}>
            <h2 id="create-ebook-title">Create ebook</h2>
            <label htmlFor="create-ebook-name">Title</label>
            <input id="create-ebook-name" value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} autoFocus />
            {createError && <p role="alert">{createError}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={dismissCreateDialog} disabled={isSaving}>Cancel</button>
              <button type="submit" disabled={isSaving}>Create ebook</button>
            </div>
          </form>
        </dialog>
      )}

      {renameTarget && (
        <dialog ref={renameDialogRef} aria-labelledby="rename-ebook-title" onCancel={(event) => { event.preventDefault(); dismissRenameDialog(); }}>
          <form onSubmit={handleRename}>
            <h2 id="rename-ebook-title">Rename ebook</h2>
            <label htmlFor="rename-ebook-name">Title</label>
            <input id="rename-ebook-name" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} autoFocus />
            {renameError && <p role="alert">{renameError}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={dismissRenameDialog} disabled={isSaving}>Cancel</button>
              <button type="submit" disabled={isSaving}>Rename ebook</button>
            </div>
          </form>
        </dialog>
      )}

      {deleteTarget && (
        <dialog ref={deleteDialogRef} aria-labelledby="delete-ebook-title" aria-describedby="delete-ebook-description" onCancel={(event) => { event.preventDefault(); dismissDeleteDialog(); }}>
          <h2 id="delete-ebook-title">Delete ebook</h2>
          <p id="delete-ebook-description">Permanently delete {deleteTarget.title} and all of its pages? This cannot be undone.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => dismissDeleteDialog()} disabled={isSaving}>Cancel</button>
            <button type="button" className="destructive" onClick={handleDelete} disabled={isSaving}>Delete ebook</button>
          </div>
        </dialog>
      )}
    </main>
  );
}
