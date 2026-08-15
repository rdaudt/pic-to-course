import { useEffect, useRef, useState } from 'react';
import { db } from '../db/database';
import { createPdf, type PdfProgress } from './createPdf';

interface ExportScreenProps {
  ebookId: string;
  onClose: () => void;
  initialFocus?: boolean;
}

interface DownloadFallback {
  blob: Blob;
  url: string;
  filename: string;
}

export function sanitizePdfFilename(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '');
  return `${safeTitle || 'ebook'}.pdf`;
}

function canShareFile(file: File): boolean {
  const shareData = { files: [file] };
  return typeof navigator.canShare === 'function'
    && typeof navigator.share === 'function'
    && navigator.canShare(shareData);
}

export function ExportScreen({ ebookId, onClose, initialFocus }: ExportScreenProps) {
  const [progress, setProgress] = useState<PdfProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<'shared' | 'downloaded' | 'fallback' | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [download, setDownload] = useState<DownloadFallback | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sharingInProgress = useRef(false);
  const mountedRef = useRef(false);
  const downloadRef = useRef<DownloadFallback | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortController.current?.abort();
      const currentDownload = downloadRef.current;
      downloadRef.current = null;
      if (currentDownload) URL.revokeObjectURL(currentDownload.url);
    };
  }, []);

  useEffect(() => {
    if (initialFocus) headingRef.current?.focus();
  }, [initialFocus]);

  function releaseDownload() {
    const currentDownload = downloadRef.current;
    if (!currentDownload) return;
    downloadRef.current = null;
    URL.revokeObjectURL(currentDownload.url);
    if (mountedRef.current) setDownload(null);
  }

  function replacePdf(blob: Blob) {
    releaseDownload();
    setPdf(blob);
  }

  function showDownload(blob: Blob, title: string) {
    if (!mountedRef.current) return;
    const existing = downloadRef.current;
    if (existing?.blob === blob) return;
    releaseDownload();
    const fallback: DownloadFallback = {
      blob,
      url: URL.createObjectURL(blob),
      filename: sanitizePdfFilename(title),
    };
    downloadRef.current = fallback;
    setDownload(fallback);
  }

  async function shareExistingPdf(blob: Blob, title: string) {
    if (sharingInProgress.current || !mountedRef.current) return;
    sharingInProgress.current = true;
    setError('');
    setResult(null);
    setIsSharing(true);
    const file = new File([blob], sanitizePdfFilename(title), { type: 'application/pdf' });
    try {
      if (canShareFile(file)) {
        await navigator.share({ files: [file], title });
        if (mountedRef.current) setResult('shared');
      } else {
        showDownload(blob, title);
        if (mountedRef.current) setResult('fallback');
      }
    } catch {
      showDownload(blob, title);
      if (mountedRef.current) {
        setError('The PDF is ready, but sharing did not finish. Try again.');
      }
    } finally {
      sharingInProgress.current = false;
      if (mountedRef.current) setIsSharing(false);
    }
  }

  async function startExport() {
    if (abortController.current || !mountedRef.current) return;
    setError('');
    setResult(null);
    setProgress(null);
    const controller = new AbortController();
    abortController.current = controller;
    setIsGenerating(true);
    try {
      const ebook = await db.ebooks.get(ebookId);
      if (controller.signal.aborted) throw new DOMException('PDF export was cancelled.', 'AbortError');
      if (!mountedRef.current) return;
      if (!ebook) {
        setError('This ebook could not be found. Return to the editor and try again.');
        return;
      }
      if (ebook.pageIds.length === 0) {
        setError('Add at least one page before creating a PDF.');
        return;
      }
      const exportedPdf = await createPdf(ebook, {
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (mountedRef.current) setProgress(nextProgress);
        },
      });
      if (controller.signal.aborted) throw new DOMException('PDF export was cancelled.', 'AbortError');
      if (!mountedRef.current) return;
      replacePdf(exportedPdf);
      abortController.current = null;
      setIsGenerating(false);
      await shareExistingPdf(exportedPdf, ebook.title);
    } catch (caught) {
      if (!mountedRef.current) return;
      if ((caught as { name?: string }).name === 'AbortError') {
        setError('PDF creation was cancelled.');
      } else {
        setError('The PDF could not be created. Try again.');
      }
    } finally {
      if (abortController.current === controller) abortController.current = null;
      if (mountedRef.current) setIsGenerating(false);
    }
  }

  function cancelExport() {
    abortController.current?.abort();
  }

  async function retryShare() {
    if (sharingInProgress.current) return;
    const ebook = await db.ebooks.get(ebookId);
    if (!mountedRef.current || !ebook || !pdf) return;
    await shareExistingPdf(pdf, ebook.title);
  }

  function close() {
    if (sharingInProgress.current) return;
    abortController.current?.abort();
    onClose();
  }

  return (
    <main className="app export-screen">
      <header className="export-header">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>Create PDF</h1>
          <p>Pages are prepared one at a time in their current order.</p>
        </div>
        <button type="button" onClick={close} disabled={isGenerating || isSharing}>Back to ebook editor</button>
      </header>

      {isGenerating && (
        <section aria-live="polite" aria-label="PDF creation progress">
          <p>{progress ? `Creating page ${progress.completed} of ${progress.total}…` : 'Preparing PDF…'}</p>
          <button type="button" onClick={cancelExport}>Cancel PDF creation</button>
        </section>
      )}
      {isSharing && <p aria-live="polite">Sharing PDF…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          {result === 'shared' ? 'PDF shared.' : result === 'downloaded' ? 'PDF download started.' : 'PDF ready to download.'}
        </p>
      )}

      <nav className="export-actions" aria-label="PDF actions">
        <button type="button" onClick={() => void startExport()} disabled={isGenerating || isSharing}>
          {pdf ? 'Create another PDF' : 'Create PDF'}
        </button>
        {pdf && (
          <button type="button" onClick={() => void retryShare()} disabled={isSharing}>Retry sharing</button>
        )}
        {download && (
          <a
            className="download-link"
            href={download.url}
            download={download.filename}
            onClick={() => setResult('downloaded')}
          >
            Download PDF
          </a>
        )}
      </nav>
    </main>
  );
}
