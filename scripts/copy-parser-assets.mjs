import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function ensureDir(to) {
  mkdirSync(dirname(to), { recursive: true });
}

function copyBinary(from, to) {
  if (!existsSync(from)) {
    throw new Error(`缺少解析资源：${from}`);
  }
  ensureDir(to);
  copyFileSync(from, to);
}

function copyScript(from, to) {
  if (!existsSync(from)) {
    throw new Error(`缺少解析资源：${from}`);
  }
  const source = readFileSync(from, 'utf8')
    .replace(/\n?\/\/[#@]\s*sourceMappingURL=.*$/gm, '')
    .replace(/\n?\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//g, '');
  ensureDir(to);
  writeFileSync(to, source);
}

copyScript(
  join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
  join(root, 'public/pdf.worker.min.mjs'),
);

const tesseractDir = dirname(require.resolve('tesseract.js/package.json'));
copyScript(
  join(tesseractDir, 'dist/worker.min.js'),
  join(root, 'public/tesseract/worker.min.js'),
);

const coreDir = dirname(
  require.resolve('tesseract.js-core/package.json', { paths: [tesseractDir] }),
);
copyScript(
  join(coreDir, 'tesseract-core-simd-lstm.wasm.js'),
  join(root, 'public/tesseract/tesseract-core-simd-lstm.wasm.js'),
);
copyBinary(
  join(coreDir, 'tesseract-core-simd-lstm.wasm'),
  join(root, 'public/tesseract/tesseract-core-simd-lstm.wasm'),
);

for (const name of ['eng.traineddata', 'chi_sim.traineddata']) {
  copyBinary(
    join(root, 'vendor/tessdata', name),
    join(root, 'public/tessdata', name),
  );
}
