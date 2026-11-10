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

const ONBOARDING_LOGO = require('../../assets/images/app-icon-transparent.png');

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
  const { login, register, guestLogin } = useAuth();
  const { width, height } = useWindowDimensions();
  const isWideLayout = width >= 820;

  const [slideIndex, setSlideIndex] = useState(0);
  const [authMode, setAuthMode] = useState<'walkthrough' | 'login' | 'register'>('walkthrough');

  // Form states
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [major, setMajor] = useState('');
  const [institution, setInstitution] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleNextSlide = () => {
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex(slideIndex + 1);
    } else {
      setAuthMode('login');
    }
  };

  const handleLogin = async () => {
    setErrorMessage('');
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setSubmitting(true);
    const res = await login(username, password);
    setSubmitting(false);

    if (res.success) {
      update('onboarded', true);
      update('nickname', username.trim());
    } else {
      setErrorMessage(res.error || 'Failed to sign in.');
    }
  };

  const handleRegister = async () => {
    setErrorMessage('');
    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username.trim())) {
      setErrorMessage('Username must be 3–30 characters and use only letters, numbers, dots, underscores, or hyphens.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 4) {
      setErrorMessage('Password must be at least 4 characters long.');
      return;
    }

    setSubmitting(true);
    const res = await register({
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      major: major.trim() || 'Computer Science',
      institution: institution.trim() || 'University',
    });
    setSubmitting(false);

    if (res.success) {
      update('onboarded', true);
      update('nickname', name.trim());
    } else {
      setErrorMessage(res.error || 'Registration failed.');
    }
  };

  const handleGuestAccess = async () => {
    setSubmitting(true);
    await guestLogin();
    setSubmitting(false);
    update('onboarded', true);
    update('nickname', 'Alex');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isWideLayout && styles.scrollContentWide]}
          keyboardShouldPersistTaps="handled"
        >
          {authMode === 'walkthrough' ? (
            /* Intro Carousel */
            <View style={[styles.walkthroughContainer, isWideLayout && styles.wideContent]}>
              <View
                style={[
                  styles.onboardingHero,
                  { height: Math.min(360, Math.max(300, height * 0.4)) },
                ]}
              >
                <View
                  style={[
                    styles.onboardingHeroBackground,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <Image source={ONBOARDING_LOGO} style={styles.onboardingHeroLogo} resizeMode="contain" />
                </View>
              </View>

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

                <TouchableOpacity
                  style={[styles.ghostBtn, { borderColor: theme.border }]}
                  onPress={handleGuestAccess}
                >
                  <Ionicons name="flash-outline" size={18} color={theme.text} />
                  <Text style={[styles.ghostBtnText, { color: theme.text }]}>
                    Explore Demo as Guest
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => setAuthMode('login')}
                >
                  <Text style={[styles.linkBtnText, { color: theme.primary }]}>
                    Already have an account? Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Auth Forms: Login / Register */
            <View style={[styles.authCard, isWideLayout && styles.wideContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Tab Selector */}
              <View style={[styles.tabSelector, { backgroundColor: theme.cardAlt }]}>
                <TouchableOpacity
                  style={[
                    styles.tabItem,
                    authMode === 'login' && { backgroundColor: theme.card, shadowOpacity: 0.1 },
                  ]}
                  onPress={() => {
                    setAuthMode('login');
                    setErrorMessage('');
                  }}
                >
                  <Text
                    style={[
                      styles.tabItemText,
                      { color: authMode === 'login' ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    Sign In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tabItem,
                    authMode === 'register' && { backgroundColor: theme.card, shadowOpacity: 0.1 },
                  ]}
                  onPress={() => {
                    setAuthMode('register');
                    setErrorMessage('');
                  }}
                >
                  <Text
                    style={[
                      styles.tabItemText,
                      { color: authMode === 'register' ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error notice */}
              {errorMessage ? (
                <View style={[styles.errorBox, { backgroundColor: theme.danger + '18' }]}>
                  <Ionicons name="alert-circle" size={18} color={theme.danger} />
                  <Text style={[styles.errorText, { color: theme.danger }]}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Form Fields */}
              {authMode === 'register' && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Full Name</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        {
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                      placeholder="e.g. Alex Rivera"
                      placeholderTextColor={theme.textTertiary}
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Username</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        {
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                      placeholder="e.g. alexrivera"
                      placeholderTextColor={theme.textTertiary}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Major / Degree</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        {
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                      placeholder="e.g. Computer Science & Engineering"
                      placeholderTextColor={theme.textTertiary}
                      value={major}
                      onChangeText={setMajor}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>School / College</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        {
                          backgroundColor: theme.inputBackground,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                      placeholder="e.g. State University"
                      placeholderTextColor={theme.textTertiary}
                      value={institution}
                      onChangeText={setInstitution}
                    />
                  </View>
                </>
              )}

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>
                  {authMode === 'login' ? 'Username or Email' : 'Email Address'}
                </Text>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      backgroundColor: theme.inputBackground,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  placeholder={authMode === 'login' ? 'Your username' : 'student@university.edu'}
                  placeholderTextColor={theme.textTertiary}
                  value={authMode === 'login' ? username : email}
                  onChangeText={authMode === 'login' ? setUsername : setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={authMode === 'login' ? 'default' : 'email-address'}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>Password</Text>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      backgroundColor: theme.inputBackground,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  placeholder="Enter your password"
                  placeholderTextColor={theme.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: theme.primary, marginTop: 12 },
                  submitting && { opacity: 0.7 },
                ]}
                onPress={authMode === 'login' ? handleLogin : handleRegister}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>
                      {authMode === 'login' ? 'Sign In' : 'Create My Account'}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Guest Login */}
              <TouchableOpacity
                style={[styles.guestAltBtn, { backgroundColor: theme.cardAlt }]}
                onPress={handleGuestAccess}
                disabled={submitting}
              >
                <Ionicons name="flash" size={16} color={theme.primary} />
                <Text style={[styles.guestAltBtnText, { color: theme.primary }]}>
                  Continue with Demo Account (Alex Rivera)
                </Text>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
    justifyContent: 'center',
  },
  scrollContentWide: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  wideContent: {
    flex: 1,
  },
  walkthroughContainer: {
    gap: 20,
  },
  onboardingHero: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  onboardingHeroBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingHeroLogo: {
    width: '55%',
    height: '55%',
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
});
