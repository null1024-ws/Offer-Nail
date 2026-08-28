import mammoth from 'mammoth';

export type DocxExtractionErrorCode = 'EMPTY' | 'DAMAGED' | 'UNSUPPORTED';

export class DocxExtractionError extends Error {
  constructor(
    readonly code: DocxExtractionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocxExtractionError';
  }
}

export interface DocxTextBlock {
  kind: 'heading' | 'paragraph' | 'list-item' | 'table-cell';
  text: string;
  level?: number;
  tableIndex?: number;
  row?: number;
  column?: number;
}

export interface DocxExtraction {
  blocks: DocxTextBlock[];
}

function mammothInput(input: Uint8Array): {
  arrayBuffer: ArrayBuffer;
  buffer?: Uint8Array;
} {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const nodeBuffer = (
    globalThis as { Buffer?: { from(data: Uint8Array): Uint8Array } }
  ).Buffer;
  return {
    arrayBuffer: copy.buffer,
    ...(nodeBuffer ? { buffer: nodeBuffer.from(copy) } : {}),
  };
}

function userMessage(code: DocxExtractionErrorCode): string {
  if (code === 'EMPTY') {
    return '这份 DOCX 没有可提取的文本。文件不会被保留。';
  }
  if (code === 'UNSUPPORTED') {
    return '这份文件不是支持的 DOCX 结构。文件不会被保留。';
  }
  return '这份 DOCX 已损坏或无法读取。文件不会被保留。';
}

function looksLikePdf(input: Uint8Array): boolean {
  return (
    input.byteLength >= 5 &&
    new TextDecoder('latin1').decode(input.slice(0, 5)) === '%PDF-'
  );
}

function looksLikeZip(input: Uint8Array): boolean {
  return (
    input.byteLength >= 4 &&
    input[0] === 0x50 &&
    input[1] === 0x4b &&
    input[2] === 0x03 &&
    input[3] === 0x04
  );
}

function blocksFromHtml(html: string): DocxTextBlock[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks: DocxTextBlock[] = [];
  let tableIndex = 0;

  const visit = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (/^h[1-6]$/.test(tag) && text) {
      blocks.push({
        kind: 'heading',
        text,
        level: Number(tag.slice(1)),
      });
      return;
    }
    if (tag === 'p' && text) {
      blocks.push({ kind: 'paragraph', text });
      return;
    }
    if (tag === 'li' && text) {
      blocks.push({ kind: 'list-item', text });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      Array.from(node.children).forEach((child) => visit(child));
      return;
    }
    if (tag === 'table') {
      const currentTable = tableIndex;
      tableIndex += 1;
      Array.from(node.querySelectorAll('tr')).forEach((row, rowIndex) => {
        Array.from(row.querySelectorAll('th,td')).forEach((cell, column) => {
          const cellText = cell.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          if (!cellText) return;
          blocks.push({
            kind: 'table-cell',
            text: cellText,
            tableIndex: currentTable,
            row: rowIndex,
            column,
          });
        });
      });
      return;
    }
    Array.from(node.children).forEach((child) => visit(child));
  };

  Array.from(parsed.body.children).forEach((child) => visit(child));
  return blocks;
}

export async function extractDocxText(
  input: Uint8Array,
): Promise<DocxExtraction> {
  if (input.byteLength === 0 || looksLikePdf(input)) {
    throw new DocxExtractionError(
      input.byteLength === 0 ? 'EMPTY' : 'UNSUPPORTED',
      userMessage(input.byteLength === 0 ? 'EMPTY' : 'UNSUPPORTED'),
    );
  }
  if (!looksLikeZip(input)) {
    throw new DocxExtractionError('DAMAGED', userMessage('DAMAGED'));
  }

  try {
    const result = await mammoth.convertToHtml(mammothInput(input), {
      externalFileAccess: false,
    });
    const blocks = blocksFromHtml(result.value);
    if (blocks.length === 0) {
      throw new DocxExtractionError('EMPTY', userMessage('EMPTY'));
    }
    return { blocks };
  } catch (error) {
    if (error instanceof DocxExtractionError) throw error;
    throw new DocxExtractionError('DAMAGED', userMessage('DAMAGED'));
  }
}
