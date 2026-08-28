import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { encryptedVaultSchema, type EncryptedVault } from './crypto';

const encryptedAttachmentSchema = z.strictObject({
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
  size: z.number().int().nonnegative(),
  encryptedPayload: z.string().min(1),
});

const storedSiteRuleSchema = z.strictObject({
  id: z.string().min(1),
  origin: z.url(),
  pageSignature: z.string().min(1),
  fieldFingerprint: z.string().min(1),
  targetFieldId: z.string().min(1),
  transform: z.enum(['identity', 'email', 'phone', 'date', 'boolean', 'url']),
  enabled: z.boolean(),
  confirmedAt: z.string().min(1),
  lastSuccessAt: z.string().min(1).optional(),
});

export type EncryptedAttachment = z.infer<typeof encryptedAttachmentSchema>;
export type StoredSiteRule = z.infer<typeof storedSiteRuleSchema>;

interface OfferNailDatabase extends DBSchema {
  vault: {
    key: 'primary';
    value: EncryptedVault;
  };
  attachments: {
    key: string;
    value: EncryptedAttachment;
  };
  siteRules: {
    key: string;
    value: StoredSiteRule;
  };
}

export class VaultStorageError extends Error {
  constructor(
    readonly code: 'INVALID_STORED_DATA' | 'TRANSACTION_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'VaultStorageError';
  }
}

export interface VaultRepositoryOptions {
  databaseName?: string;
  faultInjector?: (stage: 'afterVaultPut') => void;
}

export class VaultRepository {
  readonly databaseName: string;
  private readonly database: Promise<IDBPDatabase<OfferNailDatabase>>;
  private readonly faultInjector?: (stage: 'afterVaultPut') => void;

  constructor(options: VaultRepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? 'offer-nail-vault';
    this.faultInjector = options.faultInjector;
    this.database = openDB<OfferNailDatabase>(this.databaseName, 1, {
      upgrade(database) {
        database.createObjectStore('vault');
        database.createObjectStore('attachments', { keyPath: 'id' });
        database.createObjectStore('siteRules', { keyPath: 'id' });
      },
    });
  }

  async readVault(): Promise<EncryptedVault | undefined> {
    const stored = await (await this.database).get('vault', 'primary');
    if (stored === undefined) return undefined;
    const parsed = encryptedVaultSchema.safeParse(stored);
    if (!parsed.success) {
      throw new VaultStorageError(
        'INVALID_STORED_DATA',
        '本地保险库数据格式无效',
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  async writeVault(vault: EncryptedVault): Promise<void> {
    const validated = encryptedVaultSchema.parse(vault);
    const transaction = (await this.database).transaction('vault', 'readwrite');
    try {
      await transaction.store.put(validated, 'primary');
      this.faultInjector?.('afterVaultPut');
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // IndexedDB may already have aborted the transaction.
      }
      try {
        await transaction.done;
      } catch {
        // The expected abort must settle before callers retry.
      }
      throw new VaultStorageError(
        'TRANSACTION_FAILED',
        '本地保险库写入失败，旧数据保持不变',
        { cause: error },
      );
    }
  }

  async writeAttachment(attachment: EncryptedAttachment): Promise<void> {
    await (
      await this.database
    ).put('attachments', encryptedAttachmentSchema.parse(attachment));
  }

  async writeSiteRule(rule: StoredSiteRule): Promise<void> {
    await (
      await this.database
    ).put('siteRules', storedSiteRuleSchema.parse(rule));
  }

  async listSiteRules(): Promise<StoredSiteRule[]> {
    const rules = await (await this.database).getAll('siteRules');
    return rules.map((rule) => storedSiteRuleSchema.parse(rule));
  }

  async deleteSiteRule(id: string): Promise<void> {
    await (await this.database).delete('siteRules', id);
  }

  async countRecords(): Promise<{
    vault: number;
    attachments: number;
    siteRules: number;
  }> {
    const database = await this.database;
    const transaction = database.transaction(
      ['vault', 'attachments', 'siteRules'],
      'readonly',
    );
    const [vault, attachments, siteRules] = await Promise.all([
      transaction.objectStore('vault').count(),
      transaction.objectStore('attachments').count(),
      transaction.objectStore('siteRules').count(),
    ]);
    await transaction.done;
    return { vault, attachments, siteRules };
  }

  async clearAll(): Promise<void> {
    const transaction = (await this.database).transaction(
      ['vault', 'attachments', 'siteRules'],
      'readwrite',
    );
    await Promise.all([
      transaction.objectStore('vault').clear(),
      transaction.objectStore('attachments').clear(),
      transaction.objectStore('siteRules').clear(),
    ]);
    await transaction.done;
  }

  async destroy(): Promise<void> {
    (await this.database).close();
    await deleteDB(this.databaseName);
  }

  async close(): Promise<void> {
    (await this.database).close();
  }
}
