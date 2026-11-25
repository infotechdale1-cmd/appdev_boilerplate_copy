import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/settings/SettingsContext';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ONBOARDING_LOGO = require('../../assets/images/mascot-transparent.png');

const SLIDES: { icon: IconName; title: string; subtitle: string }[] = [
  {
    icon: 'school-outline',
    title: 'Welcome',
    subtitle: 'The all-in-one student workspace designed to organize your studies and ace your courses.',
  },
  {
    icon: 'checkbox-outline',
    title: 'Never Miss a Deadline',
    subtitle: 'Manage assignments, set priorities, and get timely notifications for upcoming exams.',
  },
  {
    icon: 'timer-outline',
    title: 'Track Focus & Progress',
    subtitle: 'Log study sessions with the built-in focus timer and monitor your weekly academic targets.',
  },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const { update } = useSettings();
  const { guestLogin } = useAuth();
  const { width, height } = useWindowDimensions();
  const isWideLayout = width >= 820;

  const [slideIndex, setSlideIndex] = useState(0);
  const [authMode, setAuthMode] = useState<'walkthrough' | 'setup'>('walkthrough');

  // Form states
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleNextSlide = () => {
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex(slideIndex + 1);
    } else {
      setAuthMode('setup');
    }
  };

  const handleSetup = async () => {
    setErrorMessage('');
    if (!name.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }

    setSubmitting(true);
    await guestLogin(name.trim());
    setSubmitting(false);
    update('onboarded', true);
    update('nickname', name.trim());
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {authMode === 'walkthrough' ? (
            /* Intro Carousel */
            <View
              style={[
                styles.walkthroughContainer,
                isWideLayout && styles.walkthroughContainerWide,
              ]}
            >
              <View
                style={[
                  styles.onboardingHero,
                  isWideLayout && styles.onboardingHeroWide,
                  {
                    height: isWideLayout
                      ? Math.min(520, Math.max(320, height * 0.58))
                      : Math.min(360, Math.max(220, height * 0.36)),
                  },
                ]}
              >
                <View
                  style={styles.onboardingHeroBackground}
                >
                  <Image source={ONBOARDING_LOGO} style={styles.onboardingHeroLogo} resizeMode="contain" />
                </View>
              </View>

              <View
                style={[
                  styles.walkthroughDetails,
                  isWideLayout && styles.walkthroughDetailsWide,
                ]}
              >
                <View style={[styles.slideCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.slideIconWrap, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name={SLIDES[slideIndex].icon} size={48} color={theme.primary} />
                  </View>
                  <Text style={[styles.slideTitle, { color: theme.text }]}>
                    {SLIDES[slideIndex].title}
                  </Text>
                  <Text style={[styles.slideSubtitle, { color: theme.textSecondary }]}>
                    {SLIDES[slideIndex].subtitle}
                  </Text>

                  {/* Dot pagination */}
                  <View style={styles.dotsRow}>
                    {SLIDES.map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          {
                            backgroundColor: i === slideIndex ? theme.primary : theme.border,
                            width: i === slideIndex ? 24 : 8,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Navigation buttons */}
                <View style={styles.actionButtonsCol}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                    onPress={handleNextSlide}
                  >
                    <Text style={styles.primaryBtnText}>
                      {slideIndex < SLIDES.length - 1 ? 'Continue' : 'Get Started'}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </TouchableOpacity>

                </View>
              </View>
            </View>
          ) : (
            /* Quick Setup */
            <View
              style={[
                styles.setupCard,
                isWideLayout && styles.setupCardWide,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.setupIcon,
                  { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                ]}
              >
                <Ionicons name="person" size={24} color={theme.primary} />
              </View>
              <Text style={[styles.setupTitle, { color: theme.text }]}>Quick Setup</Text>
              <Text style={[styles.setupSubtitle, { color: theme.textSecondary }]}>
                Personalize your studyTrack experience
              </Text>

              <View style={styles.setupForm}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>YOUR NAME</Text>
                <View style={[styles.setupInputWrap, { borderColor: theme.primary }]}>
                  <Ionicons name="person-outline" size={18} color={theme.primary} />
                  <TextInput
                    style={[styles.setupInput, { color: theme.text }]}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.textTertiary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={handleSetup}
                  />
                </View>

                <View style={[styles.setupInfo, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="information-circle" size={18} color={theme.primary} />
                  <Text style={[styles.setupInfoText, { color: theme.primary }]}>
                    Your data stays on your device.{'\n'}No account or password needed.
                  </Text>
                </View>
              </View>

              {errorMessage ? (
                <View style={[styles.errorBox, { backgroundColor: theme.danger + '18' }]}>
                  <Ionicons name="alert-circle" size={18} color={theme.danger} />
                  <Text style={[styles.errorText, { color: theme.danger }]}>{errorMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.setupButton,
                  { backgroundColor: theme.primary },
                  submitting && { opacity: 0.7 },
                ]}
                onPress={handleSetup}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Get Started</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backToSlidesBtn}
                onPress={() => setAuthMode('walkthrough')}
              >
                <Ionicons name="arrow-back" size={16} color={theme.textSecondary} />
                <Text style={[styles.backToSlidesText, { color: theme.textSecondary }]}>
                  Back to Intro
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
    justifyContent: 'center',
  },
  walkthroughContainer: {
    gap: 20,
  },
  walkthroughContainerWide: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  onboardingHero: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  onboardingHeroWide: {
    flex: 1,
  },
  onboardingHeroBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingHeroLogo: {
    width: 220,
    height: 220,
  },
  walkthroughDetails: {
    gap: 20,
  },
  walkthroughDetailsWide: {
    flex: 1,
    maxWidth: 520,
  },
  slideCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  slideIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  slideSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  actionButtonsCol: {
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  authCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tabSelector: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  guestAltBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  guestAltBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  backToSlidesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 4,
  },
  backToSlidesText: {
    fontSize: 13,
    fontWeight: '500',
  },
  setupCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  setupCardWide: {
    maxWidth: 620,
  },
  setupIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  setupSubtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  setupForm: {
    width: '100%',
  },
  setupInputWrap: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  setupInput: {
    flex: 1,
    fontSize: 15,
  },
  setupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  setupInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  setupButton: {
    width: '100%',
    marginTop: 20,
  },
});
