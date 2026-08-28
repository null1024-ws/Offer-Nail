import { isLocalOcrAvailable, type OcrImageSource } from './ocr-runtime';
import type { PdfTextBlock } from './pdf';

export type ImageExtractionErrorCode = 'EMPTY' | 'UNSUPPORTED';

export class ImageExtractionError extends Error {
  constructor(
    readonly code: ImageExtractionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImageExtractionError';
  }
}

export interface ImageExtraction {
  pageCount: 1;
  blocks: PdfTextBlock[];
}

export interface ExtractImageOptions {
  recognizeImage?: (image: OcrImageSource) => Promise<string>;
}

function copyBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy;
}

async function resolveRecognizer(
  provided?: ExtractImageOptions['recognizeImage'],
): Promise<ExtractImageOptions['recognizeImage'] | undefined> {
  if (provided) return provided;
  if (!isLocalOcrAvailable()) return undefined;
  const { recognizeLocalImage } = await import('./ocr');
  return recognizeLocalImage;
}

export async function extractImageText(
  input: Uint8Array,
  options: ExtractImageOptions = {},
): Promise<ImageExtraction> {
  if (input.byteLength === 0) {
    throw new ImageExtractionError(
      'EMPTY',
      '图片为空，无法识别文字。文件不会被保留。',
    );
  }

  const recognizeImage = await resolveRecognizer(options.recognizeImage);
  if (!recognizeImage) {
    throw new ImageExtractionError(
      'UNSUPPORTED',
      '当前环境无法识别图片简历。文件不会被保留。',
    );
  }

  const text = await recognizeImage(new Blob([copyBytes(input)]));
  const blocks = text
    .split(/\r?\n/)
    .map((line, index) => ({
      pageNumber: 1 as const,
      text: line.trim(),
      x: 0,
      y: index,
    }))
    .filter((block) => block.text.length > 0);

  if (blocks.length === 0) {
    throw new ImageExtractionError(
      'EMPTY',
      '未能从这张图片中识别出文字。请换更清晰的文件或改为手动录入。文件不会被保留。',
    );
  }

  return { pageCount: 1, blocks };
}
