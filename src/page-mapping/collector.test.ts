/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { collectPageFields } from './collector';

const fixtureHtml = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../tests/fixtures/forms/application-form.html',
  ),
  'utf8',
);

function loadFixture() {
  return new JSDOM(fixtureHtml, {
    runScripts: 'dangerously',
    url: 'http://127.0.0.1:4173/application-form.html',
  }).window.document;
}

describe('collectPageFields', () => {
  it('collects visible interactive fixture fields including open shadow', () => {
    const collection = collectPageFields(loadFixture());
    const byName = Object.fromEntries(
      collection.fields.map((field) => [field.name || field.idAttr, field]),
    );

    expect(byName.fullName?.kind).toBe('text');
    expect(byName.fullName?.label).toContain('姓名');
    expect(byName.phone?.label).toContain('手机号码');
    expect(byName.email?.currentValue).toBe('already@example.com');
    expect(byName.summary?.kind).toBe('textarea');
    expect(byName.summary?.kind).toBe('textarea');
    expect(byName.gender?.kind).toBe('radio');
    expect(byName.gender?.options).toEqual(['男', '女']);
    expect(byName.acceptRemote?.kind).toBe('checkbox');
    expect(byName.birthDate?.kind).toBe('date');
    expect(byName.currentCity?.kind).toBe('text');
    expect(byName.school?.group).toContain('教育经历');
    expect(byName.educationLevel?.kind).toBe('select');
    expect(byName.educationLevel?.options).toEqual(
      expect.arrayContaining(['本科', '硕士']),
    );
    expect(byName['company[]']?.currentValue).toBe('示例科技有限公司');
    expect(byName['position[]']?.currentValue).toBe('前端实习生');
    expect(byName.github?.inShadow).toBe(true);
    expect(byName.github?.label).toContain('GitHub');
  });

  it('skips hidden, disabled, and submit controls and does not copy large page text', () => {
    const collection = collectPageFields(loadFixture());
    const names = collection.fields.map((field) => field.name);

    expect(names).not.toContain('hiddenName');
    expect(names).not.toContain('csrf');
    expect(names).not.toContain('identityDocument');
    expect(collection.fields.some((field) => field.type === 'submit')).toBe(
      false,
    );
    expect(collection.pageTextSample).not.toContain('csrf-token');
    expect(collection.pageTextSample).not.toContain('不应采集');
    expect(collection.pageTextSample.length).toBeLessThanOrEqual(240);
    expect(collection.inaccessible.map((region) => region.reason)).toEqual(
      expect.arrayContaining(['unsupported', 'closedShadow']),
    );
  });
});
