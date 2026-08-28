const DEVICE_SECRET_KEY = 'offerNailDeviceSecret';
const SECRET_BYTES = 32;

export interface DeviceSecretStore {
  read(): Promise<string | undefined>;
  write(secret: string): Promise<void>;
  clear(): Promise<void>;
  getOrCreate(): Promise<string>;
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export class MemoryDeviceSecretStore implements DeviceSecretStore {
  constructor(public secret?: string) {}

  async read(): Promise<string | undefined> {
    return this.secret;
  }

  async write(secret: string): Promise<void> {
    this.secret = secret;
  }

  async clear(): Promise<void> {
    this.secret = undefined;
  }

  async getOrCreate(): Promise<string> {
    if (this.secret) return this.secret;
    this.secret = randomSecret();
    return this.secret;
  }
}

export class BrowserDeviceSecretStore implements DeviceSecretStore {
  async read(): Promise<string | undefined> {
    const result = await browser.storage.local.get(DEVICE_SECRET_KEY);
    const value = result[DEVICE_SECRET_KEY];
    return typeof value === 'string' && value.length >= SECRET_BYTES
      ? value
      : undefined;
  }

  async write(secret: string): Promise<void> {
    await browser.storage.local.set({ [DEVICE_SECRET_KEY]: secret });
  }

  async clear(): Promise<void> {
    await browser.storage.local.remove(DEVICE_SECRET_KEY);
  }

  async getOrCreate(): Promise<string> {
    const existing = await this.read();
    if (existing) return existing;
    const secret = randomSecret();
    await this.write(secret);
    return secret;
  }
}
