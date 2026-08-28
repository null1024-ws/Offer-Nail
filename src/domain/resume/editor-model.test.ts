import { describe, expect, it } from 'vitest';
import {
  applyProfileDraft,
  createDraftRecord,
  repeatSectionDefinitions,
  resumeDataToProfileDraft,
  singletonSectionDefinitions,
  type DraftRecord,
  type ProfileDraft,
} from './editor-model';
import { createEmptyResumeData } from './factory';
import { fieldCatalog, mvpFieldIds, type ResumeFieldId } from './field-catalog';
import type { ResumeData } from './schema';

describe('profile editor model', () => {
  it('round-trips every MVP field while preserving record IDs, order, and policies', () => {
    const source = createEmptyResumeData();
    const attachmentId = crypto.randomUUID();
    source.attachments.push({
      id: attachmentId,
      kind: 'other',
      filename: 'local.bin',
      mimeType: 'application/octet-stream',
      size: 1,
      sha256: 'a'.repeat(64),
      sensitivity: 'sensitive',
      retained: true,
    });
    source.masterProfile.personal.fields.push({
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '旧姓名' },
      fillPolicy: 'never',
    });

    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const draft = resumeDataToProfileDraft(source);
    draft.educations = [
      createDraftRecord('education', secondId),
      createDraftRecord('education', firstId),
    ];
    repeatSectionDefinitions.forEach(({ property, section }) => {
      if (property !== 'educations') {
        draft[property] = [createDraftRecord(section)];
      }
    });
    draft.enabledSensitiveSections.push('referees', 'compliance');
    fillEveryField(draft, attachmentId);

    const saved = applyProfileDraft(source, draft);
    const reopened = resumeDataToProfileDraft(saved);
    expect(reopened).toEqual(draft);
    expect(saved.masterProfile.educations.map((record) => record.id)).toEqual([
      secondId,
      firstId,
    ]);
    expect(allSavedEntries(saved)).toHaveLength(
      mvpFieldIds.length +
        mvpFieldIds.filter(
          (fieldId) => fieldCatalog[fieldId].section === 'education',
        ).length,
    );
    expect(
      saved.masterProfile.personal.fields.find(
        (entry) => entry.fieldId === 'personal.fullName',
      )?.fillPolicy,
    ).toBe('never');
  });

  it('clears every singleton field and every repeat section', () => {
    const source = createEmptyResumeData();
    const draft = resumeDataToProfileDraft(source);
    repeatSectionDefinitions.forEach(({ property, section }) => {
      draft[property] = [createDraftRecord(section)];
    });
    draft.enabledSensitiveSections.push('referees');
    fillEveryField(draft, crypto.randomUUID());
    singletonSectionDefinitions.forEach(({ property }) => {
      clearRecord(draft[property]);
    });
    repeatSectionDefinitions.forEach(({ property }) => {
      draft[property] = [];
    });

    const saved = applyProfileDraft(source, draft);
    expect(saved.masterProfile.personal.fields).toEqual([]);
    expect(saved.masterProfile.jobPreference.fields).toEqual([]);
    expect(saved.masterProfile.compliance.fields).toEqual([]);
    repeatSectionDefinitions.forEach(({ property }) => {
      expect(saved.masterProfile[property]).toEqual([]);
    });
  });

  it('rejects invalid typed values before save', () => {
    const source = createEmptyResumeData();
    const draft = resumeDataToProfileDraft(source);
    setDraftValue(draft.personal, 'personal.email', 'not-an-email');
    expect(() => applyProfileDraft(source, draft)).toThrow();

    setDraftValue(draft.personal, 'personal.email', '');
    setDraftValue(draft.personal, 'personal.birthDate', '2026-02-30');
    expect(() => applyProfileDraft(source, draft)).toThrow();
  });

  it('excludes disabled highly-sensitive records from fillable data', () => {
    const source = createEmptyResumeData();
    const enabledDraft = resumeDataToProfileDraft(source);
    enabledDraft.enabledSensitiveSections.push('referees');
    enabledDraft.referees = [createDraftRecord('referee')];
    setDraftValue(enabledDraft.referees[0]!, 'referee.name', '李老师');
    setDraftValue(enabledDraft.referees[0]!, 'referee.phone', '13800000000');
    const saved = applyProfileDraft(source, enabledDraft);
    const disabledDraft = resumeDataToProfileDraft(saved);
    disabledDraft.enabledSensitiveSections = [];
    const cleaned = applyProfileDraft(saved, disabledDraft);
    expect(cleaned.masterProfile.referees).toEqual([]);
  });

  it('destructively removes sensitive values when their category is disabled', () => {
    const source = createEmptyResumeData();
    const draft = resumeDataToProfileDraft(source);
    draft.enabledSensitiveSections.push('referees', 'compliance');
    draft.referees = [createDraftRecord('referee')];
    setDraftValue(draft.referees[0]!, 'referee.email', 'ref@example.com');
    setDraftValue(draft.compliance, 'compliance.previousEmployment', 'true');
    const saved = applyProfileDraft(source, draft);

    const disabling = resumeDataToProfileDraft(saved);
    disabling.enabledSensitiveSections = [];
    const disabled = applyProfileDraft(saved, disabling);
    expect(disabled.masterProfile.referees).toEqual([]);
    expect(disabled.masterProfile.compliance.fields).toEqual([]);
    expect(disabled.masterProfile.enabledSensitiveSections).not.toContain(
      'referees',
    );
  });
});

function setDraftValue(
  record: DraftRecord,
  fieldId: ResumeFieldId,
  value: string,
) {
  record.fields.find((field) => field.fieldId === fieldId)!.value = value;
}

function fillRecord(record: DraftRecord, attachmentId: string) {
  record.fields.forEach((field) => {
    const definition = fieldCatalog[field.fieldId as ResumeFieldId];
    if (definition.kind === 'dateRange') {
      field.start = '2025-01';
      field.end = '2026-08';
      return;
    }
    field.value =
      definition.kind === 'attachment'
        ? attachmentId
        : definition.kind === 'boolean'
          ? 'true'
          : definition.kind === 'date'
            ? '2026-08'
            : definition.kind === 'number'
              ? '2'
              : definition.kind === 'stringList'
                ? '第一项\n第二项'
                : definition.kind === 'url'
                  ? 'https://example.com'
                  : field.fieldId === 'personal.email' ||
                      field.fieldId === 'referee.email'
                    ? 'person@example.com'
                    : '示例值';
  });
}

function fillEveryField(draft: ProfileDraft, attachmentId: string) {
  singletonSectionDefinitions.forEach(({ property }) =>
    fillRecord(draft[property], attachmentId),
  );
  repeatSectionDefinitions.forEach(({ property }) =>
    draft[property].forEach((record) => fillRecord(record, attachmentId)),
  );
}

function clearRecord(record: DraftRecord) {
  record.fields.forEach((field) => {
    field.value = '';
    field.start = '';
    field.end = '';
  });
}

function allSavedEntries(data: ResumeData) {
  return [
    ...data.masterProfile.personal.fields,
    ...data.masterProfile.jobPreference.fields,
    ...data.masterProfile.compliance.fields,
    ...repeatSectionDefinitions.flatMap(({ property }) =>
      data.masterProfile[property].flatMap((record) => record.fields),
    ),
  ];
}
