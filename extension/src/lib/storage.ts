// Thin promise-friendly wrapper around chrome.storage.local. Keys are
// intentionally explicit (no string union magic) to keep the data shape
// auditable when reviewing what the extension persists.

export type Settings = {
  baseUrl: string;
  apiToken: string;
};

const DEFAULTS: Settings = {
  baseUrl: "",
  apiToken: "",
};

const KEYS: (keyof Settings)[] = ["baseUrl", "apiToken"];

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(KEYS);
  return {
    baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : DEFAULTS.baseUrl,
    apiToken: typeof data.apiToken === "string" ? data.apiToken : DEFAULTS.apiToken,
  };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(settings);
}

export function isConfigured(settings: Settings): boolean {
  return Boolean(settings.baseUrl.trim() && settings.apiToken.trim());
}
