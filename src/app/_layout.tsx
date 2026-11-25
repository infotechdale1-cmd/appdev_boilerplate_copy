import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDb } from '@/db/client';
import { refreshModelStatus } from '@/ai/local';
import { DownloadStatusIndicator } from '@/components/DownloadStatusIndicator';
import { PopupProvider } from '@/components/Popup';
import { AccessibilityPreferences, useReduceMotion } from '@/components/AccessibilityPreferences';
import { SettingsProvider, useSettings } from '@/settings/SettingsContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { StudyProvider } from '@/context/StudyContext';
import { useTheme } from '@/theme';

const SPLASH_ICON = require('../../assets/images/mascot-transparent.png');

export default function RootLayout() {
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDb(), refreshModelStatus()])
      .catch((e: unknown) => {
        console.error('[RootLayout] Init failed:', e);
        setInitError(
          e instanceof Error
            ? e.message
            : 'Database initialization failed. Please close other browser tabs or run on native Android.'
        );
      })
      .finally(() => setReady(true));
  }, []);

  if (initError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorTitle, { color: theme.text }]}>Database Initialization Notice</Text>
        <Text style={[styles.errorMessage, { color: theme.textSecondary }]}>{initError}</Text>
        <Text style={[styles.errorHint, { color: theme.textSecondary }]}>
          Tip: If previewing on web, close duplicate tabs to release SQLite OPFS file handles, or launch the native Android development build.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.tint }]}
          onPress={() => {
            setInitError(null);
            setReady(false);
            Promise.all([getDb(), refreshModelStatus()])
              .catch((e: unknown) => {
                console.error('[RootLayout] Retry failed:', e);
                setInitError(
                  e instanceof Error
                    ? e.message
                    : 'Database initialization failed. Please close other browser tabs or run on native Android.'
                );
              })
              .finally(() => setReady(true));
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!ready) {
    return <AppSplashAnimation isReady={false} onDone={() => {}} />;
  }

  return (
    <SettingsProvider>
      <AuthProvider>
        <StudyProvider>
          <AccessibilityPreferences>
            <PopupProvider>
              <RootNavigator />
            </PopupProvider>
          </AccessibilityPreferences>
        </StudyProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

/** Animated splash screen with the app artwork and a transparent logo animation. */
function AppSplashAnimation({
  onDone,
  isReady = true,
}: {
  onDone: () => void;
  isReady?: boolean;
}) {
  const [iconOpacity] = useState(() => new Animated.Value(0));
  const [iconScale] = useState(() => new Animated.Value(0.92));
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const isReadyRef = useRef(isReady);
  const hasFinishedIntro = useRef(false);
  const isDismissing = useRef(false);

  const dismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 380,
      useNativeDriver: true,
    }).start(() => {
      onDone();
    });
  }, [onDone, overlayOpacity]);

  useEffect(() => {
    isReadyRef.current = isReady;
    if (isReady && hasFinishedIntro.current && !isDismissing.current) {
      dismiss();
    }
  }, [dismiss, isReady]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(iconOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(iconScale, {
        toValue: 1,
        speed: 10,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();

    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const introTimer = setTimeout(() => {
      hasFinishedIntro.current = true;
      if (isReadyRef.current) {
        dismissTimer = setTimeout(dismiss, 800);
      }
    }, 400);
    return () => {
      clearTimeout(introTimer);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [dismiss, iconOpacity, iconScale]);

  return (
    <Animated.View style={[styles.splashScreen, { opacity: overlayOpacity }]}>
      <Animated.Image
        source={SPLASH_ICON}
        style={[
          styles.splashIcon,
          {
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

/** Shows onboarding/auth until it's completed and user is logged in, then the main app. */
function RootNavigator() {
  const theme = useTheme();
  const { settings, ready } = useSettings();
  const { currentUser, isLoading: authLoading } = useAuth();
  const reduceMotion = useReduceMotion();
  const [splashDone, setSplashDone] = useState(false);

  // Keep the OS background colour (keyboard area, splash fade) in sync.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);

  const isAppReady = ready && !authLoading;
  const isAuthed = settings.onboarded && !!currentUser;

  return (
    <>
      <StatusBar style={settings.theme === 'dark' ? 'light' : 'dark'} />
      {isAppReady && (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.card },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
            animation: reduceMotion ? 'none' : 'slide_from_right',
          }}
        >
          <Stack.Protected guard={!isAuthed}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={isAuthed}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="chat-settings" options={{ title: 'AI Assistant settings' }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
            <Stack.Screen name="terms" options={{ title: 'Terms & Conditions' }} />
          </Stack.Protected>
        </Stack>
      )}
      <DownloadStatusIndicator />
      {/* Always show the branded splash animation on every app open */}
      {!splashDone && (
        <AppSplashAnimation
          isReady={isAppReady}
          onDone={() => setSplashDone(true)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorHint: {
    fontSize: 12,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.8,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Splash animation styles
  splashScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: '#CEC7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIcon: { width: 220, height: 220 },
});
