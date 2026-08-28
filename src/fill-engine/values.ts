import {
  fieldCatalog,
  type ResumeFieldId,
} from '../domain/resume/field-catalog';
import type {
  FieldValue,
  ResumeData,
  ResumeRecord,
} from '../domain/resume/schema';

export function formatProfileValue(value?: FieldValue): string {
  if (!value) return '';
  if (value.kind === 'attachment') return '';
  if (value.kind === 'date') {
    return [
      String(value.value.year),
      value.value.month
        ? String(value.value.month).padStart(2, '0')
        : undefined,
      value.value.day ? String(value.value.day).padStart(2, '0') : undefined,
    ]
      .filter(Boolean)
      .join('-');
  }
  if (value.kind === 'dateRange') {
    const start = formatProfileValue({
      kind: 'date',
      value: value.value.start,
    });
    const end = value.value.ongoing
      ? '至今'
      : value.value.end
        ? formatProfileValue({ kind: 'date', value: value.value.end })
        : '';
    return `${start} - ${end}`;
  }
  if (value.kind === 'boolean') return value.value ? 'true' : 'false';
  return Array.isArray(value.value)
    ? value.value.join('\n')
    : String(value.value);
}

export function resolveProfileValue(
  data: ResumeData,
  fieldId: ResumeFieldId,
): FieldValue | undefined {
  const section = fieldCatalog[fieldId].section;
  return recordsOf(data)
    .filter((record) => record.section === section)
    .flatMap((record) => record.fields)
    .find((entry) => entry.fieldId === fieldId)?.value;
}

export function resolveSectionValues(
  data: ResumeData,
  section: ResumeRecord['section'],
): Array<Partial<Record<ResumeFieldId, string>>> {
  return recordsOf(data)
    .filter((record) => record.section === section)
    .map((record) => {
      const values: Partial<Record<ResumeFieldId, string>> = {};
      record.fields.forEach((entry) => {
        values[entry.fieldId as ResumeFieldId] = formatProfileValue(
          entry.value,
        );
      });
      return values;
    });
}

function recordsOf(data: ResumeData): ResumeRecord[] {
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
