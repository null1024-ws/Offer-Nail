import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

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
    return '这份 PDF 可能是扫描件，当前不支持 OCR，请改为手动录入。文件不会被保留。';
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

async function extractBlocks(
  document: PDFDocumentProxy,
): Promise<PdfTextBlock[]> {
  const blocks: PdfTextBlock[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    content.items.forEach((item) => {
      if (!('str' in item) || !('transform' in item)) return;
      const text = item.str.trim();
      if (!text) return;
      blocks.push({
        pageNumber,
        text,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
      });
    });
  }
  return blocks;
}

export async function extractPdfText(
  input: Uint8Array,
): Promise<PdfExtraction> {
  if (input.byteLength === 0) {
    throw new PdfExtractionError('DAMAGED', userMessage('DAMAGED'));
  }

  const loadingTask = getDocument({
    data: copyBytes(input),
    ...OFFLINE_OPTIONS,
  });
  let pdf: PDFDocumentProxy | undefined;
  try {
    pdf = await loadingTask.promise;
    const blocks = await extractBlocks(pdf);
    if (blocks.length === 0) {
      throw new PdfExtractionError(
        'NO_TEXT_LAYER',
        userMessage('NO_TEXT_LAYER'),
      );
    }
    return { pageCount: pdf.numPages, blocks };
  } catch (error) {
    throw toError(error, input);
  } finally {
    await pdf?.cleanup();
    await loadingTask.destroy();
  }
}
