import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfText } from './pdf';

async function textPdf(pages: string[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  pages.forEach((text) => {
    const page = document.addPage([612, 792]);
    page.drawText(text, { x: 72, y: 720, size: 18, font });
  });
  return document.save({ useObjectStreams: false });
}

async function blankPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save({ useObjectStreams: false });
}

function withEncryptDictionary(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder('latin1').decode(bytes);
  const patched = text.replace(
    /\/Root \d+ 0 R/,
    (match) => `${match} /Encrypt 1 0 R`,
  );
  const encoded = new Uint8Array(patched.length);
  for (let index = 0; index < patched.length; index += 1) {
    encoded[index] = patched.charCodeAt(index);
  }
  return encoded;
}

describe('extractPdfText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('extracts traceable text blocks from a multi-page PDF without network access', async () => {
    const fetch = vi.fn(() => {
      throw new Error('network should not be used');
    });
    vi.stubGlobal('fetch', fetch);

    const bytes = await textPdf(['Page 1 Alice', 'Page 2 Education']);
    const result = await extractPdfText(bytes);

    expect(result.pageCount).toBe(2);
    expect(result.blocks.map((block) => block.pageNumber)).toEqual([1, 2]);
    expect(result.blocks[0]).toMatchObject({
      text: 'Page 1 Alice',
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(result.blocks[1]?.text).toContain('Education');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns distinct actionable errors for scanned, protected, and damaged PDFs', async () => {
    await expect(extractPdfText(await blankPdf())).rejects.toMatchObject({
      code: 'NO_TEXT_LAYER',
      message: expect.stringContaining('扫描件'),
    });

    await expect(
      extractPdfText(withEncryptDictionary(await textPdf(['locked']))),
    ).rejects.toMatchObject({
      code: 'PASSWORD_PROTECTED',
      message: expect.stringContaining('密码'),
    });

    await expect(
      extractPdfText((await textPdf(['broken'])).slice(0, 24)),
    ).rejects.toMatchObject({
      code: 'DAMAGED',
      message: expect.stringContaining('损坏'),
    });
  });
});
