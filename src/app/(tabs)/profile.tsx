import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useStudy } from '@/context/StudyContext';
import { useSettings } from '@/settings/SettingsContext';
import { useTheme } from '@/theme';
import { AcademicPeriodModal } from '@/components/AcademicPeriodModal';
import { pickImage } from '@/attachments/files';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { currentUser, logout, updateUser } = useAuth();
  const { settings, update: updateSetting } = useSettings();
  const {
    goals,
    updateGoals,
    completedCount,
    tasks,
    subjects,
    weeklyHoursStudied,
    studySessions,
    activePeriod,
    academicPeriods,
  } = useStudy();

  const [showPeriodModal, setShowPeriodModal] = useState(false);

  // Edit profile modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser?.name || '');
  const [majorInput, setMajorInput] = useState(currentUser?.major || '');
  const [instInput, setInstInput] = useState(currentUser?.institution || '');
  const [colorInput, setColorInput] = useState(currentUser?.avatar_color || '#4F46E5');
  const [avatarUri, setAvatarUri] = useState<string | null>(currentUser?.avatar_uri || null);

  // Goals edit modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(
    (goals?.weekly_hours_target || 15).toString()
  );
  const [dailyTaskInput, setDailyTaskInput] = useState(
    (goals?.daily_tasks_target || 4).toString()
  );

  const handleSaveProfile = async () => {
    if (!nameInput.trim()) return;
    await updateUser({
      name: nameInput.trim(),
      major: majorInput.trim(),
      institution: instInput.trim(),
      avatar_color: colorInput,
      avatar_uri: avatarUri,
    });
    updateSetting('nickname', nameInput.trim());
    setShowEditModal(false);
  };

  const handleSaveGoals = async () => {
    const hours = parseFloat(weeklyGoalInput) || 15;
    const taskCount = parseInt(dailyTaskInput, 10) || 4;
    await updateGoals({
      weekly_hours_target: hours,
      daily_tasks_target: taskCount,
    });
    setShowGoalModal(false);
  };

  // Logout confirmation modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const executeLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    updateSetting('onboarded', false);
    router.replace('/onboarding' as Href);
  };

  const confirmLogout = () => {
    setShowLogoutModal(true);
  };

  const totalFocusHours = Math.round(
    (studySessions.reduce((sum, s) => sum + s.duration_seconds, 0) / 3600) * 10
  ) / 10;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Title & Top Logout Button */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { color: theme.text }]}>Student Profile</Text>
          <Text style={[styles.screenSubtitle, { color: theme.textSecondary }]}>
            Account & Academic Preferences
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.headerLogoutBtn, { backgroundColor: theme.danger + '18', borderColor: theme.danger + '40' }]}
          onPress={confirmLogout}
          accessibilityLabel="Log Out"
        >
          <Ionicons name="log-out-outline" size={17} color={theme.danger} />
          <Text style={[styles.headerLogoutText, { color: theme.danger }]}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* User Card */}
      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.profileRow}>
          <View
            style={[
              styles.avatarLarge,
              { backgroundColor: currentUser?.avatar_color || theme.primary, overflow: 'hidden' },
            ]}
          >
            {currentUser?.avatar_uri ? (
              <Image
                source={{ uri: currentUser.avatar_uri }}
                style={styles.avatarPhoto}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarInitials}>
                {(currentUser?.name || 'S')[0].toUpperCase()}
              </Text>
            )}
          </View>

          <View style={styles.profileInfoCol}>
            <Text style={[styles.profileName, { color: theme.text }]}>
              {currentUser?.name || 'Student Name'}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
              {currentUser?.email || 'student@university.edu'}
            </Text>
            <View style={[styles.majorBadge, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="school" size={13} color={theme.primary} />
              <Text style={[styles.majorBadgeText, { color: theme.primary }]}>
                {currentUser?.major || 'Degree Major'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.editIconBtn, { backgroundColor: theme.cardAlt }]}
            onPress={() => {
              setNameInput(currentUser?.name || '');
              setMajorInput(currentUser?.major || '');
              setInstInput(currentUser?.institution || '');
              setColorInput(currentUser?.avatar_color || '#4F46E5');
              setAvatarUri(currentUser?.avatar_uri || null);
              setShowEditModal(true);
            }}
          >
            <Ionicons name="pencil" size={18} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {currentUser?.institution ? (
          <View style={[styles.institutionRow, { borderColor: theme.border }]}>
            <Ionicons name="business-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.institutionText, { color: theme.textSecondary }]}>
              {currentUser.institution}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Study Stats Summary */}
      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="time-outline" size={24} color={theme.primary} />
          <Text style={[styles.statValue, { color: theme.text }]}>{weeklyHoursStudied}h</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>This Week</Text>
        </View>

        <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="checkmark-done-circle-outline" size={24} color={theme.success} />
          <Text style={[styles.statValue, { color: theme.text }]}>
            {completedCount}/{tasks.length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Tasks Done</Text>
        </View>

        <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="book-outline" size={24} color={theme.warning} />
          <Text style={[styles.statValue, { color: theme.text }]}>{subjects.length}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Courses</Text>
        </View>

        <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="flame-outline" size={24} color={theme.danger} />
          <Text style={[styles.statValue, { color: theme.text }]}>{totalFocusHours}h</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Focus</Text>
        </View>
      </View>

      {/* Study Goals Section */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>Academic Targets</Text>
        <TouchableOpacity
          onPress={() => {
            setWeeklyGoalInput((goals?.weekly_hours_target || 15).toString());
            setDailyTaskInput((goals?.daily_tasks_target || 4).toString());
            setShowGoalModal(true);
          }}
        >
          <Text style={[styles.sectionEditLink, { color: theme.primary }]}>Change Target</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.goalsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.goalRow}>
          <View style={styles.goalInfo}>
            <Text style={[styles.goalTitle, { color: theme.text }]}>Weekly Study Hours</Text>
            <Text style={[styles.goalSub, { color: theme.textSecondary }]}>
              Recommended 15-20 hours for active college semesters
            </Text>
          </View>
          <View style={[styles.goalValBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.goalValText, { color: theme.primary }]}>
              {goals?.weekly_hours_target || 15} hrs/wk
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.goalRow}>
          <View style={styles.goalInfo}>
            <Text style={[styles.goalTitle, { color: theme.text }]}>Daily Task Completion Target</Text>
            <Text style={[styles.goalSub, { color: theme.textSecondary }]}>
              Daily milestones keep you free from exam cramming
            </Text>
          </View>
          <View style={[styles.goalValBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.goalValText, { color: theme.primary }]}>
              {goals?.daily_tasks_target || 4} tasks/day
            </Text>
          </View>
        </View>
      </View>

      {/* Academic Term */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>Academic Term</Text>
        <TouchableOpacity onPress={() => setShowPeriodModal(true)}>
          <Text style={[styles.sectionEditLink, { color: theme.primary }]}>Change Term</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => setShowPeriodModal(true)}
        activeOpacity={0.8}
        style={[styles.goalsCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <View style={styles.goalRow}>
          <View style={styles.goalInfo}>
            <Text style={[styles.goalTitle, { color: theme.text }]}>
              {activePeriod ? activePeriod.semester : 'No Active Term'}
            </Text>
            <Text style={[styles.goalSub, { color: theme.textSecondary }]}>
              {activePeriod ? activePeriod.academic_year : 'Tap to select semester and year'}
            </Text>
          </View>
          <View style={[styles.goalValBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.goalValText, { color: theme.primary }]}>
              {academicPeriods.length} Terms Available
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* App Preferences */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>App Preferences</Text>
      </View>

      <View style={[styles.preferencesCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Dark Mode */}
        <View style={styles.preferenceRow}>
          <View style={styles.prefIconWrap}>
            <Ionicons name="moon-outline" size={20} color={theme.text} />
          </View>
          <View style={styles.prefTextCol}>
            <Text style={[styles.prefTitle, { color: theme.text }]}>Dark Mode</Text>
            <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
              Easy on your eyes during late-night study
            </Text>
          </View>
          <Switch
            value={settings.theme === 'dark'}
            onValueChange={(val) => updateSetting('theme', val ? 'dark' : 'light')}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Notifications */}
        <View style={styles.preferenceRow}>
          <View style={styles.prefIconWrap}>
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
          </View>
          <View style={styles.prefTextCol}>
            <Text style={[styles.prefTitle, { color: theme.text }]}>Class & Deadline Reminders</Text>
            <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
              Weekly class alerts one hour before class, including offline
            </Text>
          </View>
          <Switch
            value={Boolean(goals?.notifications_enabled ?? 1)}
            onValueChange={(val) => updateGoals({ notifications_enabled: val ? 1 : 0 })}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* AI Study Assistant Settings */}
        <TouchableOpacity
          style={styles.preferenceRow}
          onPress={() => router.push('/chat-settings' as Href)}
        >
          <View style={styles.prefIconWrap}>
            <Ionicons name="sparkles-outline" size={20} color={theme.primary} />
          </View>
          <View style={styles.prefTextCol}>
            <Text style={[styles.prefTitle, { color: theme.text }]}>AI Tutor Configuration</Text>
            <Text style={[styles.prefSub, { color: theme.textSecondary }]}>
              Configure Gemini API key or local on-device Gemma AI
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Account & Logout */}
      <View style={[styles.accountActionsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.danger} />
          <Text style={[styles.logoutBtnText, { color: theme.danger }]}>Sign Out of StudyTrack</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerBranding}>
        <Image
          source={require('../../../assets/images/icon.png')}
          style={styles.footerLogo}
          resizeMode="contain"
        />
        <Text style={[styles.versionText, { color: theme.textTertiary }]}>
          StudyTrack v1.0.0 • SQLite Offline-First Academic Workspace
        </Text>
      </View>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeading, { color: theme.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Profile Picture</Text>
              <View style={styles.avatarPickerRow}>
                <View
                  style={[
                    styles.avatarPreview,
                    { backgroundColor: colorInput, overflow: 'hidden' },
                  ]}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarPhoto}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.avatarInitials}>
                      {(nameInput || 'S')[0].toUpperCase()}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.avatarPickerBtn, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}
                  onPress={async () => {
                    const uri = await pickImage();
                    if (uri) setAvatarUri(uri);
                  }}
                >
                  <Ionicons name="camera-outline" size={18} color={theme.primary} />
                  <Text style={[styles.avatarPickerText, { color: theme.primary }]}>
                    {avatarUri ? 'Change Photo' : 'Add Photo'}
                  </Text>
                </TouchableOpacity>
                {avatarUri ? (
                  <TouchableOpacity
                    style={styles.removeAvatarBtn}
                    onPress={() => setAvatarUri(null)}
                    accessibilityLabel="Remove profile picture"
                  >
                    <Ionicons name="close-circle" size={22} color={theme.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Student Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                value={nameInput}
                onChangeText={setNameInput}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Degree / Major</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                value={majorInput}
                onChangeText={setMajorInput}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>School / College</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                value={instInput}
                onChangeText={setInstInput}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Avatar Badge Color</Text>
              <View style={styles.colorPaletteRow}>
                {theme.subjectColors.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      colorInput === c && styles.colorDotSelected,
                    ]}
                    onPress={() => setColorInput(c)}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary, marginTop: 18 }]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.saveBtnText}>Save Profile</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GOALS MODAL */}
      <Modal visible={showGoalModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeading, { color: theme.text }]}>Study Goal Targets</Text>
              <TouchableOpacity onPress={() => setShowGoalModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.text }]}>Weekly Study Hours Target</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
              value={weeklyGoalInput}
              onChangeText={setWeeklyGoalInput}
              keyboardType="numeric"
              placeholder="e.g. 15"
            />

            <Text style={[styles.inputLabel, { color: theme.text }]}>Daily Task Completion Target</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
              value={dailyTaskInput}
              onChangeText={setDailyTaskInput}
              keyboardType="numeric"
              placeholder="e.g. 4"
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: theme.primary, marginTop: 18 }]}
              onPress={handleSaveGoals}
            >
              <Text style={styles.saveBtnText}>Update Targets</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Academic Period Switcher Modal */}
      <AcademicPeriodModal visible={showPeriodModal} onClose={() => setShowPeriodModal(false)} />

      {/* LOGOUT CONFIRMATION MODAL */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.centerModalOverlay}>
          <View style={[styles.logoutModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.logoutModalIconWrap, { backgroundColor: theme.danger + '18' }]}>
              <Ionicons name="log-out-outline" size={32} color={theme.danger} />
            </View>
            <Text style={[styles.logoutModalTitle, { color: theme.text }]}>Log Out of StudyTrack?</Text>
            <Text style={[styles.logoutModalSub, { color: theme.textSecondary }]}>
              Are you sure you want to sign out? Your offline courses, tasks, and grades will remain safely stored on this device.
            </Text>
            <View style={styles.logoutModalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: theme.cardAlt }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDestructiveBtn, { backgroundColor: theme.danger }]}
                onPress={executeLogout}
              >
                <Text style={styles.modalDestructiveText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerLogoutText: {
    fontSize: 13,
    fontWeight: '700',
  },
  screenTitle: { fontSize: 24, fontWeight: '800' },
  screenSubtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  profileCard: {
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    marginBottom: 20,
    gap: 14,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitials: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  avatarPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatarPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  avatarPickerText: { fontSize: 14, fontWeight: '700' },
  removeAvatarBtn: { padding: 4 },
  profileInfoCol: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontWeight: '800' },
  profileEmail: { fontSize: 13 },
  majorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  majorBadgeText: { fontSize: 11, fontWeight: '700' },
  editIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  institutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  institutionText: { fontSize: 13, fontWeight: '500' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 22,
  },
  statBox: {
    width: '48%',
    flexGrow: 1,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeading: { fontSize: 17, fontWeight: '800' },
  sectionEditLink: { fontSize: 13, fontWeight: '700' },
  goalsCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 22,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  goalInfo: { flex: 1 },
  goalTitle: { fontSize: 14, fontWeight: '700' },
  goalSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  goalValBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  goalValText: { fontSize: 12, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  preferencesCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 22,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  prefIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefTextCol: { flex: 1 },
  prefTitle: { fontSize: 14, fontWeight: '700' },
  prefSub: { fontSize: 12, marginTop: 2 },
  accountActionsCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  logoutBtnText: { fontSize: 15, fontWeight: '700' },
  footerBranding: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 24,
    gap: 8,
  },
  footerLogo: {
    width: 40,
    height: 40,
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalHeading: { fontSize: 20, fontWeight: '800' },
  inputLabel: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  formInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  colorPaletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: '#000000' },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  logoutModalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoutModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  logoutModalSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  logoutModalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalDestructiveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDestructiveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
