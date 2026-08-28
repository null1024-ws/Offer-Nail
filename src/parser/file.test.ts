import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { parseResumeImport } from './file';

async function namedPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText('Alice Chen', { x: 72, y: 720, size: 18, font });
  return document.save({ useObjectStreams: false });
}

describe('parseResumeImport', () => {
  it('parses a text PDF into resume candidates', async () => {
    const parsed = await parseResumeImport(
      await namedPdf(),
      'resume.pdf',
      'application/pdf',
    );
    expect(
      parsed.unmapped.some((line) => line.text.includes('Alice Chen')),
    ).toBe(true);
  });

  it('parses an image resume through local OCR results', async () => {
    const parsed = await parseResumeImport(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      'resume.png',
      'image/png',
      {
        recognizeImage: async () => '李四\nperson@example.com',
      },
    );
    expect(
      parsed.candidates.some(
        (candidate) => candidate.fieldId === 'personal.fullName',
      ),
    ).toBe(true);
    expect(
      parsed.candidates.some(
        (candidate) => candidate.fieldId === 'personal.email',
      ),
    ).toBe(true);
  });

  it('rejects unsupported file types', async () => {
    await expect(
      parseResumeImport(new Uint8Array([1]), 'notes.txt', 'text/plain'),
    ).rejects.toMatchObject({
      name: 'ResumeImportError',
    });
  });
});
