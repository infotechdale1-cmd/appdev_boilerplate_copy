// Browser stand-in for storage.ts: uses browser localStorage/sessionStorage
// to avoid expo-sqlite's web worker OPFS locks and cross-origin header issues.

export type ProviderId = 'cloud' | 'local';
export type LocalBackend = 'auto' | 'npu' | 'gpu' | 'cpu';
export type ThemeMode = 'light' | 'dark';

const KEYS = {
  provider: 'provider',
  geminiModel: 'geminiModel',
  localBackend: 'localBackend',
  systemPrompt: 'systemPrompt',
  nickname: 'nickname',
  onboarded: 'onboarded',
  theme: 'theme',
  modelResumeData: 'modelResumeData',
} as const;

const API_KEY_KEY = 'gemini_api_key';

export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';
/** 'auto' = pick the best model the API key can use (see pickBestModel). */
export const DEFAULT_GEMINI_MODEL = 'auto';

export interface Settings {
  provider: ProviderId;
  geminiApiKey: string;
  geminiModel: string;
  localBackend: LocalBackend;
  systemPrompt: string;
  nickname: string;
  onboarded: boolean;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'cloud',
  geminiApiKey: '',
  geminiModel: DEFAULT_GEMINI_MODEL,
  localBackend: 'auto',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  nickname: '',
  onboarded: false,
  theme: 'light',
};

function getLocalItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore
  }
  return null;
}

function setLocalItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}

function removeLocalItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export async function loadSettings(): Promise<Settings> {
  const provider = getLocalItem(KEYS.provider);
  const geminiModel = getLocalItem(KEYS.geminiModel);
  const localBackend = getLocalItem(KEYS.localBackend);
  const systemPrompt = getLocalItem(KEYS.systemPrompt);
  const nickname = getLocalItem(KEYS.nickname);
  const onboarded = getLocalItem(KEYS.onboarded);
  const theme = getLocalItem(KEYS.theme);
  
  let apiKey: string | null = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      apiKey = sessionStorage.getItem(API_KEY_KEY);
    }
    if (!apiKey) {
      apiKey = getLocalItem(API_KEY_KEY);
    }
  } catch {
    // ignore
  }

  return {
    provider: provider === 'local' ? 'local' : 'cloud',
    geminiApiKey: apiKey ?? '',
    geminiModel: geminiModel || DEFAULT_GEMINI_MODEL,
    localBackend:
      localBackend === 'npu' || localBackend === 'gpu' || localBackend === 'cpu'
        ? localBackend
        : 'auto',
    systemPrompt: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    nickname: nickname ?? '',
    onboarded: onboarded === 'true',
    theme: theme === 'dark' ? 'dark' : 'light',
  };
}

export async function saveSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> {
  switch (key) {
    case 'geminiApiKey':
      if (typeof sessionStorage !== 'undefined') {
        if (value) sessionStorage.setItem(API_KEY_KEY, value as string);
        else sessionStorage.removeItem(API_KEY_KEY);
      }
      if (value) setLocalItem(API_KEY_KEY, value as string);
      else removeLocalItem(API_KEY_KEY);
      return;
    case 'provider':
      return setLocalItem(KEYS.provider, value as string);
    case 'geminiModel':
      return setLocalItem(KEYS.geminiModel, value as string);
    case 'localBackend':
      return setLocalItem(KEYS.localBackend, value as string);
    case 'systemPrompt':
      return setLocalItem(KEYS.systemPrompt, value as string);
    case 'nickname':
      return setLocalItem(KEYS.nickname, value as string);
    case 'onboarded':
      return setLocalItem(KEYS.onboarded, String(value));
    case 'theme':
      return setLocalItem(KEYS.theme, value as string);
  }
}

/** Erase every saved setting (including the API key). */
export async function resetSettings(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      for (const k of Object.values(KEYS)) {
        localStorage.removeItem(k);
      }
      localStorage.removeItem(API_KEY_KEY);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(API_KEY_KEY);
    }
  } catch {
    // ignore
  }
}

/** System prompt sent to the AI, personalised with the user's nickname. */
export function buildSystemPrompt(settings: Settings): string {
  const name = settings.nickname.trim();
  return name
    ? `${settings.systemPrompt}\nThe user's name is ${name}.`.trim()
    : settings.systemPrompt;
}

export async function getModelResumeData(): Promise<string | null> {
  return getLocalItem(KEYS.modelResumeData);
}

export async function setModelResumeData(data: string | null): Promise<void> {
  if (data) {
    setLocalItem(KEYS.modelResumeData, data);
  } else {
    removeLocalItem(KEYS.modelResumeData);
  }
}

