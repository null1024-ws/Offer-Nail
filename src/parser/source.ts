import type { DocxTextBlock } from './docx';
import type { PdfTextBlock } from './pdf';

export interface SourceLine {
  id: string;
  text: string;
}

export function sourceLinesFromText(text: string): SourceLine[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ id: `line:${index}`, text: line.trim() }))
    .filter((line) => line.text.length > 0);
}

export function sourceLinesFromPdf(blocks: PdfTextBlock[]): SourceLine[] {
  return blocks
    .map((block, index) => ({
      id: `pdf:${block.pageNumber}:${index}`,
      text: block.text.trim(),
    }))
    .filter((line) => line.text.length > 0);
}

export function sourceLinesFromDocx(blocks: DocxTextBlock[]): SourceLine[] {
  return blocks
    .map((block, index) => ({
      id: `docx:${index}`,
      text: block.text.trim(),
    }))
    .filter((line) => line.text.length > 0);
}
