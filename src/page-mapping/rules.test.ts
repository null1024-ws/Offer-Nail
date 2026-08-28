/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { collectPageFields } from './collector';
import {
  applySiteRules,
  pageSignatureOf,
  rememberFieldMapping,
  ruleContainsResumeValue,
} from './rules';
import { scorePageFields } from './scorer';

const fixtureHtml = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../tests/fixtures/forms/application-form.html',
  ),
  'utf8',
);

function loadCollection() {
  return collectPageFields(
    new JSDOM(fixtureHtml, {
      runScripts: 'dangerously',
      url: 'http://127.0.0.1:4173/application-form.html',
    }).window.document,
  );
}

describe('site mapping rules', () => {
  it('reuses a user correction on the same page and never stores resume values', () => {
    const collection = loadCollection();
    const nameField = collection.fields.find(
      (field) => field.name === 'fullName',
    )!;
    const rule = rememberFieldMapping({
      collection,
      fingerprint: nameField.fingerprint,
      targetFieldId: 'personal.englishName',
      transform: 'identity',
    });
    expect(
      ruleContainsResumeValue(rule, [
        '张三',
        'already@example.com',
        '13800138000',
      ]),
    ).toBe(false);
    expect(rule.origin).toBe('http://127.0.0.1:4173');
    expect(rule.pageSignature).toBe(pageSignatureOf(collection));

    const rescored = applySiteRules(
      scorePageFields(collection),
      [rule],
      collection,
    );
    const mapped = rescored.find(
      (entry) => entry.source.fingerprint === nameField.fingerprint,
    );
    expect(mapped?.autoSelected?.fieldId).toBe('personal.englishName');
    expect(mapped?.autoSelected?.reasons[0]).toContain('复用网站规则');
  });

  it('does not silently force a stale rule after the page structure changes', () => {
    const collection = loadCollection();
    const nameField = collection.fields.find(
      (field) => field.name === 'fullName',
    )!;
    const rule = rememberFieldMapping({
      collection,
      fingerprint: nameField.fingerprint,
      targetFieldId: 'personal.englishName',
      transform: 'identity',
    });
    const changed = {
      ...collection,
      fields: collection.fields.filter((field) => field.name !== 'summary'),
    };
    expect(pageSignatureOf(changed)).not.toBe(rule.pageSignature);

    const applied = applySiteRules(scorePageFields(changed), [rule], changed);
    const mapped = applied.find(
      (entry) => entry.source.fingerprint === nameField.fingerprint,
    );
    expect(mapped?.autoSelected?.fieldId).not.toBe('personal.englishName');
    expect(mapped?.candidates[0]?.reasons[0]).toContain('页面结构已变化');
  });
});
