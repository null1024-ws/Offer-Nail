import { z } from 'zod';
import {
  fieldCatalog,
  isResumeFieldId,
  resumeSections,
  type ResumeFieldId,
  type ResumeSection,
} from './field-catalog';

export const CURRENT_RESUME_SCHEMA_VERSION = 2 as const;

export const fillPolicySchema = z.enum([
  'automatic',
  'confirmEveryTime',
  'never',
]);

export const datePrecisionSchema = z.enum(['year', 'month', 'day']);

export const dateValueSchema = z
  .strictObject({
    precision: datePrecisionSchema,
    year: z.number().int().min(1900).max(2200),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .superRefine((date, context) => {
    if (date.precision === 'year' && (date.month || date.day)) {
      context.addIssue({
        code: 'custom',
        message: '年份精度不能包含月份或日期',
      });
    }

    if (date.precision === 'month' && (!date.month || date.day)) {
      context.addIssue({
        code: 'custom',
        message: '月份精度必须包含月份且不能包含日期',
      });
    }

    if (date.precision === 'day' && (!date.month || !date.day)) {
      context.addIssue({
        code: 'custom',
        message: '日期精度必须同时包含月份和日期',
      });
      return;
    }

    if (date.precision === 'day') {
      const parsed = new Date(Date.UTC(date.year, date.month! - 1, date.day));
      if (
        parsed.getUTCFullYear() !== date.year ||
        parsed.getUTCMonth() !== date.month! - 1 ||
        parsed.getUTCDate() !== date.day
      ) {
        context.addIssue({
          code: 'custom',
          message: '日期不是有效的日历日期',
        });
      }
    }
  });

function comparableDate(date: z.infer<typeof dateValueSchema>): number {
  return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

export const dateRangeSchema = z
  .strictObject({
    start: dateValueSchema,
    end: dateValueSchema.optional(),
    ongoing: z.boolean(),
  })
  .superRefine((range, context) => {
    if (range.ongoing && range.end) {
      context.addIssue({
        code: 'custom',
        message: '进行中的时间段不能同时包含结束时间',
        path: ['end'],
      });
    }

    if (range.end && comparableDate(range.end) < comparableDate(range.start)) {
      context.addIssue({
        code: 'custom',
        message: '结束时间不能早于开始时间',
        path: ['end'],
      });
    }
  });

export const fieldValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), value: z.string() }),
  z.strictObject({ kind: z.literal('url'), value: z.url() }),
  z.strictObject({ kind: z.literal('number'), value: z.number().finite() }),
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('date'), value: dateValueSchema }),
  z.strictObject({ kind: z.literal('dateRange'), value: dateRangeSchema }),
  z.strictObject({
    kind: z.literal('stringList'),
    value: z.array(z.string().trim().min(1)),
  }),
  z.strictObject({
    kind: z.literal('attachment'),
    attachmentId: z.uuid(),
  }),
]);

export const resumeFieldEntrySchema = z
  .strictObject({
    fieldId: z.string(),
    value: fieldValueSchema,
    fillPolicy: fillPolicySchema,
  })
  .superRefine((entry, context) => {
    if (!isResumeFieldId(entry.fieldId)) {
      context.addIssue({
        code: 'custom',
        message: `未知字段 ID：${entry.fieldId}`,
        path: ['fieldId'],
      });
      return;
    }

    const definition = fieldCatalog[entry.fieldId];
    if (definition.availability !== 'mvp') {
      context.addIssue({
        code: 'custom',
        message: `字段 ${entry.fieldId} 尚未在 MVP 中启用`,
        path: ['fieldId'],
      });
    }

    if (definition.kind !== entry.value.kind) {
      context.addIssue({
        code: 'custom',
        message: `字段 ${entry.fieldId} 需要 ${definition.kind} 类型`,
        path: ['value', 'kind'],
      });
    }
  });

export const resumeRecordSchema = z
  .strictObject({
    id: z.uuid(),
    section: z.enum(resumeSections),
    fields: z.array(resumeFieldEntrySchema),
  })
  .superRefine((record, context) => {
    const seen = new Set<string>();
    record.fields.forEach((entry, index) => {
      if (seen.has(entry.fieldId)) {
        context.addIssue({
          code: 'custom',
          message: `记录中存在重复字段：${entry.fieldId}`,
          path: ['fields', index, 'fieldId'],
        });
      }
      seen.add(entry.fieldId);

      if (
        isResumeFieldId(entry.fieldId) &&
        fieldCatalog[entry.fieldId].section !== record.section
      ) {
        context.addIssue({
          code: 'custom',
          message: `字段 ${entry.fieldId} 不属于 ${record.section} 模块`,
          path: ['fields', index, 'fieldId'],
        });
      }
    });
  });

const repeatSectionProperties = {
  educations: 'education',
  employments: 'employment',
  projects: 'project',
  researches: 'research',
  languages: 'language',
  skills: 'skill',
  certificates: 'certificate',
  awards: 'award',
  campusExperiences: 'campus',
  volunteerExperiences: 'volunteer',
  trainings: 'training',
  portfolios: 'portfolio',
  intellectualProperties: 'intellectualProperty',
  referees: 'referee',
} as const satisfies Record<string, ResumeSection>;

export const attachmentMetadataSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum([
    'resume',
    'photo',
    'transcript',
    'certificate',
    'portfolio',
    'coverLetter',
    'recommendation',
    'other',
  ]),
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sensitivity: z.enum(['normal', 'sensitive', 'highlySensitive']),
  retained: z.boolean(),
});

const masterProfileBaseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  personal: resumeRecordSchema,
  jobPreference: resumeRecordSchema,
  compliance: resumeRecordSchema,
  educations: z.array(resumeRecordSchema),
  employments: z.array(resumeRecordSchema),
  projects: z.array(resumeRecordSchema),
  researches: z.array(resumeRecordSchema),
  languages: z.array(resumeRecordSchema),
  skills: z.array(resumeRecordSchema),
  certificates: z.array(resumeRecordSchema),
  awards: z.array(resumeRecordSchema),
  campusExperiences: z.array(resumeRecordSchema),
  volunteerExperiences: z.array(resumeRecordSchema),
  trainings: z.array(resumeRecordSchema),
  portfolios: z.array(resumeRecordSchema),
  intellectualProperties: z.array(resumeRecordSchema),
  referees: z.array(resumeRecordSchema),
  enabledSensitiveSections: z.array(
    z.enum([
      'identityDocuments',
      'familyRelations',
      'emergencyContacts',
      'referees',
      'compliance',
    ]),
  ),
});

export const masterProfileSchema = masterProfileBaseSchema.superRefine(
  (profile, context) => {
    const singletonSections = [
      ['personal', profile.personal, 'personal'],
      ['jobPreference', profile.jobPreference, 'jobPreference'],
      ['compliance', profile.compliance, 'compliance'],
    ] as const;

    singletonSections.forEach(([property, record, expected]) => {
      if (record.section !== expected) {
        context.addIssue({
          code: 'custom',
          message: `${property} 必须使用 ${expected} 模块`,
          path: [property, 'section'],
        });
      }
    });

    Object.entries(repeatSectionProperties).forEach(
      ([property, expectedSection]) => {
        const records = profile[
          property as keyof typeof repeatSectionProperties
        ] as z.infer<typeof resumeRecordSchema>[];
        records.forEach((record, index) => {
          if (record.section !== expectedSection) {
            context.addIssue({
              code: 'custom',
              message: `${property} 只能包含 ${expectedSection} 模块`,
              path: [property, index, 'section'],
            });
          }
        });
      },
    );

    if (
      !profile.enabledSensitiveSections.includes('referees') &&
      profile.referees.length > 0
    ) {
      context.addIssue({
        code: 'custom',
        message: '未启用推荐人类别时不得保留推荐人数据',
        path: ['referees'],
      });
    }

    if (
      !profile.enabledSensitiveSections.includes('compliance') &&
      profile.compliance.fields.length > 0
    ) {
      context.addIssue({
        code: 'custom',
        message: '未启用招聘合规类别时不得保留合规数据',
        path: ['compliance', 'fields'],
      });
    }

    if (
      new Set(profile.enabledSensitiveSections).size !==
      profile.enabledSensitiveSections.length
    ) {
      context.addIssue({
        code: 'custom',
        message: '敏感类别不能重复启用',
        path: ['enabledSensitiveSections'],
      });
    }
  },
);

export const variantFieldOverrideSchema = z
  .strictObject({
    recordId: z.uuid(),
    fieldId: z.string(),
    value: fieldValueSchema,
  })
  .superRefine((override, context) => {
    if (!isResumeFieldId(override.fieldId)) {
      context.addIssue({
        code: 'custom',
        message: `未知字段 ID：${override.fieldId}`,
        path: ['fieldId'],
      });
      return;
    }

    const definition = fieldCatalog[override.fieldId];
    if (!definition.variantOverride) {
      context.addIssue({
        code: 'custom',
        message: `字段 ${override.fieldId} 不允许由岗位变体覆盖`,
        path: ['fieldId'],
      });
    }

    if (definition.kind !== override.value.kind) {
      context.addIssue({
        code: 'custom',
        message: `字段 ${override.fieldId} 需要 ${definition.kind} 类型`,
        path: ['value', 'kind'],
      });
    }
  });

export const profileVariantSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1),
  fieldOverrides: z.array(variantFieldOverrideSchema),
  recordOrderOverrides: z.array(
    z.strictObject({
      section: z.enum([
        'employment',
        'project',
        'skill',
        'portfolio',
        'research',
      ]),
      recordIds: z.array(z.uuid()),
    }),
  ),
  attachmentIds: z.array(z.uuid()),
});

export const resumeDataSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_RESUME_SCHEMA_VERSION),
    masterProfile: masterProfileSchema,
    profileVariants: z.array(profileVariantSchema),
    attachments: z.array(attachmentMetadataSchema),
  })
  .superRefine((data, context) => {
    const recordMap = new Map<string, z.infer<typeof resumeRecordSchema>>();
    const allRecords = [
      data.masterProfile.personal,
      data.masterProfile.jobPreference,
      data.masterProfile.compliance,
      ...Object.keys(repeatSectionProperties).flatMap(
        (property) =>
          data.masterProfile[
            property as keyof typeof repeatSectionProperties
          ] as z.infer<typeof resumeRecordSchema>[],
      ),
    ];

    allRecords.forEach((record) => {
      if (recordMap.has(record.id)) {
        context.addIssue({
          code: 'custom',
          message: `存在重复记录 ID：${record.id}`,
          path: ['masterProfile'],
        });
      }
      recordMap.set(record.id, record);
    });

    const attachmentIds = new Set<string>();
    data.attachments.forEach((attachment, index) => {
      if (attachmentIds.has(attachment.id)) {
        context.addIssue({
          code: 'custom',
          message: `存在重复附件 ID：${attachment.id}`,
          path: ['attachments', index, 'id'],
        });
      }
      attachmentIds.add(attachment.id);
    });

    const variantIds = new Set<string>();
    data.profileVariants.forEach((variant, variantIndex) => {
      if (variantIds.has(variant.id)) {
        context.addIssue({
          code: 'custom',
          message: `存在重复岗位变体 ID：${variant.id}`,
          path: ['profileVariants', variantIndex, 'id'],
        });
      }
      variantIds.add(variant.id);

      const overrideKeys = new Set<string>();
      variant.fieldOverrides.forEach((override, overrideIndex) => {
        const key = `${override.recordId}:${override.fieldId}`;
        if (overrideKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            message: `岗位变体中存在重复覆盖：${key}`,
            path: [
              'profileVariants',
              variantIndex,
              'fieldOverrides',
              overrideIndex,
            ],
          });
        }
        overrideKeys.add(key);

        const record = recordMap.get(override.recordId);
        if (!record) {
          context.addIssue({
            code: 'custom',
            message: `岗位变体引用了不存在的记录：${override.recordId}`,
            path: [
              'profileVariants',
              variantIndex,
              'fieldOverrides',
              overrideIndex,
              'recordId',
            ],
          });
        } else if (
          isResumeFieldId(override.fieldId) &&
          fieldCatalog[override.fieldId].section !== record.section
        ) {
          context.addIssue({
            code: 'custom',
            message: `覆盖字段 ${override.fieldId} 不属于目标记录`,
            path: [
              'profileVariants',
              variantIndex,
              'fieldOverrides',
              overrideIndex,
              'fieldId',
            ],
          });
        }
      });

      variant.attachmentIds.forEach((attachmentId, attachmentIndex) => {
        if (!attachmentIds.has(attachmentId)) {
          context.addIssue({
            code: 'custom',
            message: `岗位变体引用了不存在的附件：${attachmentId}`,
            path: [
              'profileVariants',
              variantIndex,
              'attachmentIds',
              attachmentIndex,
            ],
          });
        }
      });

      variant.recordOrderOverrides.forEach((override, orderIndex) => {
        const seen = new Set<string>();
        override.recordIds.forEach((recordId, recordIndex) => {
          const record = recordMap.get(recordId);
          if (seen.has(recordId)) {
            context.addIssue({
              code: 'custom',
              message: `排序覆盖包含重复记录：${recordId}`,
              path: [
                'profileVariants',
                variantIndex,
                'recordOrderOverrides',
                orderIndex,
                'recordIds',
                recordIndex,
              ],
            });
          }
          seen.add(recordId);

          if (!record || record.section !== override.section) {
            context.addIssue({
              code: 'custom',
              message: `排序覆盖引用了错误模块的记录：${recordId}`,
              path: [
                'profileVariants',
                variantIndex,
                'recordOrderOverrides',
                orderIndex,
                'recordIds',
                recordIndex,
              ],
            });
          }
        });
        const expectedIds = allRecords
          .filter((record) => record.section === override.section)
          .map((record) => record.id);
        if (
          override.recordIds.length !== expectedIds.length ||
          expectedIds.some((recordId) => !seen.has(recordId))
        ) {
          context.addIssue({
            code: 'custom',
            message: `排序覆盖必须包含 ${override.section} 模块的全部记录`,
            path: [
              'profileVariants',
              variantIndex,
              'recordOrderOverrides',
              orderIndex,
              'recordIds',
            ],
          });
        }
      });
      const orderSections = variant.recordOrderOverrides.map(
        ({ section }) => section,
      );
      if (new Set(orderSections).size !== orderSections.length) {
        context.addIssue({
          code: 'custom',
          message: '同一模块只能有一个排序覆盖',
          path: ['profileVariants', variantIndex, 'recordOrderOverrides'],
        });
      }
    });
  });

export type DateValue = z.infer<typeof dateValueSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type FieldValue = z.infer<typeof fieldValueSchema>;
export type ResumeFieldEntry = z.infer<typeof resumeFieldEntrySchema> & {
  fieldId: ResumeFieldId;
};
export type ResumeRecord = z.infer<typeof resumeRecordSchema>;
export type MasterProfile = z.infer<typeof masterProfileSchema>;
export type ProfileVariant = z.infer<typeof profileVariantSchema>;
export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type ResumeData = z.infer<typeof resumeDataSchema>;
