import { describe, expect, it } from 'vitest';
import {
  fieldCatalog,
  mvpFieldIds,
  resumeSections,
  type ResumeFieldId,
  type ResumeSection,
} from './field-catalog';
import {
  CURRENT_RESUME_SCHEMA_VERSION,
  dateValueSchema,
  resumeDataSchema,
  type FieldValue,
  type ResumeData,
  type ResumeRecord,
} from './schema';

const IDS = {
  profile: '00000000-0000-4000-8000-000000000001',
  personal: '00000000-0000-4000-8000-000000000002',
  preference: '00000000-0000-4000-8000-000000000003',
  compliance: '00000000-0000-4000-8000-000000000004',
  attachment: '00000000-0000-4000-8000-000000000005',
  variant: '00000000-0000-4000-8000-000000000006',
} as const;

const sectionProperties = {
  education: 'educations',
  employment: 'employments',
  project: 'projects',
  research: 'researches',
  language: 'languages',
  skill: 'skills',
  certificate: 'certificates',
  award: 'awards',
  campus: 'campusExperiences',
  volunteer: 'volunteerExperiences',
  training: 'trainings',
  portfolio: 'portfolios',
  intellectualProperty: 'intellectualProperties',
  referee: 'referees',
} as const;

function record(id: string, section: ResumeSection): ResumeRecord {
  return { id, section, fields: [] };
}

function minimalResumeData(): ResumeData {
  return {
    schemaVersion: CURRENT_RESUME_SCHEMA_VERSION,
    masterProfile: {
      id: IDS.profile,
      name: '默认档案',
      createdAt: '2026-08-28T06:00:00.000Z',
      updatedAt: '2026-08-28T06:00:00.000Z',
      personal: record(IDS.personal, 'personal'),
      jobPreference: record(IDS.preference, 'jobPreference'),
      compliance: record(IDS.compliance, 'compliance'),
      educations: [],
      employments: [],
      projects: [],
      researches: [],
      languages: [],
      skills: [],
      certificates: [],
      awards: [],
      campusExperiences: [],
      volunteerExperiences: [],
      trainings: [],
      portfolios: [],
      intellectualProperties: [],
      referees: [],
      enabledSensitiveSections: [],
    },
    profileVariants: [],
    attachments: [],
  };
}

function valueFor(fieldId: ResumeFieldId): FieldValue {
  switch (fieldCatalog[fieldId].kind) {
    case 'attachment':
      return { kind: 'attachment', attachmentId: IDS.attachment };
    case 'boolean':
      return { kind: 'boolean', value: true };
    case 'date':
      return {
        kind: 'date',
        value: { precision: 'month', year: 2026, month: 8 },
      };
    case 'dateRange':
      return {
        kind: 'dateRange',
        value: {
          start: { precision: 'month', year: 2024, month: 9 },
          end: { precision: 'month', year: 2026, month: 6 },
          ongoing: false,
        },
      };
    case 'number':
      return { kind: 'number', value: 1 };
    case 'stringList':
      return { kind: 'stringList', value: ['示例'] };
    case 'url':
      return { kind: 'url', value: 'https://example.com/profile' };
    case 'text':
      return { kind: 'text', value: '示例' };
  }
}

describe('resumeDataSchema', () => {
  it('accepts a valid minimal profile', () => {
    expect(resumeDataSchema.parse(minimalResumeData())).toBeTruthy();
  });

  it('expresses every field marked for the MVP', () => {
    const data = minimalResumeData();
    data.attachments.push({
      id: IDS.attachment,
      kind: 'other',
      filename: 'attachment.pdf',
      mimeType: 'application/pdf',
      size: 1,
      sha256: 'a'.repeat(64),
      sensitivity: 'sensitive',
      retained: true,
    });

    const records = new Map<ResumeSection, ResumeRecord>([
      ['personal', data.masterProfile.personal],
      ['jobPreference', data.masterProfile.jobPreference],
      ['compliance', data.masterProfile.compliance],
    ]);

    resumeSections.forEach((section, index) => {
      if (records.has(section)) return;
      const item = record(
        `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        section,
      );
      records.set(section, item);
      const property =
        sectionProperties[section as keyof typeof sectionProperties];
      if (property) {
        data.masterProfile[property].push(item);
      }
    });

    mvpFieldIds.forEach((fieldId) => {
      records.get(fieldCatalog[fieldId].section)!.fields.push({
        fieldId,
        value: valueFor(fieldId),
        fillPolicy: 'automatic',
      });
    });
    data.masterProfile.enabledSensitiveSections.push('referees', 'compliance');

    expect(resumeDataSchema.parse(data)).toBeTruthy();
  });

  it('rejects invalid dates and enum values', () => {
    expect(
      dateValueSchema.safeParse({
        precision: 'day',
        year: 2026,
        month: 2,
        day: 30,
      }).success,
    ).toBe(false);

    const data = minimalResumeData();
    data.masterProfile.personal.fields.push({
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '张三' },
      fillPolicy: 'automatic',
    });
    const invalid = structuredClone(data) as unknown as {
      masterProfile: { personal: { fields: Array<{ fillPolicy: string }> } };
    };
    invalid.masterProfile.personal.fields[0]!.fillPolicy = 'always';
    expect(resumeDataSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects duplicate record IDs', () => {
    const data = minimalResumeData();
    data.masterProfile.educations.push(record(IDS.personal, 'education'));

    expect(resumeDataSchema.safeParse(data).success).toBe(false);
  });

  it('rejects identity fields in a job variant', () => {
    const data = minimalResumeData();
    data.profileVariants.push({
      id: IDS.variant,
      name: '前端岗位',
      fieldOverrides: [
        {
          recordId: IDS.personal,
          fieldId: 'personal.fullName',
          value: { kind: 'text', value: '不允许覆盖' },
        },
      ],
      recordOrderOverrides: [],
      attachmentIds: [],
    });

    expect(resumeDataSchema.safeParse(data).success).toBe(false);
  });
});
