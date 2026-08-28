import { z } from 'zod';
import {
  fieldCatalog,
  mvpFieldIds,
  type ResumeFieldId,
  type ResumeSection,
} from './field-catalog';
import {
  dateValueSchema,
  type DateValue,
  type FieldValue,
  type ResumeData,
  type ResumeRecord,
} from './schema';
import { pruneVariantReferences } from './variant-model';

const sensitiveSectionSchema = z.enum([
  'identityDocuments',
  'familyRelations',
  'emergencyContacts',
  'referees',
  'compliance',
]);

const draftFieldSchema = z.strictObject({
  fieldId: z.string(),
  value: z.string(),
  start: z.string(),
  end: z.string(),
});

const draftRecordSchema = z.strictObject({
  recordId: z.string().uuid(),
  fields: z.array(draftFieldSchema),
});

export const singletonSectionDefinitions = [
  { property: 'personal', section: 'personal', label: '基本信息' },
  { property: 'jobPreference', section: 'jobPreference', label: '求职意向' },
  { property: 'compliance', section: 'compliance', label: '招聘合规与声明' },
] as const;

export const repeatSectionDefinitions = [
  { property: 'educations', section: 'education', label: '教育经历' },
  { property: 'employments', section: 'employment', label: '实习/工作经历' },
  { property: 'projects', section: 'project', label: '项目经历' },
  { property: 'researches', section: 'research', label: '科研与论文' },
  { property: 'languages', section: 'language', label: '语言能力' },
  { property: 'skills', section: 'skill', label: '技能' },
  { property: 'certificates', section: 'certificate', label: '证书' },
  { property: 'awards', section: 'award', label: '竞赛与获奖' },
  { property: 'campusExperiences', section: 'campus', label: '校园与社团经历' },
  {
    property: 'volunteerExperiences',
    section: 'volunteer',
    label: '社会实践与志愿服务',
  },
  { property: 'trainings', section: 'training', label: '培训经历' },
  { property: 'portfolios', section: 'portfolio', label: '作品展示' },
  {
    property: 'intellectualProperties',
    section: 'intellectualProperty',
    label: '专利与知识产权',
  },
  { property: 'referees', section: 'referee', label: '推荐人/证明人' },
] as const;

export type RepeatProperty =
  (typeof repeatSectionDefinitions)[number]['property'];
export type DraftRecord = z.infer<typeof draftRecordSchema>;

const profileDraftBaseSchema = z.strictObject({
  personal: draftRecordSchema,
  jobPreference: draftRecordSchema,
  compliance: draftRecordSchema,
  educations: z.array(draftRecordSchema),
  employments: z.array(draftRecordSchema),
  projects: z.array(draftRecordSchema),
  researches: z.array(draftRecordSchema),
  languages: z.array(draftRecordSchema),
  skills: z.array(draftRecordSchema),
  certificates: z.array(draftRecordSchema),
  awards: z.array(draftRecordSchema),
  campusExperiences: z.array(draftRecordSchema),
  volunteerExperiences: z.array(draftRecordSchema),
  trainings: z.array(draftRecordSchema),
  portfolios: z.array(draftRecordSchema),
  intellectualProperties: z.array(draftRecordSchema),
  referees: z.array(draftRecordSchema),
  enabledSensitiveSections: z.array(sensitiveSectionSchema),
});

export type ProfileDraft = z.infer<typeof profileDraftBaseSchema>;

function sectionFieldIds(section: ResumeSection): ResumeFieldId[] {
  return mvpFieldIds.filter(
    (fieldId) => fieldCatalog[fieldId].section === section,
  );
}

function parseDate(value: string): DateValue | undefined {
  if (!value) return undefined;
  const parts = value.split('-');
  if (parts.length > 3) return undefined;
  const [year, month, day] = parts.map(Number);
  const parsed = dateValueSchema.safeParse({
    precision:
      parts.length === 1 ? 'year' : parts.length === 2 ? 'month' : 'day',
    year,
    ...(month ? { month } : {}),
    ...(day ? { day } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

function validateRecord(
  record: DraftRecord,
  section: ResumeSection,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  const expected = sectionFieldIds(section);
  const seen = new Set<string>();
  record.fields.forEach((field, index) => {
    const fieldPath = [...path, 'fields', index];
    if (seen.has(field.fieldId)) {
      context.addIssue({
        code: 'custom',
        message: `存在重复字段：${field.fieldId}`,
        path: [...fieldPath, 'fieldId'],
      });
    }
    seen.add(field.fieldId);
    if (!expected.includes(field.fieldId as ResumeFieldId)) {
      context.addIssue({
        code: 'custom',
        message: `字段 ${field.fieldId} 不属于 ${section} 模块`,
        path: [...fieldPath, 'fieldId'],
      });
      return;
    }

    const fieldId = field.fieldId as ResumeFieldId;
    const definition = fieldCatalog[fieldId];
    const value = field.value.trim();
    if (definition.kind === 'dateRange') {
      if (field.end && !field.start) {
        context.addIssue({
          code: 'custom',
          message: '填写结束时间前请先填写开始时间',
          path: [...fieldPath, 'start'],
        });
      }
      if (
        (field.start && !parseDate(field.start)) ||
        (field.end && !parseDate(field.end))
      ) {
        context.addIssue({
          code: 'custom',
          message: '请输入 YYYY、YYYY-MM 或 YYYY-MM-DD 格式的有效日期',
          path: [...fieldPath, 'start'],
        });
      }
    } else if (definition.kind === 'date' && value && !parseDate(value)) {
      context.addIssue({
        code: 'custom',
        message: '请输入 YYYY、YYYY-MM 或 YYYY-MM-DD 格式的有效日期',
        path: [...fieldPath, 'value'],
      });
    } else if (
      definition.kind === 'number' &&
      value &&
      !/^\d+(\.\d+)?$/.test(value)
    ) {
      context.addIssue({
        code: 'custom',
        message: '请输入有效数字',
        path: [...fieldPath, 'value'],
      });
    } else if (
      definition.kind === 'boolean' &&
      value &&
      !['true', 'false'].includes(value)
    ) {
      context.addIssue({
        code: 'custom',
        message: '请选择是或否',
        path: [...fieldPath, 'value'],
      });
    } else if (
      definition.kind === 'url' &&
      value &&
      !z.url().safeParse(value).success
    ) {
      context.addIssue({
        code: 'custom',
        message: '请输入有效 URL',
        path: [...fieldPath, 'value'],
      });
    } else if (
      (fieldId === 'personal.email' || fieldId === 'referee.email') &&
      value &&
      !z.email().safeParse(value).success
    ) {
      context.addIssue({
        code: 'custom',
        message: '请输入有效邮箱地址',
        path: [...fieldPath, 'value'],
      });
    } else if (
      definition.kind === 'attachment' &&
      value &&
      !z.uuid().safeParse(value).success
    ) {
      context.addIssue({
        code: 'custom',
        message: '请选择有效附件',
        path: [...fieldPath, 'value'],
      });
    }
  });
  expected.forEach((fieldId) => {
    if (!seen.has(fieldId)) {
      context.addIssue({
        code: 'custom',
        message: `缺少字段：${fieldId}`,
        path: [...path, 'fields'],
      });
    }
  });
}

export const profileDraftSchema = profileDraftBaseSchema.superRefine(
  (draft, context) => {
    singletonSectionDefinitions.forEach(({ property, section }) =>
      validateRecord(draft[property], section, context, [property]),
    );
    repeatSectionDefinitions.forEach(({ property, section }) =>
      draft[property].forEach((record, index) =>
        validateRecord(record, section, context, [property, index]),
      ),
    );
  },
);

function formatDate(value: DateValue): string {
  return [
    String(value.year),
    value.month ? String(value.month).padStart(2, '0') : undefined,
    value.day ? String(value.day).padStart(2, '0') : undefined,
  ]
    .filter(Boolean)
    .join('-');
}

function entryToDraftValue(entry: ResumeRecord['fields'][number] | undefined) {
  if (!entry) return { value: '', start: '', end: '' };
  const value = entry.value;
  if (value.kind === 'dateRange') {
    return {
      value: '',
      start: formatDate(value.value.start),
      end: value.value.end ? formatDate(value.value.end) : '',
    };
  }
  if (value.kind === 'date') {
    return { value: formatDate(value.value), start: '', end: '' };
  }
  if (value.kind === 'stringList') {
    return { value: value.value.join('\n'), start: '', end: '' };
  }
  if (value.kind === 'attachment') {
    return { value: value.attachmentId, start: '', end: '' };
  }
  return { value: String(value.value), start: '', end: '' };
}

export function createDraftRecord(
  section: ResumeSection,
  recordId: string = crypto.randomUUID(),
  source?: ResumeRecord,
): DraftRecord {
  return {
    recordId,
    fields: sectionFieldIds(section).map((fieldId) => ({
      fieldId,
      ...entryToDraftValue(
        source?.fields.find((entry) => entry.fieldId === fieldId),
      ),
    })),
  };
}

export function resumeDataToProfileDraft(data: ResumeData): ProfileDraft {
  const enabled = data.masterProfile.enabledSensitiveSections;
  const draft = {
    personal: createDraftRecord(
      'personal',
      data.masterProfile.personal.id,
      data.masterProfile.personal,
    ),
    jobPreference: createDraftRecord(
      'jobPreference',
      data.masterProfile.jobPreference.id,
      data.masterProfile.jobPreference,
    ),
    compliance: createDraftRecord(
      'compliance',
      data.masterProfile.compliance.id,
      enabled.includes('compliance')
        ? data.masterProfile.compliance
        : undefined,
    ),
    enabledSensitiveSections: [...enabled],
  } as ProfileDraft;
  repeatSectionDefinitions.forEach(({ property, section }) => {
    const records =
      property === 'referees' && !enabled.includes('referees')
        ? []
        : data.masterProfile[property];
    draft[property] = records.map((record) =>
      createDraftRecord(section, record.id, record),
    );
  });
  return profileDraftSchema.parse(draft);
}

function draftValueToFieldValue(
  fieldId: ResumeFieldId,
  field: z.infer<typeof draftFieldSchema>,
): FieldValue | undefined {
  const kind = fieldCatalog[fieldId].kind;
  const value = field.value.trim();
  if (kind === 'dateRange') {
    const start = parseDate(field.start);
    if (!start) return undefined;
    const end = parseDate(field.end);
    return {
      kind: 'dateRange',
      value: { start, ...(end ? { end } : {}), ongoing: !end },
    };
  }
  if (!value) return undefined;
  switch (kind) {
    case 'attachment':
      return { kind, attachmentId: value };
    case 'boolean':
      return { kind, value: value === 'true' };
    case 'date':
      return { kind, value: parseDate(value)! };
    case 'number':
      return { kind, value: Number(value) };
    case 'stringList':
      return {
        kind,
        value: field.value
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      };
    case 'text':
      return { kind, value };
    case 'url':
      return { kind, value };
  }
}

function draftToRecord(
  draft: DraftRecord,
  section: ResumeSection,
  source?: ResumeRecord,
): ResumeRecord {
  const fields: ResumeRecord['fields'] = [];
  draft.fields.forEach((field) => {
    const fieldId = field.fieldId as ResumeFieldId;
    const value = draftValueToFieldValue(fieldId, field);
    if (!value) return;
    const previous = source?.fields.find((entry) => entry.fieldId === fieldId);
    fields.push({
      fieldId,
      value,
      fillPolicy:
        previous?.fillPolicy ??
        (fieldCatalog[fieldId].sensitivity === 'normal'
          ? 'automatic'
          : 'confirmEveryTime'),
    });
  });
  return { id: draft.recordId, section, fields };
}

export function applyProfileDraft(
  source: ResumeData,
  input: ProfileDraft,
): ResumeData {
  const draft = profileDraftSchema.parse(input);
  const updated = structuredClone(source);
  singletonSectionDefinitions.forEach(({ property, section }) => {
    updated.masterProfile[property] =
      property === 'compliance' &&
      !draft.enabledSensitiveSections.includes('compliance')
        ? {
            id: source.masterProfile.compliance.id,
            section: 'compliance',
            fields: [],
          }
        : draftToRecord(
            draft[property],
            section,
            source.masterProfile[property],
          );
  });
  repeatSectionDefinitions.forEach(({ property, section }) => {
    const sourceById = new Map(
      source.masterProfile[property].map((record) => [record.id, record]),
    );
    updated.masterProfile[property] =
      property === 'referees' &&
      !draft.enabledSensitiveSections.includes('referees')
        ? []
        : draft[property].map((record) =>
            draftToRecord(record, section, sourceById.get(record.recordId)),
          );
  });
  updated.masterProfile.enabledSensitiveSections = [
    ...draft.enabledSensitiveSections,
  ];
  updated.masterProfile.updatedAt = new Date().toISOString();
  return pruneVariantReferences(updated);
}
