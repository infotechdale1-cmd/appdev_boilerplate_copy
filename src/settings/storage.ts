import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function getStorage() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-sqlite/kv-store').default;
}

export type ProviderId = 'cloud' | 'local';
export type LocalBackend = 'auto' | 'npu' | 'gpu' | 'cpu';
export type ThemeMode = 'light' | 'dark';
export type FocusAlarmSound = 'default' | 'soft' | 'chime' | 'silent';

const KEYS = {
  provider: 'provider',
  geminiModel: 'geminiModel',
  localBackend: 'localBackend',
  systemPrompt: 'systemPrompt',
  nickname: 'nickname',
  onboarded: 'onboarded',
  theme: 'theme',
  focusAlarmSound: 'focusAlarmSound',
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
  focusAlarmSound: FocusAlarmSound;
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
  focusAlarmSound: 'default',
};

export async function loadSettings(): Promise<Settings> {
  if (Platform.OS === 'web') {
    try {
      const getWeb = (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null);
      const [provider, geminiModel, localBackend, systemPrompt, nickname, onboarded, theme, focusAlarmSound] = [
        getWeb(KEYS.provider),
        getWeb(KEYS.geminiModel),
        getWeb(KEYS.localBackend),
        getWeb(KEYS.systemPrompt),
        getWeb(KEYS.nickname),
        getWeb(KEYS.onboarded),
        getWeb(KEYS.theme),
        getWeb(KEYS.focusAlarmSound),
      ];
      const apiKey =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(API_KEY_KEY) || getWeb(API_KEY_KEY)
          : getWeb(API_KEY_KEY);
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
        focusAlarmSound:
          focusAlarmSound === 'soft' || focusAlarmSound === 'chime' || focusAlarmSound === 'silent'
            ? focusAlarmSound
            : 'default',
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  const storage = getStorage();
  const [provider, geminiModel, localBackend, systemPrompt, nickname, onboarded, theme, focusAlarmSound, apiKey] =
    await Promise.all([
      storage.getItem(KEYS.provider),
      storage.getItem(KEYS.geminiModel),
      storage.getItem(KEYS.localBackend),
      storage.getItem(KEYS.systemPrompt),
      storage.getItem(KEYS.nickname),
      storage.getItem(KEYS.onboarded),
      storage.getItem(KEYS.theme),
      storage.getItem(KEYS.focusAlarmSound),
      SecureStore.getItemAsync(API_KEY_KEY),
    ]);
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
    focusAlarmSound:
      focusAlarmSound === 'soft' || focusAlarmSound === 'chime' || focusAlarmSound === 'silent'
        ? focusAlarmSound
        : 'default',
  };
}

export async function saveSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (key === 'geminiApiKey') {
        if (typeof sessionStorage !== 'undefined') {
          if (value) sessionStorage.setItem(API_KEY_KEY, value as string);
          else sessionStorage.removeItem(API_KEY_KEY);
        }
        if (typeof localStorage !== 'undefined') {
          if (value) localStorage.setItem(API_KEY_KEY, value as string);
          else localStorage.removeItem(API_KEY_KEY);
        }
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(KEYS[key as keyof typeof KEYS], String(value));
      }
    } catch {
      // ignore
    }
    return;
  }

  const storage = getStorage();
  switch (key) {
    case 'geminiApiKey':
      if (value) {
        await SecureStore.setItemAsync(API_KEY_KEY, value as string);
      } else {
        await SecureStore.deleteItemAsync(API_KEY_KEY);
      }
      return;
    case 'provider':
      return storage.setItemAsync(KEYS.provider, value as string);
    case 'geminiModel':
      return storage.setItemAsync(KEYS.geminiModel, value as string);
    case 'localBackend':
      return storage.setItemAsync(KEYS.localBackend, value as string);
    case 'systemPrompt':
      return storage.setItemAsync(KEYS.systemPrompt, value as string);
    case 'nickname':
      return storage.setItemAsync(KEYS.nickname, value as string);
    case 'onboarded':
      return storage.setItemAsync(KEYS.onboarded, String(value));
    case 'theme':
      return storage.setItemAsync(KEYS.theme, value as string);
    case 'focusAlarmSound':
      return storage.setItemAsync(KEYS.focusAlarmSound, value as string);
  }
}

/** Pause/resume state for an interrupted model download (opaque JSON). */
/** Erase every saved setting (including the API key). */
export async function resetSettings(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        for (const k of Object.values(KEYS)) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
    await saveSetting('geminiApiKey', '');
    return;
  }
  await getStorage().clearAsync();
  await saveSetting('geminiApiKey', '');
}

/** System prompt sent to the AI, personalised with the user's nickname. */
export function buildSystemPrompt(settings: Settings): string {
  const name = settings.nickname.trim();
  return name
    ? `${settings.systemPrompt}\nThe user's name is ${name}.`.trim()
    : settings.systemPrompt;
}

export async function getModelResumeData(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEYS.modelResumeData) : null;
    } catch {
      return null;
    }
  }
  return getStorage().getItem(KEYS.modelResumeData);
}

export async function setModelResumeData(data: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        if (data) localStorage.setItem(KEYS.modelResumeData, data);
        else localStorage.removeItem(KEYS.modelResumeData);
      }
    } catch {
      // ignore
    }
    return;
  }
  if (data) {
    await getStorage().setItemAsync(KEYS.modelResumeData, data);
  } else {
    await getStorage().removeItemAsync(KEYS.modelResumeData);
  }
}
