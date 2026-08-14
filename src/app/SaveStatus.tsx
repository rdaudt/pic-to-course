export type SaveState = 'idle' | 'saving' | 'saved';

export function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null;

  return <p className="save-status" aria-live="polite">{state === 'saving' ? 'Saving…' : 'Saved'}</p>;
}
