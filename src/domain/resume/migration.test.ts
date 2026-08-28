import { describe, expect, it } from 'vitest';
import { resumeV0Fixture } from './__fixtures__/resume-v0';
import { migrateResumeData, ResumeMigrationError } from './migration';

describe('migrateResumeData', () => {
  it('migrates the v0 fixture without losing profile data', () => {
    const snapshot = JSON.stringify(resumeV0Fixture);
    const migrated = migrateResumeData(resumeV0Fixture);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.masterProfile.name).toBe('旧版默认档案');
    expect(migrated.masterProfile.personal.fields[0]).toMatchObject({
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '张三' },
    });
    expect(migrated.profileVariants).toEqual([]);
    expect(migrated.attachments).toEqual([]);
    expect(JSON.stringify(resumeV0Fixture)).toBe(snapshot);
  });

  it('removes the removed personal.photo field when migrating v1 data', () => {
    const v1 = {
      schemaVersion: 1,
      masterProfile: {
        id: '30000000-0000-4000-8000-000000000001',
        name: '带照片档案',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
        personal: {
          id: '30000000-0000-4000-8000-000000000002',
          section: 'personal',
          fields: [
            {
              fieldId: 'personal.photo',
              value: {
                kind: 'attachment',
                attachmentId: '30000000-0000-4000-8000-000000000003',
              },
              fillPolicy: 'confirmEveryTime',
            },
            {
              fieldId: 'personal.fullName',
              value: { kind: 'text', value: '张三' },
              fillPolicy: 'automatic',
            },
          ],
        },
        jobPreference: {
          id: '30000000-0000-4000-8000-000000000004',
          section: 'jobPreference',
          fields: [],
        },
        compliance: {
          id: '30000000-0000-4000-8000-000000000005',
          section: 'compliance',
          fields: [],
        },
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

    const migrated = migrateResumeData(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(
      migrated.masterProfile.personal.fields.map((entry) => entry.fieldId),
    ).toEqual(['personal.fullName']);
  });

  it('rejects a future version without changing the source object', () => {
    const futureData = {
      schemaVersion: 99,
      masterProfile: { sentinel: 'do not overwrite' },
    };
    const snapshot = structuredClone(futureData);

    expect(() => migrateResumeData(futureData)).toThrowError(
      expect.objectContaining<Partial<ResumeMigrationError>>({
        code: 'UNSUPPORTED_FUTURE_VERSION',
      }),
    );
    expect(futureData).toEqual(snapshot);
  });

  it('rejects an old version when no migration path exists', () => {
    expect(() => migrateResumeData({ schemaVersion: -1 })).toThrowError(
      expect.objectContaining<Partial<ResumeMigrationError>>({
        code: 'UNSUPPORTED_VERSION',
      }),
    );
  });

  it('wraps invalid current data as a migration error', () => {
    expect(() =>
      migrateResumeData({ schemaVersion: 2, masterProfile: null }),
    ).toThrowError(
      expect.objectContaining<Partial<ResumeMigrationError>>({
        code: 'INVALID_DATA',
      }),
    );
  });
});
