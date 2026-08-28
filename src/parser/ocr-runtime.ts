export type OcrImageSource = Blob | File | HTMLCanvasElement;

function runtimeGetUrl(): ((path: string) => string) | undefined {
  const runtime =
    (
      globalThis as {
        browser?: { runtime?: { getURL?: (value: string) => string } };
        chrome?: { runtime?: { getURL?: (value: string) => string } };
      }
    ).browser?.runtime ??
    (
      globalThis as {
        chrome?: { runtime?: { getURL?: (value: string) => string } };
      }
    ).chrome?.runtime;
  return runtime?.getURL?.bind(runtime);
}

export function extensionAssetUrl(path: string): string | undefined {
  try {
    return runtimeGetUrl()?.(path);
  } catch {
    return undefined;
  }
}

export function isLocalOcrAvailable(): boolean {
  return Boolean(extensionAssetUrl('/tesseract/worker.min.js'));
}
