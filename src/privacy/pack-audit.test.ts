/** @vitest-environment node */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CONTENT_SCRIPT_MATCHES,
  ALLOWED_PERMISSIONS,
  FORBIDDEN_PERMISSIONS,
} from './policy';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const FORBIDDEN_PACK_MARKERS = [
  '张三',
  '13800138000',
  'zhangsan@example.com',
  'already@example.com',
  'secret-id',
  'csrf-token',
  'BEGIN PRIVATE KEY',
  'application-form.html',
];

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    if (!entry.isFile()) return [];
    return [path];
  });
}

function auditPack(directory: string) {
  const files = walkFiles(directory);
  expect(files.length).toBeGreaterThan(0);
  expect(files.some((path) => path.endsWith('.map'))).toBe(false);
  expect(
    files.some((path) =>
      ['credentials.json', '.env', '.env.local'].includes(
        path.split(/[/\\]/).pop() ?? '',
      ),
    ),
  ).toBe(false);

  const manifest = JSON.parse(
    readFileSync(join(directory, 'manifest.json'), 'utf8'),
  ) as {
    permissions?: string[];
    host_permissions?: string[];
    content_scripts?: Array<{ matches: string[] }>;
  };
  expect(manifest.permissions).toEqual([...ALLOWED_PERMISSIONS]);
  expect(manifest.host_permissions ?? []).toEqual([]);
  FORBIDDEN_PERMISSIONS.forEach((permission) => {
    expect(manifest.permissions ?? []).not.toContain(permission);
  });
  expect(
    manifest.content_scripts?.flatMap((script) => script.matches).sort(),
  ).toEqual([...ALLOWED_CONTENT_SCRIPT_MATCHES].sort());

  files
    .filter((path) => ['.js', '.css', '.html', '.json'].includes(extname(path)))
    .forEach((path) => {
      const source = readFileSync(path, 'utf8');
      FORBIDDEN_PACK_MARKERS.forEach((marker) => {
        expect(source, path).not.toContain(marker);
      });
      expect(source, path).not.toContain('sourceMappingURL');
    });
}

describe('trial pack audit', () => {
  it('keeps Chrome and Edge production packs free of secrets, fixtures and extra permissions', () => {
    const chromeDir = join(root, '.output', 'chrome-mv3');
    const edgeDir = join(root, '.output', 'edge-mv3');
    if (!existsSync(chromeDir) || !existsSync(edgeDir)) {
      throw new Error('请先运行 corepack pnpm build 与 build:edge');
    }
    auditPack(chromeDir);
    auditPack(edgeDir);
    const chromeZip = join(root, '.output', 'offer-nail-0.1.0-chrome.zip');
    const edgeZip = join(root, '.output', 'offer-nail-0.1.0-edge.zip');
    [chromeZip, edgeZip].forEach((zipPath) => {
      if (!existsSync(zipPath)) return;
      const bytes = readFileSync(zipPath);
      expect(bytes.includes(Buffer.from('application-form.html'))).toBe(false);
      expect(bytes.includes(Buffer.from('.env'))).toBe(false);
    });
  });
});
