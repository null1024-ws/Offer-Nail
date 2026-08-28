import { describe, expect, it } from 'vitest';
import { createEmptyResumeData } from '../domain/resume';
import { parseResumeCandidates } from './candidates';
import { resumeTextFixture } from './__fixtures__/resume-text';
import { applyConfirmedCandidates, existingFieldValue } from './merge';
import { sourceLinesFromText } from './source';
import type { FieldCandidate } from './candidates';

function candidate(
  fieldId: FieldCandidate['fieldId'],
  value: FieldCandidate['value'],
  recordKey = 'personal',
): FieldCandidate {
  return {
    fieldId,
    value,
    confidence: 'high',
    recordKey,
    source: { lineId: 'line:0', text: 'source' },
  };
}

describe('applyConfirmedCandidates', () => {
  it('writes only selected fields and leaves ignored candidates unchanged', () => {
    const source = createEmptyResumeData();
    const parsed = parseResumeCandidates(
      sourceLinesFromText(resumeTextFixture),
    );
    const email = parsed.candidates.find(
      (item) => item.fieldId === 'personal.email',
    )!;
    const school = parsed.candidates.find(
      (item) => item.fieldId === 'education.school',
    )!;
    const phone = parsed.candidates.find(
      (item) => item.fieldId === 'personal.phone',
    )!;

    const updated = applyConfirmedCandidates(source, [
      {
        candidate: email,
        selected: true,
        overwrite: false,
        value: email.value,
      },
      {
        candidate: school,
        selected: true,
        overwrite: false,
        value: school.value,
      },
      {
        candidate: phone,
        selected: false,
        overwrite: false,
        value: phone.value,
      },
    ]);

    expect(
      updated.masterProfile.personal.fields.map((entry) => entry.fieldId),
    ).toEqual(['personal.email']);
    expect(updated.masterProfile.educations).toHaveLength(1);
    expect(updated.masterProfile.educations[0]?.fields[0]?.fieldId).toBe(
      'education.school',
    );
    expect(source.masterProfile.personal.fields).toEqual([]);
    expect(source.masterProfile.educations).toEqual([]);
  });

  it('does not overwrite an existing value unless the conflict is confirmed', () => {
    const source = createEmptyResumeData();
    source.masterProfile.personal.fields.push({
      fieldId: 'personal.email',
      value: { kind: 'text', value: 'old@example.com' },
      fillPolicy: 'confirmEveryTime',
    });
    const incoming = candidate('personal.email', {
      kind: 'text',
      value: 'new@example.com',
    });
    expect(existingFieldValue(source, incoming)).toEqual({
      kind: 'text',
      value: 'old@example.com',
    });

    const kept = applyConfirmedCandidates(source, [
      {
        candidate: incoming,
        selected: true,
        overwrite: false,
        value: incoming.value,
      },
    ]);
    expect(kept.masterProfile.personal.fields[0]?.value).toEqual({
      kind: 'text',
      value: 'old@example.com',
    });

    const replaced = applyConfirmedCandidates(source, [
      {
        candidate: incoming,
        selected: true,
        overwrite: true,
        value: incoming.value,
      },
    ]);
    expect(replaced.masterProfile.personal.fields[0]?.value).toEqual({
      kind: 'text',
      value: 'new@example.com',
    });
  });

  it('merges repeated records by primary field instead of duplicating', () => {
    const source = createEmptyResumeData();
    const school = candidate(
      'education.school',
      { kind: 'text', value: '清华大学' },
      'education:0',
    );
    const major = candidate(
      'education.major',
      { kind: 'text', value: '计算机科学' },
      'education:0',
    );

    const first = applyConfirmedCandidates(source, [
      { candidate: school, selected: true, overwrite: true, value: school.value },
    ]);
    expect(first.masterProfile.educations).toHaveLength(1);

    const second = applyConfirmedCandidates(first, [
      { candidate: school, selected: true, overwrite: true, value: school.value },
      { candidate: major, selected: true, overwrite: true, value: major.value },
    ]);
    expect(second.masterProfile.educations).toHaveLength(1);
    expect(
      second.masterProfile.educations[0]?.fields.map((entry) => entry.fieldId),
    ).toEqual(expect.arrayContaining(['education.major']));
  });

  it('appends a new record when the primary field differs', () => {
    const source = createEmptyResumeData();
    const schoolA = candidate(
      'education.school',
      { kind: 'text', value: '清华大学' },
      'education:0',
    );
    const schoolB = candidate(
      'education.school',
      { kind: 'text', value: '北京大学' },
      'education:1',
    );

    const first = applyConfirmedCandidates(source, [
      {
        candidate: schoolA,
        selected: true,
        overwrite: true,
        value: schoolA.value,
      },
    ]);
    const second = applyConfirmedCandidates(first, [
      {
        candidate: schoolB,
        selected: true,
        overwrite: true,
        value: schoolB.value,
      },
    ]);
    expect(second.masterProfile.educations).toHaveLength(2);
  });
});
