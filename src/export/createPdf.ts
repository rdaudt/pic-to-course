import { PDFDocument, degrees } from 'pdf-lib';
import { db } from '../db/database';
import type { EbookRecord, PageRecord } from '../domain/models';

export interface PdfProgress {
  completed: number;
  total: number;
}

export interface CreatePdfOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PdfProgress) => void;
}

const points = (pixels: number) => pixels * 72 / 96;

function abortError(): DOMException {
  return new DOMException('PDF export was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function readImage(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

function drawPageImage(pdfPage: ReturnType<PDFDocument['addPage']>, page: PageRecord, image: Awaited<ReturnType<PDFDocument['embedJpg']>>) {
  const width = points(page.width);
  const height = points(page.height);

  switch (page.rotation) {
    case 90:
      pdfPage.drawImage(image, { x: height, y: 0, width, height, rotate: degrees(90) });
      break;
    case 180:
      pdfPage.drawImage(image, { x: width, y: height, width, height, rotate: degrees(180) });
      break;
    case 270:
      pdfPage.drawImage(image, { x: 0, y: width, width, height, rotate: degrees(270) });
      break;
    default:
      pdfPage.drawImage(image, { x: 0, y: 0, width, height });
  }
}

export async function createPdf(ebook: EbookRecord, options: CreatePdfOptions = {}): Promise<Blob> {
  if (ebook.pageIds.length === 0) {
    throw new Error('This ebook has no pages to export.');
  }

  const pdf = await PDFDocument.create();
  const total = ebook.pageIds.length;

  for (let index = 0; index < total; index += 1) {
    throwIfAborted(options.signal);
    const pageId = ebook.pageIds[index];
    const page = await db.pages.get(pageId);
    throwIfAborted(options.signal);
    if (!page || page.ebookId !== ebook.id) throw new Error('A page could not be loaded for export.');

    const image = await pdf.embedJpg(await readImage(page.imageBlob));
    throwIfAborted(options.signal);
    const quarterTurn = page.rotation === 90 || page.rotation === 270;
    const pdfPage = pdf.addPage([
      points(quarterTurn ? page.height : page.width),
      points(quarterTurn ? page.width : page.height),
    ]);
    drawPageImage(pdfPage, page, image);
    options.onProgress?.({ completed: index + 1, total });
  }

  const pdfBytes = await pdf.save();
  const pdfData = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  return new Blob([pdfData], { type: 'application/pdf' });
}
