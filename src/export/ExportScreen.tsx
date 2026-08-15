import { useEffect, useRef, useState } from 'react';
import { db } from '../db/database';
import { createPdf, type PdfProgress } from './createPdf';

interface ExportScreenProps {
  ebookId: string;
  onClose: () => void;
}

export function sanitizePdfFilename(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '');
  return `${safeTitle || 'ebook'}.pdf`;
}

function downloadPdf(pdf: Blob, filename: string) {
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

async function shareOrDownload(pdf: Blob, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([pdf], sanitizePdfFilename(title), { type: 'application/pdf' });
  const shareData = { files: [file] };
  if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare(shareData)) {
    await navigator.share({ ...shareData, title });
    return 'shared';
  }

  downloadPdf(pdf, file.name);
  return 'downloaded';
}

export function ExportScreen({ ebookId, onClose }: ExportScreenProps) {
  const [progress, setProgress] = useState<PdfProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<'shared' | 'downloaded' | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => () => abortController.current?.abort(), []);

  async function shareExistingPdf(blob: Blob, title: string) {
    setError('');
    try {
      setResult(await shareOrDownload(blob, title));
    } catch {
      setError('The PDF is ready, but sharing did not finish. Try again.');
    }
  }

  async function startExport() {
    if (abortController.current) return;
    setError('');
    setResult(null);
    setProgress(null);
    const controller = new AbortController();
    abortController.current = controller;
    setIsExporting(true);
    try {
      const ebook = await db.ebooks.get(ebookId);
      if (controller.signal.aborted) throw new DOMException('PDF export was cancelled.', 'AbortError');
      if (!ebook) {
        setError('This ebook could not be found. Return to the editor and try again.');
        return;
      }
      if (ebook.pageIds.length === 0) {
        setError('Add at least one page before creating a PDF.');
        return;
      }
      const exportedPdf = await createPdf(ebook, { signal: controller.signal, onProgress: setProgress });
      if (controller.signal.aborted) throw new DOMException('PDF export was cancelled.', 'AbortError');
      setPdf(exportedPdf);
      await shareExistingPdf(exportedPdf, ebook.title);
    } catch (caught) {
      if ((caught as { name?: string }).name === 'AbortError') {
        setError('PDF creation was cancelled.');
      } else {
        setError('The PDF could not be created. Try again.');
      }
    } finally {
      if (abortController.current === controller) abortController.current = null;
      setIsExporting(false);
    }
  }

  function cancelExport() {
    abortController.current?.abort();
  }

  async function retryShare() {
    const ebook = await db.ebooks.get(ebookId);
    if (!ebook || !pdf) return;
    await shareExistingPdf(pdf, ebook.title);
  }

  async function downloadExistingPdf() {
    const ebook = await db.ebooks.get(ebookId);
    if (!ebook || !pdf) return;
    setError('');
    downloadPdf(pdf, sanitizePdfFilename(ebook.title));
    setResult('downloaded');
  }

  function close() {
    abortController.current?.abort();
    onClose();
  }

  return (
    <main className="app export-screen">
      <header className="export-header">
        <div>
          <h1>Create PDF</h1>
          <p>Pages are prepared one at a time in their current order.</p>
        </div>
        <button type="button" onClick={close} disabled={isExporting}>Back to ebook editor</button>
      </header>

      {isExporting && (
        <section aria-live="polite" aria-label="PDF creation progress">
          <p>{progress ? `Creating page ${progress.completed} of ${progress.total}…` : 'Preparing PDF…'}</p>
          <button type="button" onClick={cancelExport}>Cancel PDF creation</button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {result && <p role="status">{result === 'shared' ? 'PDF shared.' : 'PDF download started.'}</p>}

      <nav className="export-actions" aria-label="PDF actions">
        <button type="button" onClick={() => void startExport()} disabled={isExporting}>
          {pdf ? 'Create another PDF' : 'Create PDF'}
        </button>
        {pdf && !isExporting && (
          <button type="button" onClick={() => void retryShare()}>Retry sharing</button>
        )}
        {pdf && !isExporting && (
          <button type="button" onClick={() => void downloadExistingPdf()}>Download PDF</button>
        )}
      </nav>
    </main>
  );
}
