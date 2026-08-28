import { describe, expect, it } from 'vitest';
import type { FieldCandidate } from '../parser/candidates';
import {
  candidatesFromLlm,
  mergeCandidates,
  parseLlmOutput,
} from './parse';

describe('parseLlmOutput', () => {
  it('extracts the JSON object even with surrounding prose', () => {
    const output = parseLlmOutput('这是结果：{"personal":{"fullName":"王申"}}');
    expect(output.personal).toEqual({ fullName: '王申' });
  });

  it('rejects malformed JSON', () => {
    expect(() => parseLlmOutput('not json')).toThrow();
  });
});

describe('candidatesFromLlm', () => {
  it('maps personal fields and repeat modules to field ids', () => {
    const candidates = candidatesFromLlm({
      personal: { fullName: '王申', email: 'a@b.com' },
      educations: [
        { school: '香港城市大学', dateRange: '2026.08 — 2027.06' },
      ],
      skills: [{ name: 'C/C++' }, { name: 'Python' }],
    });
    expect(candidates).toContainEqual(
      expect.objectContaining({
        fieldId: 'personal.fullName',
        recordKey: 'personal',
        value: { kind: 'text', value: '王申' },
      }),
    );
    expect(candidates).toContainEqual(
      expect.objectContaining({
        fieldId: 'education.school',
        recordKey: 'education:0',
        value: { kind: 'text', value: '香港城市大学' },
      }),
    );
    const range = candidates.find(
      (item) => item.fieldId === 'education.dateRange',
    );
    expect(range?.value).toEqual({
      kind: 'dateRange',
      value: {
        start: { precision: 'month', year: 2026, month: 8 },
        end: { precision: 'month', year: 2027, month: 6 },
        ongoing: false,
      },
    });
    expect(
      candidates.filter((item) => item.fieldId === 'skill.name'),
    ).toHaveLength(2);
  });

  it('skips unknown field ids and empty values', () => {
    const candidates = candidatesFromLlm({
      personal: { fullName: '', bogusField: 'x' },
    });
    expect(candidates).toHaveLength(0);
  });
});

describe('mergeCandidates', () => {
  const rule: FieldCandidate[] = [
    {
      fieldId: 'personal.email',
      value: { kind: 'text', value: 'a@b.com' },
      confidence: 'high',
      recordKey: 'personal',
      source: { lineId: 'line:0', text: 'a@b.com' },
    },
  ];

  it('deduplicates identical values across rule and llm candidates', () => {
    const llm: FieldCandidate[] = [
      {
        fieldId: 'personal.email',
        value: { kind: 'text', value: 'a@b.com' },
        confidence: 'medium',
        recordKey: 'personal',
        source: { lineId: 'llm:x', text: 'a@b.com' },
      },
      {
        fieldId: 'skill.name',
        value: { kind: 'text', value: 'Python' },
        confidence: 'medium',
        recordKey: 'skill:0',
        source: { lineId: 'llm:y', text: 'Python' },
      },
    ];
    const merged = mergeCandidates(rule, llm);
    expect(merged).toHaveLength(2);
    expect(
      merged.filter((item) => item.fieldId === 'personal.email'),
    ).toHaveLength(1);
    expect(
      merged.find((item) => item.fieldId === 'skill.name')?.confidence,
    ).toBe('medium');
  });
});
