import { BlurTargetView, BlurView } from 'expo-blur';
import React, { createContext, useContext, useRef, useSyncExternalStore, type RefObject } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/settings/SettingsContext';
import { useTheme } from '@/theme';
import { dismissConfirmation, getConfirmation, showMessage, subscribeConfirmation, type MessageType } from '@/utils/confirm';
import { useReduceMotion } from './AccessibilityPreferences';
import { Button } from './Button';

const BlurTargetContext = createContext<RefObject<View | null>>({ current: null });

/** One shared Android blur target; popup content stays sharp above it. */
export function PopupProvider({ children }: { children: React.ReactNode }) {
  const target = useRef<View | null>(null);
  return (
    <BlurTargetContext.Provider value={target}>
      <BlurTargetView ref={target} style={styles.flex}>{children}</BlurTargetView>
      <ConfirmationHost />
    </BlurTargetContext.Provider>
  );
}

export function Popup({ visible, onClose, children, style, label }: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  label: string;
}) {
  const target = useContext(BlurTargetContext);
  const theme = useTheme();
  const { settings } = useSettings();
  const reduceMotion = useReduceMotion();
  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" blurTarget={target} blurMethod="dimezisBlurView" intensity={65} tint={settings.theme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${label}`} onPress={onClose} style={[StyleSheet.absoluteFill, styles.scrim]} />
        <View accessibilityViewIsModal accessibilityLabel={label} style={[styles.sheet, { backgroundColor: theme.card }, style]}>{children}</View>
      </View>
    </Modal>
  );
}

type ThemedConfig = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  badgeText: string;
  badgeBg: string;
  badgeTextColor: string;
  sheetBg: string;
  sheetBorder: string;
  iconBg: string;
  iconColor: string;
  titleColor: string;
  messageColor: string;
  buttonBg?: string;
  buttonVariant: 'primary' | 'secondary' | 'destructive';
};

function getThemedConfig(
  type: MessageType,
  destructive: boolean,
  isDark: boolean
): ThemedConfig {
  const isDestructive = type === 'error' || destructive;

  if (isDestructive) {
    return {
      icon: destructive ? 'trash-outline' : 'alert-circle',
      badgeText: destructive ? 'DESTRUCTIVE' : 'ALERT',
      badgeBg: isDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2',
      badgeTextColor: isDark ? '#FCA5A5' : '#B91C1C',
      sheetBg: isDark ? '#230E12' : '#FEF2F2',
      sheetBorder: isDark ? 'rgba(239, 68, 68, 0.45)' : '#FECACA',
      iconBg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
      iconColor: isDark ? '#F87171' : '#EF4444',
      titleColor: isDark ? '#FFF1F2' : '#991B1B',
      messageColor: isDark ? '#FECDD3' : '#7F1D1D',
      buttonBg: isDark ? '#DC2626' : '#EF4444',
      buttonVariant: 'destructive',
    };
  }

  if (type === 'success') {
    return {
      icon: 'checkmark-circle',
      badgeText: 'SUCCESS',
      badgeBg: isDark ? 'rgba(16, 185, 129, 0.22)' : '#DCFCE7',
      badgeTextColor: isDark ? '#6EE7B7' : '#065F46',
      sheetBg: isDark ? '#08261B' : '#F0FDF4',
      sheetBorder: isDark ? 'rgba(16, 185, 129, 0.45)' : '#86EFAC',
      iconBg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7',
      iconColor: isDark ? '#34D399' : '#10B981',
      titleColor: isDark ? '#ECFDF5' : '#064E3B',
      messageColor: isDark ? '#A7F3D0' : '#047857',
      buttonBg: isDark ? '#059669' : '#10B981',
      buttonVariant: 'primary',
    };
  }

  if (type === 'warning') {
    return {
      icon: 'warning',
      badgeText: 'WARNING',
      badgeBg: isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7',
      badgeTextColor: isDark ? '#FDE68A' : '#92400E',
      sheetBg: isDark ? '#281A07' : '#FFFBEB',
      sheetBorder: isDark ? 'rgba(245, 158, 11, 0.45)' : '#FDE68A',
      iconBg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
      iconColor: isDark ? '#FBBF24' : '#F59E0B',
      titleColor: isDark ? '#FFFBEB' : '#78350F',
      messageColor: isDark ? '#FDE68A' : '#92400E',
      buttonBg: isDark ? '#D97706' : '#F59E0B',
      buttonVariant: 'primary',
    };
  }

  if (type === 'info') {
    return {
      icon: 'information-circle',
      badgeText: 'NOTICE',
      badgeBg: isDark ? 'rgba(14, 165, 233, 0.22)' : '#E0F2FE',
      badgeTextColor: isDark ? '#7DD3FC' : '#075985',
      sheetBg: isDark ? '#0A2033' : '#F0F9FF',
      sheetBorder: isDark ? 'rgba(14, 165, 233, 0.45)' : '#BAE6FD',
      iconBg: isDark ? 'rgba(14, 165, 233, 0.18)' : '#E0F2FE',
      iconColor: isDark ? '#38BDF8' : '#0EA5E9',
      titleColor: isDark ? '#F0F9FF' : '#0C4A6E',
      messageColor: isDark ? '#BAE6FD' : '#0369A1',
      buttonBg: isDark ? '#0284C7' : '#0EA5E9',
      buttonVariant: 'primary',
    };
  }

  // Default: StudyTrack Indigo Brand Theme
  return {
    icon: 'chatbubble-ellipses-outline',
    badgeText: 'STUDYTRACK',
    badgeBg: isDark ? 'rgba(99, 102, 241, 0.22)' : '#EEF2FF',
    badgeTextColor: isDark ? '#A5B4FC' : '#4338CA',
    sheetBg: isDark ? '#141A2D' : '#F5F7FF',
    sheetBorder: isDark ? 'rgba(99, 102, 241, 0.45)' : '#C7D2FE',
    iconBg: isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF',
    iconColor: isDark ? '#818CF8' : '#4F46E5',
    titleColor: isDark ? '#EEF2FF' : '#1E1B4B',
    messageColor: isDark ? '#C7D2FE' : '#4338CA',
    buttonBg: isDark ? '#4F46E5' : '#4F46E5',
    buttonVariant: 'primary',
  };
}

function ConfirmationHost() {
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation);
  const { settings } = useSettings();
  if (!request) return null;
  const isDark = settings.theme === 'dark';
  const close = () => dismissConfirmation(request.id);
  const confirm = () => {
    close();
    void Promise.resolve()
      .then(request.onConfirm)
      .catch((error) =>
        showMessage(
          'Unable to complete action',
          error instanceof Error ? error.message : 'Please try again.',
          'error'
        )
      );
  };

  const config = getThemedConfig(request.type, request.destructive, isDark);

  return (
    <Popup
      visible
      onClose={close}
      label={request.title}
      style={[
        styles.themedSheet,
        {
          backgroundColor: config.sheetBg,
          borderColor: config.sheetBorder,
        },
      ]}
    >
      {/* Category Pill Badge */}
      <View style={[styles.badge, { backgroundColor: config.badgeBg }]}>
        <Text style={[styles.badgeText, { color: config.badgeTextColor }]}>
          {config.badgeText}
        </Text>
      </View>

      {/* Themed Icon Header */}
      <View style={[styles.iconHeader, { backgroundColor: config.iconBg }]}>
        <Ionicons name={config.icon} size={32} color={config.iconColor} />
      </View>

      <Text accessibilityRole="header" style={[styles.title, { color: config.titleColor }]}>
        {request.title}
      </Text>
      <Text style={[styles.message, { color: config.messageColor }]}>
        {request.message}
      </Text>

      <View style={styles.actions}>
        {request.cancelable && (
          <Button
            label="Cancel"
            variant="secondary"
            onPress={close}
            style={[
              styles.flex,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                borderColor: config.sheetBorder,
                borderWidth: 1,
              },
            ]}
          />
        )}
        <Button
          label={request.confirmLabel}
          variant={config.buttonVariant}
          onPress={confirm}
          style={[
            styles.flex,
            config.buttonBg ? ({ backgroundColor: config.buttonBg } as any) : null,
          ]}
        />
      </View>
    </Popup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  themedSheet: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
  },
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  iconHeader: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center', letterSpacing: 0.3 },
  message: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
});
