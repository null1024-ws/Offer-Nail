import {
  fieldCatalog,
  isResumeFieldId,
  type ResumeFieldId,
  type ResumeSection,
} from './field-catalog';
import {
  resumeDataSchema,
  type FieldValue,
  type ProfileVariant,
  type ResumeData,
  type ResumeRecord,
} from './schema';

export const variantOrderSections = [
  'employment',
  'project',
  'skill',
  'portfolio',
  'research',
] as const;
export type VariantOrderSection = (typeof variantOrderSections)[number];

export interface OverridableFieldEntry {
  record: ResumeRecord;
  fieldId: ResumeFieldId;
  label: string;
}

function records(data: ResumeData): ResumeRecord[] {
  const profile = data.masterProfile;
  return [
    profile.personal,
    profile.jobPreference,
    profile.compliance,
    ...profile.educations,
    ...profile.employments,
    ...profile.projects,
    ...profile.researches,
    ...profile.languages,
    ...profile.skills,
    ...profile.certificates,
    ...profile.awards,
    ...profile.campusExperiences,
    ...profile.volunteerExperiences,
    ...profile.trainings,
    ...profile.portfolios,
    ...profile.intellectualProperties,
    ...profile.referees,
  ];
}

function requireVariant(data: ResumeData, variantId: string): ProfileVariant {
  const variant = data.profileVariants.find(({ id }) => id === variantId);
  if (!variant) throw new Error('岗位变体不存在');
  return variant;
}

function updateVariant(
  source: ResumeData,
  variantId: string,
  update: (variant: ProfileVariant) => void,
): ResumeData {
  const data = structuredClone(source);
  update(requireVariant(data, variantId));
  return resumeDataSchema.parse(data);
}

export function listOverridableFields(
  source: ResumeData,
): OverridableFieldEntry[] {
  return records(source).flatMap((record) =>
    (Object.keys(fieldCatalog) as ResumeFieldId[])
      .filter(
        (fieldId) =>
          fieldCatalog[fieldId].section === record.section &&
          fieldCatalog[fieldId].availability === 'mvp' &&
          fieldCatalog[fieldId].variantOverride,
      )
      .map((fieldId) => ({
        record,
        fieldId,
        label: fieldCatalog[fieldId].label,
      })),
  );
}

export function createProfileVariant(
  source: ResumeData,
  name: string,
): ResumeData {
  const data = structuredClone(source);
  data.profileVariants.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    fieldOverrides: [],
    recordOrderOverrides: [],
    attachmentIds: [],
  });
  return resumeDataSchema.parse(data);
}

export function renameProfileVariant(
  source: ResumeData,
  variantId: string,
  name: string,
): ResumeData {
  return updateVariant(source, variantId, (variant) => {
    variant.name = name.trim();
  });
}

export function copyProfileVariant(
  source: ResumeData,
  variantId: string,
  name?: string,
): ResumeData {
  const original = requireVariant(source, variantId);
  const data = structuredClone(source);
  data.profileVariants.push({
    ...structuredClone(original),
    id: crypto.randomUUID(),
    name: name?.trim() || `${original.name} 副本`,
  });
  return resumeDataSchema.parse(data);
}

export function deleteProfileVariant(
  source: ResumeData,
  variantId: string,
): ResumeData {
  const data = structuredClone(source);
  data.profileVariants = data.profileVariants.filter(
    ({ id }) => id !== variantId,
  );
  if (data.profileVariants.length === source.profileVariants.length) {
    throw new Error('岗位变体不存在');
  }
  return resumeDataSchema.parse(data);
}

export function setVariantFieldOverride(
  source: ResumeData,
  variantId: string,
  recordId: string,
  fieldId: string,
  value: FieldValue,
): ResumeData {
  if (!isResumeFieldId(fieldId) || !fieldCatalog[fieldId].variantOverride) {
    throw new Error(`字段 ${fieldId} 不允许由岗位变体覆盖`);
  }
  return updateVariant(source, variantId, (variant) => {
    const index = variant.fieldOverrides.findIndex(
      (item) => item.recordId === recordId && item.fieldId === fieldId,
    );
    const next = { recordId, fieldId, value };
    if (index === -1) variant.fieldOverrides.push(next);
    else variant.fieldOverrides[index] = next;
  });
}

export function clearVariantFieldOverride(
  source: ResumeData,
  variantId: string,
  recordId: string,
  fieldId: ResumeFieldId,
): ResumeData {
  return updateVariant(source, variantId, (variant) => {
    variant.fieldOverrides = variant.fieldOverrides.filter(
      (item) => item.recordId !== recordId || item.fieldId !== fieldId,
    );
  });
}

export function resolveVariantField(
  source: ResumeData,
  variantId: string,
  recordId: string,
  fieldId: ResumeFieldId,
): { value?: FieldValue; inherited: boolean } {
  const variant = requireVariant(source, variantId);
  const override = variant.fieldOverrides.find(
    (item) => item.recordId === recordId && item.fieldId === fieldId,
  );
  if (override) return { value: override.value, inherited: false };
  const record = records(source).find(({ id }) => id === recordId);
  const entry = record?.fields.find((item) => item.fieldId === fieldId);
  return { value: entry?.value, inherited: true };
}

export function setVariantRecordOrder(
  source: ResumeData,
  variantId: string,
  section: VariantOrderSection,
  recordIds: string[],
): ResumeData {
  return updateVariant(source, variantId, (variant) => {
    const current = variant.recordOrderOverrides.findIndex(
      (item) => item.section === section,
    );
    const next = { section, recordIds: [...recordIds] };
    if (current === -1) variant.recordOrderOverrides.push(next);
    else variant.recordOrderOverrides[current] = next;
  });
}

export function clearVariantRecordOrder(
  source: ResumeData,
  variantId: string,
  section: VariantOrderSection,
): ResumeData {
  return updateVariant(source, variantId, (variant) => {
    variant.recordOrderOverrides = variant.recordOrderOverrides.filter(
      (item) => item.section !== section,
    );
  });
}

export function resolveVariantRecordOrder(
  source: ResumeData,
  variantId: string,
  section: VariantOrderSection,
): { recordIds: string[]; inherited: boolean } {
  const variant = requireVariant(source, variantId);
  const masterIds = records(source)
    .filter((record) => record.section === section)
    .map((record) => record.id);
  const override = variant.recordOrderOverrides.find(
    (item) => item.section === section,
  );
  if (!override) return { recordIds: masterIds, inherited: true };
  const remaining = new Set(masterIds);
  const ordered = override.recordIds.filter((id) => remaining.delete(id));
  return { recordIds: [...ordered, ...remaining], inherited: false };
}

export function setVariantAttachmentIds(
  source: ResumeData,
  variantId: string,
  attachmentIds: string[],
): ResumeData {
  return updateVariant(source, variantId, (variant) => {
    variant.attachmentIds = [...attachmentIds];
  });
}

export function pruneVariantReferences(source: ResumeData): ResumeData {
  const recordIds = new Set(records(source).map((record) => record.id));
  const attachmentIds = new Set(
    source.attachments.map((attachment) => attachment.id),
  );
  const data = structuredClone(source);
  data.profileVariants.forEach((variant) => {
    variant.fieldOverrides = variant.fieldOverrides.filter((override) =>
      recordIds.has(override.recordId),
    );
    variant.recordOrderOverrides = variant.recordOrderOverrides
      .map((override) => ({
        ...override,
        recordIds: override.recordIds.filter((id) => recordIds.has(id)),
      }))
      .filter((override) => override.recordIds.length > 0);
    variant.attachmentIds = variant.attachmentIds.filter((id) =>
      attachmentIds.has(id),
    );
  });
  return resumeDataSchema.parse(data);
}

export function getMasterRecords(source: ResumeData): ResumeRecord[] {
  return records(source);
}

const ORDERABLE_PROPERTIES = {
  employment: 'employments',
  project: 'projects',
  skill: 'skills',
  portfolio: 'portfolios',
  research: 'researches',
} as const;

export function resumeForFill(
  source: ResumeData,
  variantId?: string,
): ResumeData {
  const data = structuredClone(source);
  if (!variantId) return data;
  const variant = requireVariant(data, variantId);
  variant.fieldOverrides.forEach((override) => {
    const record = records(data).find((item) => item.id === override.recordId);
    if (!record || !isResumeFieldId(override.fieldId)) return;
    const field = record.fields.find(
      (item) => item.fieldId === override.fieldId,
    );
    if (field) {
      field.value = override.value;
      return;
    }
    record.fields.push({
      fieldId: override.fieldId,
      value: override.value,
      fillPolicy: 'automatic',
    });
  });
  variant.recordOrderOverrides.forEach((override) => {
    const property = ORDERABLE_PROPERTIES[override.section];
    const list = data.masterProfile[property];
    const byId = new Map(list.map((record) => [record.id, record]));
    data.masterProfile[property] = resolveVariantRecordOrder(
      data,
      variantId,
      override.section,
    )
      .recordIds.map((id) => byId.get(id))
      .filter((record): record is ResumeRecord => Boolean(record));
  });
  return data;
}

export function isOverridableField(
  fieldId: string,
  section?: ResumeSection,
): fieldId is ResumeFieldId {
  return (
    isResumeFieldId(fieldId) &&
    fieldCatalog[fieldId].variantOverride &&
    fieldCatalog[fieldId].availability === 'mvp' &&
    (section === undefined || fieldCatalog[fieldId].section === section)
  );
}
