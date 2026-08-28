import { decryptVault, encryptVault } from '../vault/crypto';
import type { DeviceSecretStore } from '../vault/device-secret';

export const DEFAULT_LLM_MODEL = 'deepseek-v4-flash';
export const LLM_MODEL_CHOICES = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-flash',
};

export function normalizeModel(model: string): string {
  return LEGACY_MODEL_ALIASES[model] ?? model;
}

const LLM_CONFIG_KEY = 'offerNailLlmConfig';
const LLM_API_KEY_KEY = 'offerNailLlmApiKey';

export interface LlmConfig {
  enabled: boolean;
  model: string;
}

export interface LlmConfigStore {
  read(): Promise<LlmConfig | undefined>;
  readApiKey(): Promise<string | undefined>;
  write(config: LlmConfig, apiKey?: string): Promise<void>;
  clear(): Promise<void>;
}

function isValidConfig(value: unknown): value is LlmConfig {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.model === 'string' &&
    candidate.model.length > 0
  );
}

export class BrowserLlmConfigStore implements LlmConfigStore {
  constructor(private readonly secrets: DeviceSecretStore) {}

  async read(): Promise<LlmConfig | undefined> {
    const result = await browser.storage.local.get(LLM_CONFIG_KEY);
    const value = result[LLM_CONFIG_KEY];
    return isValidConfig(value)
      ? { enabled: value.enabled, model: normalizeModel(value.model) }
      : undefined;
  }

  async readApiKey(): Promise<string | undefined> {
    const secret = await this.secrets.read();
    if (!secret) return undefined;
    const result = await browser.storage.local.get(LLM_API_KEY_KEY);
    const raw = result[LLM_API_KEY_KEY];
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    try {
      return await decryptVault<string>(JSON.parse(raw), secret);
    } catch {
      return undefined;
    }
  }

  async write(config: LlmConfig, apiKey?: string): Promise<void> {
    await browser.storage.local.set({ [LLM_CONFIG_KEY]: config });
    if (apiKey === undefined) return;
    if (apiKey.trim() === '') {
      await browser.storage.local.remove(LLM_API_KEY_KEY);
      return;
    }
    const secret = await this.secrets.getOrCreate();
    const envelope = await encryptVault(apiKey.trim(), secret);
    await browser.storage.local.set({
      [LLM_API_KEY_KEY]: JSON.stringify(envelope),
    });
  }

  async clear(): Promise<void> {
    await browser.storage.local.remove(LLM_CONFIG_KEY);
    await browser.storage.local.remove(LLM_API_KEY_KEY);
  }
}

export class MemoryLlmConfigStore implements LlmConfigStore {
  private config?: LlmConfig;
  private apiKey?: string;

  constructor(initial?: { config?: LlmConfig; apiKey?: string }) {
    this.config = initial?.config;
    this.apiKey = initial?.apiKey;
  }

  async read(): Promise<LlmConfig | undefined> {
    return this.config;
  }

  async readApiKey(): Promise<string | undefined> {
    return this.apiKey;
  }

  async write(config: LlmConfig, apiKey?: string): Promise<void> {
    this.config = config;
    if (apiKey !== undefined) {
      this.apiKey = apiKey.trim() === '' ? undefined : apiKey.trim();
    }
  }

  async clear(): Promise<void> {
    this.config = undefined;
    this.apiKey = undefined;
  }
}
