import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyResumeData } from '../domain/resume';
import { extractDocxText } from './docx';

async function sampleResume(): Promise<Uint8Array> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun('Education')],
          }),
          new Paragraph({ children: [new TextRun('Tsinghua University')] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph('School')],
                  }),
                  new TableCell({
                    children: [new Paragraph('Major')],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph('Tsinghua')],
                  }),
                  new TableCell({
                    children: [new Paragraph('Software')],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}

describe('extractDocxText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('extracts headings, paragraphs, and table cells in document order', async () => {
    const fetch = vi.fn(() => {
      throw new Error('network should not be used');
    });
    vi.stubGlobal('fetch', fetch);

    const result = await extractDocxText(await sampleResume());
    expect(result.blocks.map((block) => [block.kind, block.text])).toEqual([
      ['heading', 'Education'],
      ['paragraph', 'Tsinghua University'],
      ['table-cell', 'School'],
      ['table-cell', 'Major'],
      ['table-cell', 'Tsinghua'],
      ['table-cell', 'Software'],
    ]);
    expect(result.blocks[2]).toMatchObject({
      tableIndex: 0,
      row: 0,
      column: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects empty, unsupported, and damaged files without changing existing profiles', async () => {
    const profile = createEmptyResumeData();
    const snapshot = structuredClone(profile);

    await expect(extractDocxText(new Uint8Array())).rejects.toMatchObject({
      code: 'EMPTY',
    });
    await expect(
      extractDocxText(new TextEncoder().encode('%PDF-1.4')),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED',
      message: expect.stringContaining('不是支持的 DOCX'),
    });
    await expect(
      extractDocxText(new TextEncoder().encode('not-a-docx')),
    ).rejects.toMatchObject({
      code: 'DAMAGED',
      message: expect.stringContaining('损坏'),
    });

    expect(profile).toEqual(snapshot);
  });
});
