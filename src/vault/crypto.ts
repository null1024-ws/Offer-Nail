import { z } from 'zod';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VAULT_VERSION = 1 as const;
const AAD = encoder.encode('Offer-Nail:vault:1');

export const kdfParametersSchema = z.strictObject({
  name: z.literal('PBKDF2'),
  hash: z.literal('SHA-256'),
  iterations: z.number().int().min(1),
});

export const encryptedVaultSchema = z.strictObject({
  vaultVersion: z.literal(VAULT_VERSION),
  kdfParameters: kdfParametersSchema,
  salt: z.string().min(1),
  iv: z.string().min(1),
  encryptedPayload: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type KdfParameters = z.infer<typeof kdfParametersSchema>;
export type EncryptedVault = z.infer<typeof encryptedVaultSchema>;

export class VaultCryptoError extends Error {
  constructor(
    readonly code:
      'AUTHENTICATION_FAILED' | 'INVALID_ENVELOPE' | 'UNSUPPORTED_VERSION',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'VaultCryptoError';
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    throw new VaultCryptoError('INVALID_ENVELOPE', '保险库编码无效', {
      cause: error,
    });
  }
}

async function deriveKey(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  parameters: KdfParameters,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: parameters.name,
      hash: parameters.hash,
      iterations: parameters.iterations,
      salt,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptVaultOptions {
  iterations?: number;
  existingCreatedAt?: string;
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array<ArrayBuffer>;
}

export async function encryptVault(
  payload: unknown,
  secret: string,
  options: EncryptVaultOptions = {},
): Promise<EncryptedVault> {
  const randomBytes =
    options.randomBytes ??
    ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const parameters: KdfParameters = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: options.iterations ?? 600_000,
  };
  const key = await deriveKey(secret, salt, parameters);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    plaintext,
  );
  const timestamp = (options.now ?? (() => new Date()))().toISOString();

  return {
    vaultVersion: VAULT_VERSION,
    kdfParameters: parameters,
    salt: toBase64(salt),
    iv: toBase64(iv),
    encryptedPayload: toBase64(new Uint8Array(ciphertext)),
    createdAt: options.existingCreatedAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export async function decryptVault<T = unknown>(
  input: unknown,
  secret: string,
): Promise<T> {
  if (
    typeof input === 'object' &&
    input !== null &&
    'vaultVersion' in input &&
    input.vaultVersion !== VAULT_VERSION
  ) {
    throw new VaultCryptoError('UNSUPPORTED_VERSION', '保险库版本不受支持');
  }

  const parsed = encryptedVaultSchema.safeParse(input);
  if (!parsed.success) {
    throw new VaultCryptoError('INVALID_ENVELOPE', '保险库格式无效', {
      cause: parsed.error,
    });
  }

  try {
    const vault = parsed.data;
    const key = await deriveKey(
      secret,
      fromBase64(vault.salt),
      vault.kdfParameters,
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(vault.iv),
        additionalData: AAD,
      },
      key,
      fromBase64(vault.encryptedPayload),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch (error) {
    if (error instanceof VaultCryptoError) throw error;
    throw new VaultCryptoError(
      'AUTHENTICATION_FAILED',
      '保险库无法打开或已损坏',
      { cause: error },
    );
  }
}

export async function calibrateKdfIterations(
  benchmark: (iterations: number) => Promise<number>,
  targetMilliseconds = 350,
): Promise<number> {
  const sampleIterations = 100_000;
  const elapsed = Math.max(await benchmark(sampleIterations), 1);
  const estimate = Math.round(
    (sampleIterations * targetMilliseconds) / elapsed,
  );
  return Math.min(1_200_000, Math.max(210_000, estimate));
}
