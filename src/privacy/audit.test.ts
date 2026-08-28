/** @vitest-environment node */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectPageFields } from '../page-mapping/collector';
import { scorePageFields } from '../page-mapping/scorer';
import { rememberFieldMapping } from '../page-mapping/rules';
import { parseResumeCandidates } from '../parser';
import { resumeTextFixture } from '../parser/__fixtures__/resume-text';
import { sourceLinesFromText } from '../parser/source';
import {
  applyFill,
  buildFillPreview,
  selectedInstructions,
} from '../fill-engine';
import {
  loadFixtureDocument,
  seededResume,
} from '../fill-engine/__fixtures__/form-fixture';
import { encryptVault, decryptVault } from '../vault/crypto';
import {
  ALLOWED_CONTENT_SCRIPT_MATCHES,
  ALLOWED_PERMISSIONS,
  ALLOWED_RUNTIME_DEPENDENCIES,
  FORBIDDEN_DEPENDENCY_HINTS,
  FORBIDDEN_PERMISSIONS,
} from './policy';

const NETWORK_CALL_PATTERN =
  /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\s*\(/;

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    if (!entry.isFile()) return [];
    return [path];
  });
}

function productionSources(): string[] {
  return [
    ...walkFiles(join(root, 'src')),
    ...walkFiles(join(root, 'entrypoints')),
  ].filter((path) => {
    const extension = extname(path);
    if (!['.ts', '.tsx', '.js', '.css', '.html'].includes(extension)) {
      return false;
    }
    return (
      !path.includes('.test.') && !path.includes(`${sep}__fixtures__${sep}`)
    );
  });
}

function readManifest(browser: 'chrome-mv3' | 'edge-mv3') {
  const path = join(root, '.output', browser, 'manifest.json');
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as {
    permissions?: string[];
    host_permissions?: string[];
    optional_host_permissions?: string[];
    content_scripts?: Array<{ matches: string[] }>;
  };
}

describe('privacy audit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps extension permissions minimal and localhost-only for content scripts', () => {
    const config = readFileSync(join(root, 'wxt.config.ts'), 'utf8');
    expect(config).toContain(
      "permissions: ['activeTab', 'scripting', 'storage']",
    );
    expect(config).not.toContain('host_permissions');
    expect(config).not.toContain('<all_urls>');

    const packageJson = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(
      [...ALLOWED_RUNTIME_DEPENDENCIES].sort(),
    );
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(
        (packageJson as { devDependencies?: Record<string, string> })
          .devDependencies ?? {},
      ),
    ].join(' ');
    FORBIDDEN_DEPENDENCY_HINTS.forEach((hint) => {
      expect(dependencyNames).not.toContain(hint);
    });

    (['chrome-mv3', 'edge-mv3'] as const).forEach((browser) => {
      const manifest = readManifest(browser);
      if (!manifest) return;
      expect(manifest.permissions).toEqual([...ALLOWED_PERMISSIONS]);
      expect(manifest.host_permissions ?? []).toEqual([]);
      expect(manifest.optional_host_permissions ?? []).toEqual([]);
      FORBIDDEN_PERMISSIONS.forEach((permission) => {
        expect(manifest.permissions ?? []).not.toContain(permission);
      });
      const matches =
        manifest.content_scripts?.flatMap((script) => script.matches) ?? [];
      expect([...matches].sort()).toEqual(
        [...ALLOWED_CONTENT_SCRIPT_MATCHES].sort(),
      );
    });
  });

  it('does not ship production network clients or resume values in logs/rules', () => {
    const secrets = [
      '张三',
      '13800138000',
      'zhangsan@example.com',
      'correct horse battery staple',
    ];
    productionSources().forEach((path) => {
      let source: string;
      try {
        source = readFileSync(path, 'utf8');
      } catch {
        return;
      }
      expect(source, path).not.toMatch(NETWORK_CALL_PATTERN);
      secrets.forEach((secret) => {
        expect(source, path).not.toContain(secret);
      });
    });

    const document = loadFixtureDocument();
    const collection = collectPageFields(document);
    const nameField = collection.fields.find(
      (field) => field.name === 'fullName',
    )!;
    const rule = rememberFieldMapping({
      collection,
      fingerprint: nameField.fingerprint,
      targetFieldId: 'personal.fullName',
      transform: 'identity',
    });
    const serialized = JSON.stringify(rule);
    secrets.forEach((secret) => {
      expect(serialized).not.toContain(secret);
    });
  });

  it('runs vault, parse, preview and fill while fetch is blocked', async () => {
    const fetch = vi.fn(() => {
      throw new Error('network should not be used');
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        open(): void {
          throw new Error('network should not be used');
        }
      },
    );

    const payload = { name: '张三', phone: '13800138000' };
    const vault = await encryptVault(payload, 'correct horse battery staple', {
      iterations: 1_000,
    });
    await expect(
      decryptVault(vault, 'correct horse battery staple'),
    ).resolves.toEqual(payload);

    const parsed = parseResumeCandidates(
      sourceLinesFromText(resumeTextFixture),
    );
    expect(
      parsed.candidates.some((item) => item.fieldId === 'personal.fullName'),
    ).toBe(true);

    const document = loadFixtureDocument();
    const collection = collectPageFields(document);
    const items = buildFillPreview(
      scorePageFields(collection),
      seededResume(),
      collection,
    );
    applyFill(document, selectedInstructions(items));
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
    expect(fetch).not.toHaveBeenCalled();
  });
});
