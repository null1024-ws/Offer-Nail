import {
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { isLocalOcrAvailable, type OcrImageSource } from './ocr-runtime';

export type PdfExtractionErrorCode =
  'NO_TEXT_LAYER' | 'PASSWORD_PROTECTED' | 'DAMAGED';

export class PdfExtractionError extends Error {
  constructor(
    readonly code: PdfExtractionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}

export interface PdfTextBlock {
  pageNumber: number;
  text: string;
  x: number;
  y: number;
}

export interface PdfExtraction {
  pageCount: number;
  blocks: PdfTextBlock[];
}

export interface ExtractPdfOptions {
  recognizeImage?: (image: OcrImageSource) => Promise<string>;
}

const OFFLINE_OPTIONS = {
  disableAutoFetch: true,
  disableRange: true,
  disableStream: true,
  useSystemFonts: true,
  useWasm: false,
  useWorkerFetch: false,
  verbosity: 0,
} as const;

function copyBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy;
}

function hasEncryptDictionary(input: Uint8Array): boolean {
  const ascii = new TextDecoder('latin1').decode(input);
  return /\/Encrypt\s+\d+\s+\d+\s+R/.test(ascii);
}

function userMessage(code: PdfExtractionErrorCode): string {
  if (code === 'NO_TEXT_LAYER') {
    return '这份 PDF 可能是扫描件，未能识别出文字。请换更清晰的文件或改为手动录入。文件不会被保留。';
  }
  if (code === 'PASSWORD_PROTECTED') {
    return '这份 PDF 受密码保护，无法提取文本。文件不会被保留。';
  }
  return '这份 PDF 已损坏或无法读取。文件不会被保留。';
}

function toError(error: unknown, input: Uint8Array): PdfExtractionError {
  if (error instanceof PdfExtractionError) return error;
  if (error instanceof PasswordException || hasEncryptDictionary(input)) {
    return new PdfExtractionError(
      'PASSWORD_PROTECTED',
      userMessage('PASSWORD_PROTECTED'),
    );
  }
  if (error instanceof InvalidPDFException) {
    return new PdfExtractionError('DAMAGED', userMessage('DAMAGED'));
  }
  return new PdfExtractionError('DAMAGED', userMessage('DAMAGED'));
}

function ensurePdfWorker() {
  if (GlobalWorkerOptions.workerSrc) return;
  const runtime = (
    globalThis as {
      browser?: { runtime?: { getURL?: (path: string) => string } };
    }
  ).browser?.runtime;
  if (!runtime?.getURL) return;
  GlobalWorkerOptions.workerSrc = runtime.getURL('/pdf.worker.min.mjs');
}

function blocksFromOcrText(pageNumber: number, text: string): PdfTextBlock[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({
      pageNumber,
      text: line.trim(),
      x: 0,
      y: index,
    }))
    .filter((block) => block.text.length > 0);
}

async function resolveRecognizer(
  provided?: ExtractPdfOptions['recognizeImage'],
): Promise<ExtractPdfOptions['recognizeImage'] | undefined> {
  if (provided) return provided;
  if (!isLocalOcrAvailable()) return undefined;
  const { recognizeLocalImage } = await import('./ocr');
  return recognizeLocalImage;
}

async function ocrPdfPages(
  pdf: PDFDocumentProxy,
  recognizeImage: NonNullable<ExtractPdfOptions['recognizeImage']>,
): Promise<PdfTextBlock[]> {
  const host = globalThis.document;
  if (typeof host?.createElement !== 'function') return [];

  const blocks: PdfTextBlock[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = host.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return [];
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const text = await recognizeImage(canvas);
    blocks.push(...blocksFromOcrText(pageNumber, text));
  }
  return blocks;
}

const LINE_Y_TOLERANCE = 2;

function cleanTextItem(text: string): string {
  // eslint-disable-next-line no-control-regex -- strip PDF control characters and DEL
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

async function extractBlocks(
  document: PDFDocumentProxy,
): Promise<PdfTextBlock[]> {
  const blocks: PdfTextBlock[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .flatMap((item) => {
        if (!('str' in item) || !('transform' in item)) return [];
        return [
          {
            text: cleanTextItem(item.str),
            x: item.transform[4] ?? 0,
            y: item.transform[5] ?? 0,
          },
        ];
      })
      .filter((item) => item.text.length > 0)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines: Array<{
      y: number;
      parts: Array<{ text: string; x: number }>;
    }> = [];
    for (const item of items) {
      const current = lines[lines.length - 1];
      if (!current || Math.abs(item.y - current.y) > LINE_Y_TOLERANCE) {
        lines.push({ y: item.y, parts: [item] });
      } else {
        current.parts.push(item);
      }
    }

    for (const line of lines) {
      line.parts.sort((a, b) => a.x - b.x);
      blocks.push({
        pageNumber,
        text: line.parts.map((part) => part.text).join(' '),
        x: line.parts[0]?.x ?? 0,
        y: line.y,
      });
    }
  }
  return blocks;
}

export async function extractPdfText(
  input: Uint8Array,
  options: ExtractPdfOptions = {},
): Promise<PdfExtraction> {
  if (input.byteLength === 0) {
    throw new PdfExtractionError('DAMAGED', userMessage('DAMAGED'));
  }

  ensurePdfWorker();
  const loadingTask = getDocument({
    data: copyBytes(input),
    ...OFFLINE_OPTIONS,
  });
  let pdf: PDFDocumentProxy | undefined;
  try {
    pdf = await loadingTask.promise;
    const blocks = await extractBlocks(pdf);
    if (blocks.length > 0) {
      return { pageCount: pdf.numPages, blocks };
    }
    const recognizeImage = await resolveRecognizer(options.recognizeImage);
    const ocrBlocks = recognizeImage
      ? await ocrPdfPages(pdf, recognizeImage)
      : [];
    if (ocrBlocks.length > 0) {
      return { pageCount: pdf.numPages, blocks: ocrBlocks };
    }
    throw new PdfExtractionError('NO_TEXT_LAYER', userMessage('NO_TEXT_LAYER'));
  } catch (error) {
    throw toError(error, input);
  } finally {
    await pdf?.cleanup();
    await loadingTask.destroy();
  }
}
