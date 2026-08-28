import { createWorker } from 'tesseract.js';
import { extensionAssetUrl, type OcrImageSource } from './ocr-runtime';

export type { OcrImageSource } from './ocr-runtime';
export { isLocalOcrAvailable } from './ocr-runtime';

export async function recognizeLocalImage(
  image: OcrImageSource,
): Promise<string> {
  const workerPath = extensionAssetUrl('/tesseract/worker.min.js');
  const corePath = extensionAssetUrl(
    '/tesseract/tesseract-core-simd-lstm.wasm.js',
  );
  const langPath = extensionAssetUrl('/tessdata');
  if (!workerPath || !corePath || !langPath) {
    throw new Error('当前环境无法进行本地文字识别');
  }

  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    workerPath,
    corePath,
    langPath,
    workerBlobURL: false,
    gzip: false,
    cacheMethod: 'none',
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
  }
}
