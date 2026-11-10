import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { deleteModel } from '@/ai/local';
import { exportBackup, pickBackup, restoreBackup } from '@/backup/backup';
import { Button } from '@/components/Button';
import { Section } from '@/components/Section';
import { SmoothPressable } from '@/components/SmoothPressable';
import { clearAllConversations } from '@/db/conversations';
import { useSettings } from '@/settings/SettingsContext';
import type { ThemeMode } from '@/settings/storage';
import { useTheme, type Theme } from '@/theme';
import { confirmAction } from '@/utils/confirm';
import { useStudy } from '@/context/StudyContext';

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: 'sunny-outline' | 'moon-outline' }[] = [
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
];

/** App-wide (system) settings. Chatbot options live in chat-settings.tsx. */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, update, reset } = useSettings();
  const { gradingMode, setGradingMode } = useStudy();
  const [nicknameDraft, setNicknameDraft] = useState(settings.nickname);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const run = async (job: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ text: await job(), error: false });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : 'Something went wrong.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const backup = () =>
    run(async () => `Backup created (${await exportBackup(settings)} messages).`);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const b = await pickBackup();
      setBusy(false);
      if (!b) return; // picker cancelled
      confirmAction(
        'Restore backup?',
        `This replaces your current chat and settings with the backup from ${new Date(b.createdAt).toLocaleString()} (${b.messages.length} messages).`,
        'Restore',
        () =>
          void (async () => {
            setBusy(true);
            try {
              await restoreBackup(b, update);
              setNicknameDraft(b.settings.nickname ?? '');
              setStatus({ text: 'Backup restored.', error: false });
            } catch (e) {
              setStatus({
                text: e instanceof Error ? e.message : 'Restore failed.',
                error: true,
              });
            } finally {
              setBusy(false);
            }
          })()
      );
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : 'Something went wrong.',
        error: true,
      });
      setBusy(false);
    }
  };

  const resetAllData = () =>
    confirmAction(
      'Reset all data?',
      'This deletes your chat, nickname, settings, API key and the downloaded local model. The app will start again from onboarding.',
      'Reset',
      async () => {
        await clearAllConversations();
        await deleteModel();
        // Settings go back to defaults (onboarded = false), so the root
        // layout switches to the onboarding screen.
        await reset();
      }
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Section title="Profile" theme={theme}>
        <Text style={[styles.label, { color: theme.text }]}>Nickname</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBackground,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          accessibilityLabel="Nickname"
          value={nicknameDraft}
          onChangeText={setNicknameDraft}
          onBlur={() => update('nickname', nicknameDraft.trim())}
          maxLength={30}
          placeholder="Your nickname"
          placeholderTextColor={theme.textSecondary}
        />
      </Section>

      <Section title="Appearance" theme={theme}>
        <View
          style={styles.segmented}
        >
          {THEME_OPTIONS.map((o) => {
            const active = settings.theme === o.id;
            return (
              <SmoothPressable
                key={o.id}
                accessibilityRole="radio"
                accessibilityLabel={`${o.label} appearance`}
                accessibilityState={{ checked: active }}
                onPress={() => update('theme', o.id)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? theme.buttonPrimary : theme.buttonSecondary,
                  },
                ]}
              >
                <Ionicons
                  name={o.icon}
                  size={16}
                  color={active ? '#FFFFFF' : theme.textSecondary}
                />
                <Text
                  style={{
                    color: active ? '#FFFFFF' : theme.textSecondary,
                    fontWeight: active ? '700' : '400',
                  }}
                >
                  {o.label}
                </Text>
              </SmoothPressable>
            );
          })}
        </View>
      </Section>

      <Section title="Grading System" theme={theme}>
        <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 12 }}>
          Choose how grades, GPAs, and passing criteria are calculated and displayed throughout the app.
        </Text>

        {/* 1. Elementary / High School Percentage Option */}
        <SmoothPressable
          accessibilityRole="radio"
          accessibilityLabel="Elementary / High School Percentage Grading"
          accessibilityState={{ checked: gradingMode === 'percentage' }}
          onPress={() => void setGradingMode('percentage')}
          style={[
            styles.gradingCard,
            {
              backgroundColor: gradingMode === 'percentage' ? theme.primary + '14' : theme.background,
              borderColor: gradingMode === 'percentage' ? theme.primary : theme.border,
            },
          ]}
        >
          <View style={styles.gradingCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={gradingMode === 'percentage' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={gradingMode === 'percentage' ? theme.primary : theme.textSecondary}
              />
              <Text style={[styles.gradingTitle, { color: theme.text }]}>Elementary / High School Percentage Grading</Text>
            </View>
            <View style={[styles.badgePill, { backgroundColor: '#10B98120' }]}>
              <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>0% – 100%</Text>
            </View>
          </View>
          <Text style={[styles.gradingDesc, { color: theme.textSecondary }]}>
            Displays subject grades and assessment results as percentages (e.g. 90%, 87%). Passing threshold is 75.0% or higher. Configurable category weights with raw score preservation.
          </Text>
        </SmoothPressable>

        {/* 2. College Numerical Option */}
        <SmoothPressable
          accessibilityRole="radio"
          accessibilityLabel="College Numerical Grading"
          accessibilityState={{ checked: gradingMode === 'college' }}
          onPress={() => void setGradingMode('college')}
          style={[
            styles.gradingCard,
            {
              backgroundColor: gradingMode === 'college' ? theme.primary + '14' : theme.background,
              borderColor: gradingMode === 'college' ? theme.primary : theme.border,
              marginTop: 10,
            },
          ]}
        >
          <View style={styles.gradingCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={gradingMode === 'college' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={gradingMode === 'college' ? theme.primary : theme.textSecondary}
              />
              <Text style={[styles.gradingTitle, { color: theme.text }]}>College Numerical Grading</Text>
            </View>
            <View style={[styles.badgePill, { backgroundColor: '#4F46E520' }]}>
              <Text style={{ color: '#4F46E5', fontSize: 11, fontWeight: '700' }}>1.00 – 5.00 Scale</Text>
            </View>
          </View>
          <Text style={[styles.gradingDesc, { color: theme.textSecondary }]}>
            Philippine college numerical format: 1.0 is highest grade, 1.1–2.9 below highest, 3.0 passing threshold, and 3.1–5.0 failing. Calculated with formula G = -4(R/T) + 5.
          </Text>
        </SmoothPressable>
      </Section>

      <Section title="Data" theme={theme}>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          Save your chat and settings to a file, or restore them later. Your
          Gemini API key and the downloaded local model are not included.
        </Text>
        <Button label="Back up data" icon="cloud-upload-outline" onPress={backup} disabled={busy} style={{ marginTop: 12 }} />
        <Button label="Restore from backup" icon="cloud-download-outline" variant="secondary" onPress={restore} disabled={busy} style={{ marginTop: 10 }} />
        {status && (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: status.error ? theme.danger : theme.success,
              marginTop: 8,
            }}
          >
            {status.text}
          </Text>
        )}
      </Section>

      <Section title="About" theme={theme}>
        <Row label="App" value={Constants.expoConfig?.name ?? '-'} theme={theme} />
        <Row label="Version" value={Constants.expoConfig?.version ?? '-'} theme={theme} />
        <LinkRow
          label="Privacy Policy"
          onPress={() => router.push('/privacy' as Href)}
          theme={theme}
        />
        <LinkRow
          label="Terms & Conditions"
          onPress={() => router.push('/terms' as Href)}
          theme={theme}
        />
      </Section>

      <Button label="Reset all data" icon="trash-outline" variant="destructiveSecondary" onPress={resetAllData} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}

function Row({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.text, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 15 }}>{value}</Text>
    </View>
  );
}

/** Tappable row that navigates to another screen. */
function LinkRow({
  label,
  onPress,
  theme,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <SmoothPressable onPress={onPress} accessibilityRole="link" style={[styles.row, styles.linkRow, { backgroundColor: theme.background }]}>
      <Text style={{ color: theme.text, fontSize: 15 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </SmoothPressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  segmented: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  linkRow: { minHeight: 48, alignItems: 'center', marginTop: 5, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 10 },
  gradingCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  gradingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gradingTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gradingDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    marginLeft: 28,
  },
});
