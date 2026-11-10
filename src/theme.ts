import { useSettings } from '@/settings/SettingsContext';

export interface Theme {
  background: string;
  card: string;
  cardAlt: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  tint: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  buttonPrimary: string;
  buttonSecondary: string;
  buttonDanger: string;
  danger: string;
  success: string;
  warning: string;
  info: string;
  userBubble: string;
  userBubbleText: string;
  assistantBubble: string;
  inputBackground: string;
  headerBackground: string;
  badgeBackground: string;
  subjectColors: string[];
}

const light: Theme = {
  background: '#F8FAFC', // Slate 50
  card: '#FFFFFF',
  cardAlt: '#F1F5F9', // Slate 100
  text: '#0F172A', // Slate 900
  textSecondary: '#64748B', // Slate 500
  textTertiary: '#94A3B8', // Slate 400
  border: '#E2E8F0', // Slate 200
  tint: '#4F46E5', // Indigo 600 (StudyTrack brand)
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#EEF2FF',
  secondary: '#7C3AED', // Purple
  buttonPrimary: '#4F46E5',
  buttonSecondary: '#F1F5F9',
  buttonDanger: '#EF4444',
  danger: '#EF4444',
  success: '#10B981', // Emerald 500
  warning: '#F59E0B', // Amber 500
  info: '#0EA5E9', // Sky 500
  userBubble: '#4F46E5',
  userBubbleText: '#FFFFFF',
  assistantBubble: '#EEF2FF', // Indigo 50 - vibrant tinted surface
  inputBackground: '#F8FAFC',
  headerBackground: '#FFFFFF',
  badgeBackground: '#EEF2FF',
  subjectColors: [
    '#3B82F6', // Blue
    '#4F46E5', // Indigo
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ],
};

const dark: Theme = {
  background: '#0B0F19', // Deep dark slate/navy
  card: '#161F30',
  cardAlt: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  border: '#2A364F',
  tint: '#818CF8', // Indigo 400
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#1E1B4B',
  secondary: '#A78BFA',
  buttonPrimary: '#4F46E5',
  buttonSecondary: '#1E293B',
  buttonDanger: '#EF4444',
  danger: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  info: '#38BDF8',
  userBubble: '#4F46E5',
  userBubbleText: '#FFFFFF',
  assistantBubble: '#1E1B4B', // Indigo 950 - deep brand-tinted dark
  inputBackground: '#131B2B',
  headerBackground: '#161F30',
  badgeBackground: '#1E1B4B',
  subjectColors: [
    '#60A5FA', // Blue
    '#818CF8', // Indigo
    '#A78BFA', // Purple
    '#F472B6', // Pink
    '#34D399', // Emerald
    '#FBBF24', // Amber
    '#22D3EE', // Cyan
    '#FB923C', // Orange
  ],
};

export function useTheme(): Theme {
  return useSettings().settings.theme === 'dark' ? dark : light;
}
