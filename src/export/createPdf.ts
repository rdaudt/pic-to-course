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

const encoder = new TextEncoder();
const points = (pixels: number) => pixels * 72 / 96;

function abortError(): DOMException {
  return new DOMException('PDF export was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function pdfNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

class PdfPartsWriter {
  readonly parts: BlobPart[] = [];
  readonly offsets: number[] = [];
  size = 0;

  addText(value: string) {
    const bytes = encoder.encode(value);
    this.parts.push(bytes);
    this.size += bytes.byteLength;
  }

  addBlob(value: Blob) {
    this.parts.push(value);
    this.size += value.size;
  }

  startObject(id: number) {
    this.offsets[id] = this.size;
    this.addText(`${id} 0 obj\n`);
  }

  endObject() {
    this.addText('endobj\n');
  }
}

function pageGeometry(page: PageRecord) {
  const imageWidth = points(page.width);
  const imageHeight = points(page.height);
  const quarterTurn = page.rotation === 90 || page.rotation === 270;
  const pageWidth = quarterTurn ? imageHeight : imageWidth;
  const pageHeight = quarterTurn ? imageWidth : imageHeight;

  let matrix: [number, number, number, number, number, number];
  switch (page.rotation) {
    case 90:
      matrix = [0, imageWidth, -imageHeight, 0, imageHeight, 0];
      break;
    case 180:
      matrix = [-imageWidth, 0, 0, -imageHeight, imageWidth, imageHeight];
      break;
    case 270:
      matrix = [0, -imageWidth, imageHeight, 0, 0, imageWidth];
      break;
    default:
      matrix = [imageWidth, 0, 0, imageHeight, 0, 0];
  }

  return {
    pageWidth: pdfNumber(pageWidth),
    pageHeight: pdfNumber(pageHeight),
    matrix: matrix.map(pdfNumber).join(' '),
  };
}

function addPageObjects(writer: PdfPartsWriter, page: PageRecord, pageIndex: number) {
  const pageObject = 3 + pageIndex * 3;
  const imageObject = pageObject + 1;
  const contentObject = pageObject + 2;
  const { pageWidth, pageHeight, matrix } = pageGeometry(page);

  writer.startObject(pageObject);
  writer.addText(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] `
      + `/Resources << /XObject << /Im0 ${imageObject} 0 R >> >> `
      + `/Contents ${contentObject} 0 R >>\n`,
  );
  writer.endObject();

  writer.startObject(imageObject);
  writer.addText(
    `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode `
      + `/Length ${page.imageBlob.size} >>\nstream\n`,
  );
  writer.addBlob(page.imageBlob);
  writer.addText('\nendstream\n');
  writer.endObject();

  const content = `q\n${matrix} cm\n/Im0 Do\nQ\n`;
  writer.startObject(contentObject);
  writer.addText(`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}endstream\n`);
  writer.endObject();
}

function addCrossReference(writer: PdfPartsWriter, objectCount: number) {
  const xrefOffset = writer.size;
  writer.addText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let object = 1; object <= objectCount; object += 1) {
    const offset = writer.offsets[object];
    if (offset === undefined) throw new Error('The PDF object index is incomplete.');
    writer.addText(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  writer.addText(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
}

export async function createPdf(ebook: EbookRecord, options: CreatePdfOptions = {}): Promise<Blob> {
  if (ebook.pageIds.length === 0) {
    throw new Error('This ebook has no pages to export.');
  }

  const total = ebook.pageIds.length;
  const objectCount = 2 + total * 3;
  const writer = new PdfPartsWriter();
  writer.addText('%PDF-1.7\n');
  writer.parts.push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));
  writer.size += 6;

  writer.startObject(1);
  writer.addText('<< /Type /Catalog /Pages 2 0 R >>\n');
  writer.endObject();

  const pageReferences = ebook.pageIds.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  writer.startObject(2);
  writer.addText(`<< /Type /Pages /Count ${total} /Kids [${pageReferences}] >>\n`);
  writer.endObject();

  for (let index = 0; index < total; index += 1) {
    throwIfAborted(options.signal);
    const pageId = ebook.pageIds[index];
    const page = await db.pages.get(pageId);
    throwIfAborted(options.signal);
    if (!page || page.ebookId !== ebook.id) throw new Error('A page could not be loaded for export.');

    addPageObjects(writer, page, index);
    options.onProgress?.({ completed: index + 1, total });
  }

  throwIfAborted(options.signal);
  addCrossReference(writer, objectCount);
  throwIfAborted(options.signal);
  return new Blob(writer.parts, { type: 'application/pdf' });
}
