import {
  parseResumeCandidates,
  type FieldCandidate,
  type ParseCandidatesResult,
} from './candidates';
import { extractDocxText } from './docx';
import { extractImageText, type ExtractImageOptions } from './image';
import { extractPdfText, type ExtractPdfOptions } from './pdf';
import {
  sourceLinesFromDocx,
  sourceLinesFromPdf,
  type SourceLine,
} from './source';

export class ResumeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeImportError';
  }
}

export interface ParseResumeImportOptions
  extends ExtractPdfOptions, ExtractImageOptions {}

export function isPdfResume(fileName: string, mimeType = ''): boolean {
  return (
    mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
  );
}

export function isDocxResume(fileName: string, mimeType = ''): boolean {
  const name = fileName.toLowerCase();
  return (
    name.endsWith('.docx') ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export function isImageResume(fileName: string, mimeType = ''): boolean {
  return (
    mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(fileName)
  );
}

export interface ResumeImportResult {
  candidates: FieldCandidate[];
  unmapped: SourceLine[];
  fullText: string;
}

export async function parseResumeImportWithText(
  input: Uint8Array,
  fileName: string,
  mimeType = '',
  options: ParseResumeImportOptions = {},
): Promise<ResumeImportResult> {
  let lines: SourceLine[];
  if (isPdfResume(fileName, mimeType)) {
    lines = sourceLinesFromPdf((await extractPdfText(input, options)).blocks);
  } else if (isDocxResume(fileName, mimeType)) {
    lines = sourceLinesFromDocx((await extractDocxText(input)).blocks);
  } else if (isImageResume(fileName, mimeType)) {
    lines = sourceLinesFromPdf((await extractImageText(input, options)).blocks);
  } else {
    throw new ResumeImportError(
      '仅支持 PDF、DOCX 或图片简历（PNG / JPG / WebP）。',
    );
  }
  const parsed = parseResumeCandidates(lines);
  return {
    candidates: parsed.candidates,
    unmapped: parsed.unmapped,
    fullText: lines.map((line) => line.text).join('\n'),
  };
}

export async function parseResumeImport(
  input: Uint8Array,
  fileName: string,
  mimeType = '',
  options: ParseResumeImportOptions = {},
): Promise<ParseCandidatesResult> {
  const { candidates, unmapped } = await parseResumeImportWithText(
    input,
    fileName,
    mimeType,
    options,
  );
  return { candidates, unmapped };
}
