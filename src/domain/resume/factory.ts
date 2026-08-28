import {
  CURRENT_RESUME_SCHEMA_VERSION,
  resumeDataSchema,
  type ResumeData,
  type ResumeRecord,
} from './schema';
import type { ResumeSection } from './field-catalog';

export interface CreateEmptyResumeOptions {
  profileName?: string;
  now?: () => Date;
  createId?: () => string;
}

function emptyRecord(
  section: ResumeSection,
  createId: () => string,
): ResumeRecord {
  return {
    id: createId(),
    section,
    fields: [],
  };
}

export function createEmptyResumeData(
  options: CreateEmptyResumeOptions = {},
): ResumeData {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const timestamp = (options.now ?? (() => new Date()))().toISOString();

  return resumeDataSchema.parse({
    schemaVersion: CURRENT_RESUME_SCHEMA_VERSION,
    masterProfile: {
      id: createId(),
      name: options.profileName ?? '默认档案',
      createdAt: timestamp,
      updatedAt: timestamp,
      personal: emptyRecord('personal', createId),
      jobPreference: emptyRecord('jobPreference', createId),
      compliance: emptyRecord('compliance', createId),
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
  });
}
