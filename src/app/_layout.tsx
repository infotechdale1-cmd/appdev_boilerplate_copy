import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
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

const SPLASH_BG = require('../../assets/images/app-icon.jpg');
const SPLASH_LOGO = require('../../assets/images/mascot-transparent.png');

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
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const auraScale = useRef(new Animated.Value(0.85)).current;
  const auraOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const isReadyRef = useRef(isReady);
  const hasFinishedIntro = useRef(false);
  const isDismissing = useRef(false);

  const dismiss = () => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 380,
      useNativeDriver: true,
    }).start(() => {
      onDone();
    });
  };

  const handleSkip = () => {
    if (isReadyRef.current) {
      dismiss();
    }
  };

  useEffect(() => {
    isReadyRef.current = isReady;
    if (isReady && hasFinishedIntro.current && !isDismissing.current) {
      dismiss();
    }
  }, [isReady]);

  useEffect(() => {
    // 1. Background image fades in smoothly
    Animated.timing(bgOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    // 2. Logo entrance with spring bounce, pulsing aura ring, and title reveal
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 5.5, tension: 50, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(auraOpacity, { toValue: 0.85, duration: 350, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(auraScale, { toValue: 1.5, duration: 900, useNativeDriver: true }),
          Animated.timing(auraOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => {
      hasFinishedIntro.current = true;
      if (isReadyRef.current) {
        setTimeout(dismiss, 800);
      }
    });
  }, []);

  return (
    <Animated.View style={[styles.splashScreen, { opacity: overlayOpacity }]}>
      {/* Background image */}
      <Animated.Image
        source={SPLASH_BG}
        style={[StyleSheet.absoluteFill, { opacity: bgOpacity }]}
        resizeMode="cover"
      />
      {/* Dim overlay for contrast */}
      <View style={styles.splashDimOverlay} />

      <Pressable style={styles.splashPressable} onPress={handleSkip}>
        {/* Pulsing Aura Ring */}
        <Animated.View
          style={[
            styles.splashAuraRing,
            {
              opacity: auraOpacity,
              transform: [{ scale: auraScale }],
            },
          ]}
        />

        {/* Transparent Logo */}
        <Animated.View
          style={[
            styles.splashLogoWrap,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image source={SPLASH_LOGO} style={styles.splashLogo} resizeMode="contain" />
        </Animated.View>

        {/* Tap to skip hint */}
        <Text style={styles.skipHintText}>Tap anywhere to skip</Text>
      </Pressable>
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
  },
  splashDimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  splashPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  splashAuraRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    borderColor: '#6366F1',
  },
  splashLogoWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  splashLogo: {
    width: 140,
    height: 140,
  },
  skipHintText: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.3,
  },
});
