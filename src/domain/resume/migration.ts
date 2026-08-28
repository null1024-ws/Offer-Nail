import { z, ZodError } from 'zod';
import {
  CURRENT_RESUME_SCHEMA_VERSION,
  masterProfileSchema,
  profileVariantSchema,
  attachmentMetadataSchema,
  resumeDataSchema,
  type ResumeData,
} from './schema';

export type ResumeMigrationErrorCode =
  | 'INVALID_DATA'
  | 'MISSING_VERSION'
  | 'UNSUPPORTED_FUTURE_VERSION'
  | 'UNSUPPORTED_VERSION';

export class ResumeMigrationError extends Error {
  constructor(
    readonly code: ResumeMigrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ResumeMigrationError';
  }
}

const versionEnvelopeSchema = z.looseObject({
  schemaVersion: z.number().int(),
});

const resumeDataV0Schema = z.strictObject({
  schemaVersion: z.literal(0),
  profile: masterProfileSchema,
  variants: z.array(profileVariantSchema).optional(),
  attachments: z.array(attachmentMetadataSchema).optional(),
});

type Migration = (input: unknown) => unknown;

const migrations: ReadonlyMap<number, Migration> = new Map([
  [
    0,
    (input) => {
      const legacy = resumeDataV0Schema.parse(input);
      return {
        schemaVersion: 1,
        masterProfile: legacy.profile,
        profileVariants: legacy.variants ?? [],
        attachments: legacy.attachments ?? [],
      };
    },
  ],
]);

function readSchemaVersion(input: unknown): number {
  const result = versionEnvelopeSchema.safeParse(input);
  if (!result.success) {
    throw new ResumeMigrationError(
      'MISSING_VERSION',
      '简历数据缺少有效的 schemaVersion',
      { cause: result.error },
    );
  }
  return result.data.schemaVersion;
}

function wrapValidationError(error: unknown): never {
  if (error instanceof ResumeMigrationError) throw error;
  if (error instanceof ZodError) {
    throw new ResumeMigrationError('INVALID_DATA', '简历数据格式无效', {
      cause: error,
    });
  }
  throw error;
}

export function migrateResumeData(input: unknown): ResumeData {
  try {
    let version = readSchemaVersion(input);

    if (version > CURRENT_RESUME_SCHEMA_VERSION) {
      throw new ResumeMigrationError(
        'UNSUPPORTED_FUTURE_VERSION',
        `简历数据版本 ${version} 高于当前支持版本 ${CURRENT_RESUME_SCHEMA_VERSION}`,
      );
    }

    let migrated: unknown = input;
    while (version < CURRENT_RESUME_SCHEMA_VERSION) {
      const migration = migrations.get(version);
      if (!migration) {
        throw new ResumeMigrationError(
          'UNSUPPORTED_VERSION',
          `找不到从简历数据版本 ${version} 开始的迁移路径`,
        );
      }

      migrated = migration(migrated);
      const nextVersion = readSchemaVersion(migrated);
      if (nextVersion <= version) {
        throw new ResumeMigrationError(
          'UNSUPPORTED_VERSION',
          `简历数据版本 ${version} 的迁移没有前进`,
        );
      }
      version = nextVersion;
    }

    return resumeDataSchema.parse(migrated);
  } catch (error) {
    return wrapValidationError(error);
  }
}
