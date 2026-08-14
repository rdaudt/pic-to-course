import { type FormEvent, useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    const coverUrls: string[] = [];

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
            if (!active) {
              URL.revokeObjectURL(coverUrl);
              return { ebook };
            }
            coverUrls.push(coverUrl);
            return { ebook, coverUrl };
          }),
        );

        if (active) {
          setItems(loaded);
          setLoadError('');
        }
      } catch {
        if (active) setLoadError('Your ebooks could not be loaded. Try reloading this app.');
      }
    }

    void loadLibrary();
    return () => {
      active = false;
      coverUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [refreshKey]);

  const refresh = () => setRefreshKey((current) => current + 1);

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
      setIsCreateOpen(false);
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
      setRenameTarget(null);
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
      setDeleteTarget(null);
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
        <button type="button" onClick={() => setIsCreateOpen(true)}>New ebook</button>
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
                  <button type="button" onClick={() => { setRenameTarget(ebook); setRenameTitle(ebook.title); setRenameError(''); }} aria-label={`Rename ${ebook.title}`}>Rename</button>
                  <button type="button" className="destructive" onClick={() => setDeleteTarget(ebook)} aria-label={`Delete ${ebook.title}`}>Delete</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : <p className="empty-library">Create an ebook to start adding photo pages.</p>}

      {isCreateOpen && (
        <dialog open aria-labelledby="create-ebook-title">
          <form onSubmit={handleCreate}>
            <h2 id="create-ebook-title">Create ebook</h2>
            <label htmlFor="create-ebook-name">Title</label>
            <input id="create-ebook-name" value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} autoFocus />
            {createError && <p role="alert">{createError}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={() => setIsCreateOpen(false)} disabled={isSaving}>Cancel</button>
              <button type="submit" disabled={isSaving}>Create ebook</button>
            </div>
          </form>
        </dialog>
      )}

      {renameTarget && (
        <dialog open aria-labelledby="rename-ebook-title">
          <form onSubmit={handleRename}>
            <h2 id="rename-ebook-title">Rename ebook</h2>
            <label htmlFor="rename-ebook-name">Title</label>
            <input id="rename-ebook-name" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} autoFocus />
            {renameError && <p role="alert">{renameError}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={() => setRenameTarget(null)} disabled={isSaving}>Cancel</button>
              <button type="submit" disabled={isSaving}>Rename ebook</button>
            </div>
          </form>
        </dialog>
      )}

      {deleteTarget && (
        <dialog open aria-labelledby="delete-ebook-title" aria-describedby="delete-ebook-description">
          <h2 id="delete-ebook-title">Delete ebook</h2>
          <p id="delete-ebook-description">Permanently delete {deleteTarget.title} and all of its pages? This cannot be undone.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setDeleteTarget(null)} disabled={isSaving}>Cancel</button>
            <button type="button" className="destructive" onClick={handleDelete} disabled={isSaving}>Delete ebook</button>
          </div>
        </dialog>
      )}
    </main>
  );
}
