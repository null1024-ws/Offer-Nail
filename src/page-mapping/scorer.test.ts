/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { collectPageFields, type CollectedField } from './collector';
import { scoreCollectedField, scorePageFields } from './scorer';
import { detectValueFormat, normalizeMappedValue } from './normalize';
import { fixtureFieldExpectations } from '../../tests/fixtures/forms/expected-mapping';

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

function collected(override: Partial<CollectedField>): CollectedField {
  return {
    id: 'field:test',
    kind: 'text',
    tagName: 'input',
    type: 'text',
    name: '',
    idAttr: '',
    label: '',
    autocomplete: '',
    nearbyText: '',
    group: '',
    options: [],
    currentValue: '',
    required: false,
    inShadow: false,
    fingerprint: 'test',
    ...override,
  };
}

describe('normalizeMappedValue', () => {
  it('normalizes email, phone, boolean and url values', () => {
    expect(normalizeMappedValue('  A@Example.COM ', 'email')).toEqual({
      value: 'a@example.com',
      transform: 'email',
    });
    expect(normalizeMappedValue('138 0013 8000', 'phone')).toEqual({
      value: '13800138000',
      transform: 'phone',
    });
    expect(normalizeMappedValue('是', 'boolean')).toEqual({
      value: 'true',
      transform: 'boolean',
    });
    expect(
      normalizeMappedValue('github.com/zhangsan', 'github').transform,
    ).toBe('url');
    expect(detectValueFormat('already@example.com', 'text')).toBe('email');
  });
});

describe('scorePageFields', () => {
  it('maps distinctive fixture fields with high confidence', () => {
    const scored = scorePageFields(collectPageFields(loadFixture()));
    const expected = fixtureFieldExpectations.filter(
      (item) => item.expectedFieldId,
    );
    const hits = expected.filter((item) => {
      const match = scored.find((entry) =>
        labelsMatch(entry.source.label, item.label),
      );
      return match?.autoSelected?.fieldId === item.expectedFieldId;
    });
    expect(hits.length / expected.length).toBe(1);
    expect(
      scored.find((entry) => entry.source.label === '学校名称')?.candidates[0]
        ?.reasons.length,
    ).toBeGreaterThan(0);
  });

  it('does not map school and company across modules', () => {
    const school = scoreCollectedField(
      collected({
        label: '学校名称',
        group: '教育经历',
        name: 'school',
      }),
    );
    const company = scoreCollectedField(
      collected({
        label: '公司名称',
        group: '工作经历',
        name: 'company',
      }),
    );
    expect(school.autoSelected?.fieldId).toBe('education.school');
    expect(school.candidates.map((item) => item.fieldId)).not.toContain(
      'employment.company',
    );
    expect(company.autoSelected?.fieldId).toBe('employment.company');
    expect(company.candidates[0]?.fieldId).not.toBe('education.school');
  });

  it('keeps ambiguous labels in confirmation instead of auto-selecting', () => {
    const scored = scoreCollectedField(
      collected({
        label: '名称',
        group: '教育经历',
        name: 'title',
      }),
    );
    expect(scored.autoSelected).toBeUndefined();
    expect(scored.candidates[0]?.confidence).not.toBe('high');
  });

  it('does not map an unlabeled textarea to summary or description', () => {
    const scored = scoreCollectedField(
      collected({
        kind: 'textarea',
        tagName: 'textarea',
        type: 'textarea',
        label: '',
      }),
    );
    expect(scored.candidates).toHaveLength(0);
    expect(scored.autoSelected).toBeUndefined();
  });

  it('maps autocomplete hints even without a visible label', () => {
    const scored = scoreCollectedField(
      collected({ label: '', autocomplete: 'tel' }),
    );
    expect(scored.candidates[0]?.fieldId).toBe('personal.phone');
    expect(scored.candidates[0]?.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('autocomplete')]),
    );
  });

  it('maps Didi-style titles recovered from sibling elements', () => {
    const gender = scoreCollectedField(collected({ label: '性别' }));
    expect(gender.candidates[0]?.fieldId).toBe('personal.gender');

    const duty = scoreCollectedField(
      collected({
        label: '工作职责',
        kind: 'textarea',
        tagName: 'textarea',
        type: 'textarea',
      }),
    );
    expect(duty.autoSelected?.fieldId).toBe('employment.description');

    const summary = scoreCollectedField(
      collected({
        label: '自我描述',
        kind: 'textarea',
        tagName: 'textarea',
        type: 'textarea',
      }),
    );
    expect(summary.autoSelected?.fieldId).toBe('personal.summary');
  });
});

function labelsMatch(source: string, expected: string): boolean {
  return source === expected || source.includes(expected);
}
