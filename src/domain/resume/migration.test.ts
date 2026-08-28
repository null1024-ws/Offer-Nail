import { describe, expect, it } from 'vitest';
import { resumeV0Fixture } from './__fixtures__/resume-v0';
import { migrateResumeData, ResumeMigrationError } from './migration';

describe('migrateResumeData', () => {
  it('migrates the v0 fixture without losing profile data', () => {
    const snapshot = JSON.stringify(resumeV0Fixture);
    const migrated = migrateResumeData(resumeV0Fixture);

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.masterProfile.name).toBe('旧版默认档案');
    expect(migrated.masterProfile.personal.fields[0]).toMatchObject({
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '张三' },
    });
    expect(migrated.profileVariants).toEqual([]);
    expect(migrated.attachments).toEqual([]);
    expect(JSON.stringify(resumeV0Fixture)).toBe(snapshot);
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
      migrateResumeData({ schemaVersion: 1, masterProfile: null }),
    ).toThrowError(
      expect.objectContaining<Partial<ResumeMigrationError>>({
        code: 'INVALID_DATA',
      }),
    );
  });
});
