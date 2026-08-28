import {
  fieldCatalog,
  type ResumeFieldId,
  type ResumeSection,
} from '../domain/resume/field-catalog';
import {
  resumeDataSchema,
  type FieldValue,
  type ResumeData,
  type ResumeFieldEntry,
  type ResumeRecord,
} from '../domain/resume/schema';
import type { FieldCandidate } from './candidates';

export interface CandidateDecision {
  candidate: FieldCandidate;
  selected: boolean;
  overwrite: boolean;
  value: FieldValue;
}

const REPEAT_PROPERTIES = {
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

type RepeatSection = keyof typeof REPEAT_PROPERTIES;

function isRepeatSection(section: ResumeSection): section is RepeatSection {
  return section in REPEAT_PROPERTIES;
}

function recordsOf(
  data: ResumeData,
  section: ResumeSection,
): ResumeRecord[] | ResumeRecord {
  if (section === 'personal') return data.masterProfile.personal;
  if (section === 'jobPreference') return data.masterProfile.jobPreference;
  if (section === 'compliance') return data.masterProfile.compliance;
  if (!isRepeatSection(section)) return [];
  return data.masterProfile[REPEAT_PROPERTIES[section]];
}

export function existingFieldValue(
  data: ResumeData,
  candidate: FieldCandidate,
): FieldValue | undefined {
  const definition = fieldCatalog[candidate.fieldId];
  if (candidate.recordKey === 'personal' || definition.section === 'personal') {
    return data.masterProfile.personal.fields.find(
      (entry) => entry.fieldId === candidate.fieldId,
    )?.value;
  }
  if (definition.section === 'jobPreference') {
    return data.masterProfile.jobPreference.fields.find(
      (entry) => entry.fieldId === candidate.fieldId,
    )?.value;
  }
  return undefined;
}

function upsertField(
  record: ResumeRecord,
  fieldId: ResumeFieldId,
  value: FieldValue,
): void {
  const index = record.fields.findIndex((entry) => entry.fieldId === fieldId);
  const entry: ResumeFieldEntry = {
    fieldId,
    value,
    fillPolicy:
      fieldCatalog[fieldId].sensitivity === 'normal'
        ? 'automatic'
        : 'confirmEveryTime',
  };
  if (index === -1) record.fields.push(entry);
  else record.fields[index] = entry;
}

export function applyConfirmedCandidates(
  source: ResumeData,
  decisions: CandidateDecision[],
): ResumeData {
  const data = structuredClone(source);
  const accepted = decisions.filter((decision) => {
    if (!decision.selected) return false;
    const existing = existingFieldValue(data, decision.candidate);
    if (existing && !decision.overwrite) return false;
    return true;
  });

  const personal = accepted.filter(
    (decision) => decision.candidate.recordKey === 'personal',
  );
  personal.forEach((decision) => {
    upsertField(
      data.masterProfile.personal,
      decision.candidate.fieldId,
      decision.value,
    );
  });

  const grouped = new Map<string, CandidateDecision[]>();
  accepted
    .filter((decision) => decision.candidate.recordKey !== 'personal')
    .forEach((decision) => {
      const list = grouped.get(decision.candidate.recordKey) ?? [];
      list.push(decision);
      grouped.set(decision.candidate.recordKey, list);
    });

  grouped.forEach((group) => {
    const fieldId = group[0]?.candidate.fieldId;
    if (!fieldId) return;
    const section = fieldCatalog[fieldId].section;
    if (
      section === 'personal' ||
      section === 'jobPreference' ||
      section === 'compliance'
    ) {
      const target = recordsOf(data, section) as ResumeRecord;
      group.forEach((decision) => {
        upsertField(target, decision.candidate.fieldId, decision.value);
      });
      return;
    }
    if (!isRepeatSection(section)) return;
    const record: ResumeRecord = {
      id: crypto.randomUUID(),
      section,
      fields: [],
    };
    group.forEach((decision) => {
      upsertField(record, decision.candidate.fieldId, decision.value);
    });
    data.masterProfile[REPEAT_PROPERTIES[section]].push(record);
  });

  data.masterProfile.updatedAt = new Date().toISOString();
  return resumeDataSchema.parse(data);
}
