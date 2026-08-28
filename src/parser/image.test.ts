import { describe, expect, it } from 'vitest';
import { extractImageText } from './image';

describe('extractImageText', () => {
  it('turns recognized lines into source blocks', async () => {
    const result = await extractImageText(new Uint8Array([1, 2, 3]), {
      recognizeImage: async () => 'Alice Chen\nTsinghua University',
    });
    expect(result.pageCount).toBe(1);
    expect(result.blocks.map((block) => block.text)).toEqual([
      'Alice Chen',
      'Tsinghua University',
    ]);
  });

  it('rejects empty images and empty OCR results', async () => {
    await expect(extractImageText(new Uint8Array())).rejects.toMatchObject({
      code: 'EMPTY',
    });
    await expect(
      extractImageText(new Uint8Array([1]), {
        recognizeImage: async () => '   \n',
      }),
    ).rejects.toMatchObject({ code: 'EMPTY' });
  });
});
