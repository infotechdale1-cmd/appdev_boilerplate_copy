import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AcademicPeriodModal } from '@/components/AcademicPeriodModal';
import { FloatingQuickAction } from '@/components/FloatingQuickAction';
import { useAuth } from '@/context/AuthContext';
import { useStudy, type SubjectGradeStats } from '@/context/StudyContext';
import { cancelFocusAlarm, scheduleFocusAlarm } from '@/services/notifications';
import { useSettings } from '@/settings/SettingsContext';
import type { FocusAlarmSound } from '@/settings/storage';
import { useTheme } from '@/theme';
import ProgressRing from '@/components/ProgressRing';

const TIMER_PRESETS = [
  { label: '25 min', seconds: 25 * 60 },
  { label: '45 min', seconds: 45 * 60 },
  { label: '60 min', seconds: 60 * 60 },
  { label: '90 min', seconds: 90 * 60 },
];

export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const { settings, update: updateSettings } = useSettings();
  const { currentUser } = useAuth();
  const {
    tasks,
    subjects,
    schedules,
    todaySchedules,
    urgentTasks,
    completedCount,
    pendingCount,
    weeklyHoursStudied,
    progressPercentage,
    goals,
    notifications,
    unreadNotificationsCount,
    activePeriod,
    semesterGWA,
    semesterAveragePercentage,
    failingSubjects,
    gradingMode,
    toggleTask,
    createTask,
    createSubject,
    recordFocusSession,
    markNotificationRead,
    clearAllNotifications,
  } = useStudy();

  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showNotifsModal, setShowNotifsModal] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<SubjectGradeStats | null>(null);

  // New task form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskSubjectId, setNewTaskSubjectId] = useState(subjects[0]?.id || '');
  const [newTaskDueDate, setNewTaskDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTaskDueTime, setNewTaskDueTime] = useState('18:00');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');

  // New subject form with percentages
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubColor, setNewSubColor] = useState(theme.subjectColors[0]);
  const [newSubProf, setNewSubProf] = useState('');
  const [newSubRoom, setNewSubRoom] = useState('');
  const [newSubQuizWeight, setNewSubQuizWeight] = useState('25');
  const [newSubExamWeight, setNewSubExamWeight] = useState('40');
  const [newSubActivityWeight, setNewSubActivityWeight] = useState('25');
  const [newSubAttendanceWeight, setNewSubAttendanceWeight] = useState('10');

  // Focus Timer state
  const [timerPresetIdx, setTimerPresetIdx] = useState(0);
  const [isCustomTimer, setIsCustomTimer] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState('30');
  const [timerSeconds, setTimerSeconds] = useState(TIMER_PRESETS[0].seconds);
  const [timerMaxSeconds, setTimerMaxSeconds] = useState(TIMER_PRESETS[0].seconds);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSubjectId, setTimerSubjectId] = useState('');
  const [focusAlarmId, setFocusAlarmId] = useState<string | null>(null);
  const [completionTimeout, setCompletionTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [alarmScheduling, setAlarmScheduling] = useState(false);
  const timerRingSize = Math.min(180, Math.max(130, width * 0.46));

  // Pulse animation for timer
  const [pulseAnim] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (timerRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [timerRunning, pulseAnim]);

  // Timer interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (timerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  const selectTimerPreset = (idx: number) => {
    if (timerRunning) return;
    setIsCustomTimer(false);
    setTimerPresetIdx(idx);
    const mins = Math.round(TIMER_PRESETS[idx].seconds / 60);
    setCustomMinutesInput(String(mins));
    setTimerSeconds(TIMER_PRESETS[idx].seconds);
    setTimerMaxSeconds(TIMER_PRESETS[idx].seconds);
  };

  const enableCustomTimer = () => {
    if (timerRunning) return;
    setIsCustomTimer(true);
    setTimerPresetIdx(-1);
    const mins = Math.max(1, Math.min(300, parseInt(customMinutesInput, 10) || 30));
    setCustomMinutesInput(String(mins));
    setTimerSeconds(mins * 60);
    setTimerMaxSeconds(mins * 60);
  };

  const handleCustomMinutesChange = (text: string) => {
    if (timerRunning) return;
    const clean = text.replace(/[^0-9]/g, '');
    setCustomMinutesInput(clean);
    setTimerPresetIdx(-1);
    setIsCustomTimer(true);
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const clamped = Math.min(300, parsed);
      setTimerSeconds(clamped * 60);
      setTimerMaxSeconds(clamped * 60);
    }
  };

  const adjustCustomMinutes = (delta: number) => {
    if (timerRunning) return;
    setTimerPresetIdx(-1);
    setIsCustomTimer(true);
    const cur = parseInt(customMinutesInput, 10) || 30;
    const next = Math.max(1, Math.min(300, cur + delta));
    setCustomMinutesInput(String(next));
    setTimerSeconds(next * 60);
    setTimerMaxSeconds(next * 60);
  };

  const resetTimer = () => {
    if (completionTimeout) clearTimeout(completionTimeout);
    setCompletionTimeout(null);
    const alarmId = focusAlarmId;
    setFocusAlarmId(null);
    void cancelFocusAlarm(alarmId).catch((error: unknown) => {
      Alert.alert('Alarm could not be cancelled', error instanceof Error ? error.message : 'Please try again.');
    });
    setTimerRunning(false);
    setTimerSeconds(timerMaxSeconds);
  };

  const completeFocusTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setCompletionTimeout(null);
    setFocusAlarmId(null);
    const elapsed = timerMaxSeconds;
    void recordFocusSession(
      elapsed,
      timerSubjectId || undefined,
      `Completed ${Math.round(elapsed / 60)}-minute focus session`
    ).catch((error: unknown) => {
      Alert.alert('Session could not be saved', error instanceof Error ? error.message : 'Please try again.');
    });
    Alert.alert('🎉 Session Complete!', `You focused for ${Math.round(elapsed / 60)} minutes. Great work!`);
  };

  const handleTimerToggle = async () => {
    if (timerRunning) {
      try {
        await cancelFocusAlarm(focusAlarmId);
        setFocusAlarmId(null);
        if (completionTimeout) clearTimeout(completionTimeout);
        setCompletionTimeout(null);
        setTimerRunning(false);
      } catch (error: unknown) {
        Alert.alert('Alarm could not be paused', error instanceof Error ? error.message : 'Please try again.');
      }
      return;
    }

    if (timerSeconds <= 0) {
      setTimerSeconds(timerMaxSeconds);
    }
    setAlarmScheduling(true);
    try {
      const duration = timerSeconds > 0 ? timerSeconds : timerMaxSeconds;
      const alarmId = await scheduleFocusAlarm(duration, settings.focusAlarmSound);
      setFocusAlarmId(alarmId);
      setCompletionTimeout(setTimeout(completeFocusTimer, duration * 1000));
      setTimerRunning(true);
    } catch (error: unknown) {
      Alert.alert(
        'Could not start focus alarm',
        error instanceof Error ? error.message : 'Please check your notification settings and try again.'
      );
    } finally {
      setAlarmScheduling(false);
    }
  };

  const logCurrentProgress = async () => {
    const elapsed = timerMaxSeconds - timerSeconds;
    if (elapsed < 60) {
      Alert.alert('Too short', 'Minimum 1 minute to log a session.');
      return;
    }
    setTimerRunning(false);
    if (completionTimeout) clearTimeout(completionTimeout);
    setCompletionTimeout(null);
    const alarmId = focusAlarmId;
    setFocusAlarmId(null);
    try {
      await cancelFocusAlarm(alarmId);
      await recordFocusSession(elapsed, timerSubjectId || undefined, 'Manually logged focus session');
      Alert.alert('Session Logged!', `${Math.round(elapsed / 60)} minutes logged to your weekly goal.`);
      setTimerSeconds(timerMaxSeconds);
    } catch (error: unknown) {
      Alert.alert('Session could not be saved', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const formatTimerTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const timerProgress = timerMaxSeconds > 0
    ? Math.round(((timerMaxSeconds - timerSeconds) / timerMaxSeconds) * 100)
    : 0;

  // Form submission handlers
  const handleSaveTask = async () => {
    if (!newTaskTitle.trim()) return;
    await createTask({
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      subject_id: newTaskSubjectId || undefined,
      due_date: newTaskDueDate,
      due_time: newTaskDueTime,
      priority: newTaskPriority,
      estimated_minutes: 45,
    });
    setNewTaskTitle('');
    setNewTaskDesc('');
    setShowTaskModal(false);
  };

  const handleSaveSubject = async () => {
    if (!newSubName.trim() || !newSubCode.trim()) return;
    const qW = parseFloat(newSubQuizWeight) || 25;
    const eW = parseFloat(newSubExamWeight) || 40;
    const actW = parseFloat(newSubActivityWeight) || 25;
    const attW = parseFloat(newSubAttendanceWeight) || 10;
    await createSubject({
      name: newSubName.trim(),
      code: newSubCode.trim().toUpperCase(),
      color: newSubColor,
      professor: newSubProf.trim(),
      room: newSubRoom.trim(),
      credits: 3.0,
      target_grade: 90.0,
      passing_grade: 75.0,
      quiz_weight: qW,
      exam_weight: eW,
      activity_weight: actW,
      attendance_weight: attW,
    });
    setNewSubName('');
    setNewSubCode('');
    setNewSubProf('');
    setNewSubRoom('');
    setNewSubQuizWeight('25');
    setNewSubExamWeight('40');
    setNewSubActivityWeight('25');
    setNewSubAttendanceWeight('10');
    setShowSubjectModal(false);
  };

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const getSubject = (id?: string) => subjects.find((s) => s.id === id);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const priorityColor = (p: string) => {
    if (p === 'high') return theme.danger;
    if (p === 'medium') return theme.warning;
    return theme.success;
  };

  const notifIcon = (type: string): React.ComponentProps<typeof Ionicons>['name'] => {
    if (type === 'deadline') return 'alarm-outline';
    if (type === 'achievement') return 'trophy-outline';
    if (type === 'schedule') return 'calendar-outline';
    return 'information-circle-outline';
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.desktopContainer]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── TOP HEADER ─────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <Image
              source={require('../../../assets/images/mascot-transparent.png')}
              style={{ width: 50, height: 50 }}
              resizeMode="contain"
            />
            <View style={styles.userInfoCol}>
              <Text style={[styles.dateText, { color: theme.textSecondary }]}>{formattedDate}</Text>
              <Text style={[styles.greetingText, { color: theme.text }]}>
                {getGreeting()}, {currentUser?.name?.split(' ')[0] || 'Student'}! 👋
              </Text>
            <TouchableOpacity
              onPress={() => setShowPeriodModal(true)}
              style={[styles.periodBadge, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name="calendar-outline" size={13} color={theme.primary} />
              <Text style={[styles.periodBadgeText, { color: theme.text }]}>
                {activePeriod ? `${activePeriod.semester} • ${activePeriod.academic_year}` : 'Select Term'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setShowTimerModal(true)}
            accessibilityLabel="Open Focus Timer"
          >
            <Ionicons name="timer-outline" size={20} color={theme.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setShowNotifsModal(true)}
            accessibilityLabel="Open Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
            {unreadNotificationsCount > 0 && (
              <View style={[styles.badgeDot, { backgroundColor: theme.danger }]}>
                <Text style={styles.badgeText}>
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.avatarCircle, { backgroundColor: currentUser?.avatar_color || theme.primary }]}
            onPress={() => router.push('/profile' as Href)}
            accessibilityLabel="Go to Profile"
          >
            <Text style={styles.avatarInitials}>
              {(currentUser?.name || 'S')[0].toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ACADEMIC FAILING ALERT CARD ────────────────── */}
      {failingSubjects.length > 0 && (
        <View style={[styles.academicAlertHero, { backgroundColor: '#EF444415', borderColor: '#EF444455' }]}>
          <View style={styles.alertHeroTop}>
            <View style={[styles.alertIconCircle, { backgroundColor: '#EF444425' }]}>
              <Ionicons name="warning" size={24} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertHeroTitle}>
                Academic Warning: {failingSubjects.length} Course(s) Failing (&gt; 3.00)
              </Text>
              <Text style={[styles.alertHeroSub, { color: theme.textSecondary }]}>
                Philippine passing grade is 3.00. Courses in the 3.10 – 5.00 range need intervention.
              </Text>
            </View>
          </View>

          <View style={styles.failingCoursesRow}>
            {failingSubjects.map((f) => (
              <View
                key={f.subjectId}
                style={[styles.failingCourseChip, { backgroundColor: theme.card, borderColor: '#EF444450' }]}
              >
                <Text style={[styles.failingCourseChipText, { color: theme.text }]}>
                  {f.subjectCode}: <Text style={{ color: '#EF4444', fontWeight: '800' }}>Grade {f.phScale.toFixed(2)}</Text>
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.alertHeroActionBtn, { backgroundColor: theme.primary }]}
            onPress={() => setSelectedIntervention(failingSubjects[0])}
          >
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
            <Text style={styles.alertHeroActionBtnText}>Review AI Academic Intervention</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── HERO PROGRESS CARD ─────────────────────────── */}
      <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroLabel}>Weekly Study Goal</Text>
          <Text style={styles.heroHours}>
            {weeklyHoursStudied}
            <Text style={styles.heroHoursUnit}>
              {' '}/ {goals?.weekly_hours_target || 15} hrs
            </Text>
          </Text>
          <Text style={styles.heroSub}>
            {progressPercentage}% of your weekly target achieved
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.statPill}>
              <Ionicons name="checkmark-circle" size={14} color="#A7F3D0" />
              <Text style={styles.statPillText}>{completedCount} done</Text>
            </View>
            <View style={styles.statPill}>
              <Ionicons name="time" size={14} color="#FDE68A" />
              <Text style={styles.statPillText}>{pendingCount} pending</Text>
            </View>
          </View>
        </View>

        <ProgressRing
          size={110}
          strokeWidth={9}
          progress={progressPercentage}
          trackColor="rgba(255,255,255,0.2)"
          gradientStart="#FFFFFF"
          gradientEnd="#C7D2FE"
        >
          <Text style={styles.ringPercent}>{progressPercentage}%</Text>
        </ProgressRing>
      </View>

      {/* ── ACADEMIC GRADES QUICK CARD ──────────────────── */}
      <TouchableOpacity
        onPress={() => router.push('/grades' as Href)}
        activeOpacity={0.85}
        style={[styles.gradesCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <View style={styles.gradesCardLeft}>
          <View style={[styles.gradesIconWrap, { backgroundColor: theme.primary + '18' }]}>
            <Ionicons name="school-outline" size={20} color={theme.primary} />
          </View>
          <View style={styles.gradesCardInfo}>
            <Text style={[styles.gradesCardTitle, { color: theme.text }]}>Academic Performance & Grades</Text>
            <Text style={[styles.gradesCardSubtitle, { color: theme.textSecondary }]}>
              {subjects.length === 0
                ? 'No subjects or assessments exist for this semester.'
                : gradingMode === 'college'
                ? `${subjects.length} Course${subjects.length > 1 ? 's' : ''} • ${semesterGWA > 0 ? `GWA ${semesterGWA.toFixed(2)}` : 'No scores yet'}`
                : `${subjects.length} Course${subjects.length > 1 ? 's' : ''} • ${semesterAveragePercentage > 0 ? `Avg ${semesterAveragePercentage.toFixed(1)}%` : 'No scores yet'}`}
            </Text>
          </View>
        </View>

        <View style={styles.gradesCardRight}>
          <Text style={[styles.gradesGpaText, { color: theme.primary }]}>
            {subjects.length === 0
              ? '—'
              : gradingMode === 'college'
              ? (semesterGWA > 0 ? semesterGWA.toFixed(2) : '—')
              : (semesterAveragePercentage > 0 ? `${semesterAveragePercentage.toFixed(1)}%` : '—')}
          </Text>
          <Text style={[styles.gradesGpaScale, { color: theme.textSecondary }]}>
            {gradingMode === 'college' ? 'GWA (1.00)' : 'Average'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </View>
      </TouchableOpacity>


      {/* ── UPCOMING DEADLINES ─────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming Deadlines</Text>
        <TouchableOpacity onPress={() => router.push('/tasks' as Href)}>
          <Text style={[styles.sectionLink, { color: theme.primary }]}>
            View all ({tasks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tasks.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="document-text-outline" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No activities yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            No activities yet. Add your first academic activity.
          </Text>
          <TouchableOpacity
            style={[styles.emptyActionBtn, { backgroundColor: theme.primary }]}
            onPress={() => setShowTaskModal(true)}
          >
            <Text style={styles.emptyActionBtnText}>+ Add Activity</Text>
          </TouchableOpacity>
        </View>
      ) : urgentTasks.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="checkmark-circle-outline" size={40} color={theme.success} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>All Caught Up!</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            No urgent deadlines for the next 2 days. Great job staying ahead!
          </Text>
        </View>
      ) : (
        <View style={styles.taskListCol}>
          {urgentTasks.slice(0, 4).map((task) => {
            const subject = getSubject(task.subject_id);
            const pColor = priorityColor(task.priority);
            return (
              <View
                key={task.id}
                style={[
                  styles.taskItemCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderLeftColor: pColor,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    {
                      borderColor: task.status === 'completed' ? theme.primary : theme.border,
                      backgroundColor: task.status === 'completed' ? theme.primary : 'transparent',
                    },
                  ]}
                  onPress={() => toggleTask(task.id)}
                  accessibilityLabel={`Toggle task: ${task.title}`}
                >
                  {task.status === 'completed' && (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  )}
                </TouchableOpacity>

                <View style={styles.taskInfo}>
                  <Text
                    style={[
                      styles.taskTitleText,
                      { color: theme.text },
                      task.status === 'completed' && styles.completedText,
                    ]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                  <View style={styles.taskMetaRow}>
                    {subject && (
                      <View
                        style={[
                          styles.subjectBadge,
                          { backgroundColor: (subject.color || theme.primary) + '22' },
                        ]}
                      >
                        <Text style={[styles.subjectBadgeText, { color: subject.color || theme.primary }]}>
                          {subject.code}
                        </Text>
                      </View>
                    )}
                    <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
                    <Text style={[styles.dueText, { color: theme.textSecondary }]}>
                      {task.due_date} · {task.due_time || '23:59'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.priorityDot, { backgroundColor: pColor }]} />
              </View>
            );
          })}
          {urgentTasks.length > 4 && (
            <TouchableOpacity
              style={[styles.showMoreBtn, { borderColor: theme.border }]}
              onPress={() => router.push('/tasks' as Href)}
            >
              <Text style={[styles.showMoreText, { color: theme.primary }]}>
                + {urgentTasks.length - 4} more tasks
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── TODAY'S SCHEDULE ───────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{"Today's Schedule"}</Text>
        <TouchableOpacity onPress={() => router.push('/schedule' as Href)}>
          <Text style={[styles.sectionLink, { color: theme.primary }]}>Full Timetable</Text>
        </TouchableOpacity>
      </View>

      {schedules.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="calendar-outline" size={36} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No schedules yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Add a schedule manually, scan your class timetable, or upload a file to get started.
          </Text>
          <View style={styles.emptyActionsRow}>
            <TouchableOpacity
              style={[styles.emptyActionBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/scan-schedule' as Href)}
            >
              <Text style={styles.emptyActionBtnText}>+ Add Class Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : todaySchedules.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="calendar-outline" size={36} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No classes today</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Use this free day for focused self-study or review.
          </Text>
        </View>
      ) : (
        <View style={styles.scheduleCol}>
          {todaySchedules.map((item) => {
            const subject = getSubject(item.subject_id);
            return (
              <View
                key={item.id}
                style={[
                  styles.scheduleCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderLeftColor: subject?.color || theme.primary,
                  },
                ]}
              >
                <View style={styles.scheduleTimeBox}>
                  <Text style={[styles.scheduleTimeStart, { color: theme.text }]}>
                    {item.start_time}
                  </Text>
                  <Text style={[styles.scheduleTimeSep, { color: theme.textTertiary }]}>–</Text>
                  <Text style={[styles.scheduleTimeEnd, { color: theme.textSecondary }]}>
                    {item.end_time}
                  </Text>
                </View>
                <View style={styles.scheduleDetails}>
                  <Text style={[styles.scheduleTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.scheduleLocation, { color: theme.textSecondary }]}>
                    {subject ? `${subject.name} · ` : ''}
                    {item.location || 'Online / TBA'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.scheduleTypePill,
                    { backgroundColor: (subject?.color || theme.primary) + '22' },
                  ]}
                >
                  <Text style={[styles.scheduleTypeText, { color: subject?.color || theme.primary }]}>
                    {item.type}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── MY COURSES ─────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>My Courses</Text>
        <TouchableOpacity onPress={() => setShowSubjectModal(true)}>
          <Text style={[styles.sectionLink, { color: theme.primary }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {subjects.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="book-outline" size={36} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No courses yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            {'Tap "Add" to add your first course or subject.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subjectsScroll}
          contentContainerStyle={styles.subjectsScrollContent}
        >
          {subjects.map((sub) => {
            const subTasks = tasks.filter((t) => t.subject_id === sub.id && t.status === 'pending');
            const subDone = tasks.filter((t) => t.subject_id === sub.id && t.status === 'completed').length;
            const total = subTasks.length + subDone;
            const subPct = total > 0 ? Math.round((subDone / total) * 100) : 0;
            return (
              <View
                key={sub.id}
                style={[
                  styles.subjectCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={[styles.subjectColorBar, { backgroundColor: sub.color }]} />
                <Text style={[styles.subjectCodeText, { color: sub.color }]} numberOfLines={1}>
                  {sub.code}
                </Text>
                <Text style={[styles.subjectNameText, { color: theme.text }]} numberOfLines={2}>
                  {sub.name}
                </Text>
                {sub.professor ? (
                  <Text style={[styles.subjectProfText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {sub.professor}
                  </Text>
                ) : null}
                <View style={[styles.subjectProgressTrack, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.subjectProgressFill,
                      { backgroundColor: sub.color, width: `${subPct}%` },
                    ]}
                  />
                </View>
                <Text style={[styles.subjectPendingText, { color: theme.textTertiary }]}>
                  {subTasks.length} pending
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── MODAL: ADD TASK ────────────────────────────── */}
      <Modal visible={showTaskModal} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>New Task</Text>
                <TouchableOpacity onPress={() => setShowTaskModal(false)}>
                  <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Task Title *</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                ]}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="e.g. Complete Problem Set #4"
                placeholderTextColor={theme.textTertiary}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Description</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border, minHeight: 72 },
                ]}
                value={newTaskDesc}
                onChangeText={setNewTaskDesc}
                placeholder="Optional notes..."
                placeholderTextColor={theme.textTertiary}
                multiline
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Course</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollRow}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.chip,
                      {
                        borderColor: s.color,
                        backgroundColor: newTaskSubjectId === s.id ? s.color : theme.cardAlt,
                      },
                    ]}
                    onPress={() => setNewTaskSubjectId(s.id)}
                  >
                    <Text style={{ color: newTaskSubjectId === s.id ? '#FFF' : theme.text, fontWeight: '700', fontSize: 13 }}>
                      {s.code}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: newTaskSubjectId === '' ? theme.border : theme.cardAlt }]}
                  onPress={() => setNewTaskSubjectId('')}
                >
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>None</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.twoColRow}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Due Date</Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                    ]}
                    value={newTaskDueDate}
                    onChangeText={setNewTaskDueDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textTertiary}
                  />
                </View>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Due Time</Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                    ]}
                    value={newTaskDueTime}
                    onChangeText={setNewTaskDueTime}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.textTertiary}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Priority</Text>
              <View style={styles.prioritySelector}>
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityBtn,
                      {
                        backgroundColor: newTaskPriority === p
                          ? (p === 'high' ? theme.danger : p === 'medium' ? theme.warning : theme.success)
                          : theme.cardAlt,
                        borderColor: p === 'high' ? theme.danger : p === 'medium' ? theme.warning : theme.success,
                      },
                    ]}
                    onPress={() => setNewTaskPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityText,
                        { color: newTaskPriority === p ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                id="save-task-btn"
                style={[styles.saveBtn, { backgroundColor: newTaskTitle.trim() ? theme.primary : theme.border }]}
                onPress={handleSaveTask}
                disabled={!newTaskTitle.trim()}
              >
                <Text style={styles.saveBtnText}>Save Task</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: ADD SUBJECT ─────────────────────────── */}
      <Modal visible={showSubjectModal} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>New Course</Text>
                <TouchableOpacity onPress={() => setShowSubjectModal(false)}>
                  <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>

              <View style={styles.twoColRow}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Course Name *</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    value={newSubName}
                    onChangeText={setNewSubName}
                    placeholder="e.g. Calculus II"
                    placeholderTextColor={theme.textTertiary}
                  />
                </View>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Course Code *</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    value={newSubCode}
                    onChangeText={setNewSubCode}
                    placeholder="e.g. MATH 201"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Professor</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                value={newSubProf}
                onChangeText={setNewSubProf}
                placeholder="e.g. Dr. Smith"
                placeholderTextColor={theme.textTertiary}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Room / Location</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                value={newSubRoom}
                onChangeText={setNewSubRoom}
                placeholder="e.g. Hall B, Room 304"
                placeholderTextColor={theme.textTertiary}
              />

              {/* GRADING PERCENTAGE INPUTS */}
              <View style={[styles.percentageBox, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <View style={styles.percentageHeaderRow}>
                  <View>
                    <Text style={[styles.percentageTitle, { color: theme.text }]}>
                      Grading Breakdown Percentages *
                    </Text>
                    <Text style={[styles.percentageSubtitle, { color: theme.textSecondary }]}>
                      Quiz, exam, activity, & attendance weights
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.totalPill,
                      {
                        backgroundColor:
                          (parseFloat(newSubQuizWeight) || 0) +
                            (parseFloat(newSubExamWeight) || 0) +
                            (parseFloat(newSubActivityWeight) || 0) +
                            (parseFloat(newSubAttendanceWeight) || 0) ===
                          100
                            ? '#10B98120'
                            : '#EF444420',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.totalPillText,
                        {
                          color:
                            (parseFloat(newSubQuizWeight) || 0) +
                              (parseFloat(newSubExamWeight) || 0) +
                              (parseFloat(newSubActivityWeight) || 0) +
                              (parseFloat(newSubAttendanceWeight) || 0) ===
                            100
                              ? '#10B981'
                              : '#EF4444',
                        },
                      ]}
                    >
                      Total:{' '}
                      {(parseFloat(newSubQuizWeight) || 0) +
                        (parseFloat(newSubExamWeight) || 0) +
                        (parseFloat(newSubActivityWeight) || 0) +
                        (parseFloat(newSubAttendanceWeight) || 0)}
                      %
                    </Text>
                  </View>
                </View>

                <View style={styles.fourInputsGrid}>
                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Quiz %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      value={newSubQuizWeight}
                      onChangeText={setNewSubQuizWeight}
                      keyboardType="numeric"
                      placeholder="25"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Exam %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      value={newSubExamWeight}
                      onChangeText={setNewSubExamWeight}
                      keyboardType="numeric"
                      placeholder="40"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Activities %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      value={newSubActivityWeight}
                      onChangeText={setNewSubActivityWeight}
                      keyboardType="numeric"
                      placeholder="25"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Attendance %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      value={newSubAttendanceWeight}
                      onChangeText={setNewSubAttendanceWeight}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                </View>

                {/* Quick Presets */}
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={[styles.presetChip, { borderColor: theme.border }]}
                    onPress={() => {
                      setNewSubQuizWeight('25');
                      setNewSubExamWeight('40');
                      setNewSubActivityWeight('25');
                      setNewSubAttendanceWeight('10');
                    }}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>25/40/25/10</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetChip, { borderColor: theme.border }]}
                    onPress={() => {
                      setNewSubQuizWeight('20');
                      setNewSubExamWeight('50');
                      setNewSubActivityWeight('20');
                      setNewSubAttendanceWeight('10');
                    }}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>20/50/20/10</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetChip, { borderColor: theme.border }]}
                    onPress={() => {
                      setNewSubQuizWeight('20');
                      setNewSubExamWeight('30');
                      setNewSubActivityWeight('40');
                      setNewSubAttendanceWeight('10');
                    }}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>20/30/40/10</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Color</Text>
              <View style={styles.colorPalette}>
                {theme.subjectColors.map((col) => (
                  <TouchableOpacity
                    key={col}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: col },
                      newSubColor === col && styles.colorCircleSelected,
                    ]}
                    onPress={() => setNewSubColor(col)}
                  />
                ))}
              </View>

              <TouchableOpacity
                id="save-subject-btn"
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor:
                      newSubName.trim() && newSubCode.trim() ? theme.primary : theme.border,
                  },
                ]}
                onPress={handleSaveSubject}
                disabled={!newSubName.trim() || !newSubCode.trim()}
              >
                <Text style={styles.saveBtnText}>Add Course</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: FOCUS TIMER ─────────────────────────── */}
      <Modal visible={showTimerModal} animationType="slide" transparent statusBarTranslucent>
        <View style={[styles.modalOverlay, isDesktop && styles.timerOverlayDesktop]}>
          <ScrollView
            style={[styles.timerCard, { backgroundColor: theme.card, width: isDesktop ? '90%' : '100%' }]}
            contentContainerStyle={styles.timerCardContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Focus Timer</Text>
              <TouchableOpacity onPress={() => setShowTimerModal(false)}>
                <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Duration Presets */}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginBottom: 8 }]}>
              Fixed Presets
            </Text>
            <View style={styles.presetRow}>
              {TIMER_PRESETS.map((preset, idx) => (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.presetBtn,
                    {
                      backgroundColor: !isCustomTimer && timerPresetIdx === idx ? theme.primary : theme.cardAlt,
                      borderColor: !isCustomTimer && timerPresetIdx === idx ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => selectTimerPreset(idx)}
                  disabled={timerRunning}
                >
                  <Text style={{ color: !isCustomTimer && timerPresetIdx === idx ? '#FFF' : theme.text, fontWeight: '700', fontSize: 13 }}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Dynamic Custom Time Input Section */}
            <View style={[styles.customTimerSection, { backgroundColor: theme.cardAlt, borderColor: theme.border, marginTop: 10 }]}>
              <View style={styles.customTimerInputRow}>
                <Ionicons name="timer-outline" size={16} color={theme.primary} />
                <Text style={[styles.customTimerLabel, { color: theme.textSecondary }]}>Allotted Time:</Text>
                <TouchableOpacity
                  style={[styles.customStepBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                  disabled={timerRunning}
                  onPress={() => adjustCustomMinutes(-5)}
                >
                  <Ionicons name="remove" size={16} color={theme.text} />
                </TouchableOpacity>

                <View style={styles.customInputWrap}>
                  <TextInput
                    style={[styles.customMinutesInput, { color: theme.text, borderColor: theme.primary, backgroundColor: theme.card }]}
                    value={customMinutesInput}
                    onChangeText={handleCustomMinutesChange}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="30"
                    placeholderTextColor={theme.textTertiary}
                    editable={!timerRunning}
                    selectTextOnFocus
                  />
                  <Text style={[styles.customMinutesUnit, { color: theme.textSecondary }]}>mins</Text>
                </View>

                <TouchableOpacity
                  style={[styles.customStepBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                  disabled={timerRunning}
                  onPress={() => adjustCustomMinutes(5)}
                >
                  <Ionicons name="add" size={16} color={theme.text} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.customQuickStep, { borderColor: theme.border, backgroundColor: theme.card }]}
                  disabled={timerRunning}
                  onPress={() => adjustCustomMinutes(15)}
                >
                  <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>+15m</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Circular Timer Display */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <ProgressRing
                size={timerRingSize}
                strokeWidth={12}
                progress={timerProgress}
                trackColor={theme.border}
                gradientStart={theme.primary}
                gradientEnd={theme.secondary}
              >
                <Text style={[styles.timerCountdownText, { color: theme.text, fontSize: Math.min(40, timerRingSize * 0.22) }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatTimerTime(timerSeconds)}
                </Text>
                <Text style={[styles.timerStatusLabel, { color: theme.textSecondary }]}>
                  {timerRunning ? '🔥 Focusing...' : timerSeconds === timerMaxSeconds ? 'Ready' : 'Paused'}
                </Text>
              </ProgressRing>
            </Animated.View>

            {/* Subject selector */}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center' }]}>
              Studying
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollRow}>
              {subjects.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.chip,
                    {
                      borderColor: s.color,
                      backgroundColor: timerSubjectId === s.id ? s.color : theme.cardAlt,
                    },
                  ]}
                  onPress={() => setTimerSubjectId(s.id)}
                >
                  <Text style={{ color: timerSubjectId === s.id ? '#FFF' : theme.text, fontWeight: '600', fontSize: 13 }}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.chip, { borderColor: theme.border, backgroundColor: timerSubjectId === '' ? theme.border : theme.cardAlt }]}
                onPress={() => setTimerSubjectId('')}
              >
                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>General</Text>
              </TouchableOpacity>
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center' }]}>
              Timer alarm sound
            </Text>
            <View style={styles.alarmSoundRow}>
              {([
                ['default', 'Default'],
                ['soft', 'Soft'],
                ['chime', 'Chime'],
                ['silent', 'Silent'],
              ] as [FocusAlarmSound, string][]).map(([sound, label]) => {
                const selected = settings.focusAlarmSound === sound;
                return (
                  <TouchableOpacity
                    key={sound}
                    style={[
                      styles.alarmSoundOption,
                      {
                        backgroundColor: selected ? theme.primary : theme.cardAlt,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => {
                      void updateSettings('focusAlarmSound', sound).catch((error: unknown) => {
                        Alert.alert('Could not save alarm sound', error instanceof Error ? error.message : 'Please try again.');
                      });
                    }}
                    disabled={timerRunning || alarmScheduling}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={{ color: selected ? '#FFFFFF' : theme.text, fontSize: 12, fontWeight: '700' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Controls */}
            <View style={styles.timerControls}>
              <TouchableOpacity
                id="timer-reset-btn"
                style={[styles.timerResetBtn, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                onPress={resetTimer}
              >
                <Ionicons name="refresh" size={22} color={theme.text} />
              </TouchableOpacity>

              <TouchableOpacity
                id="timer-play-btn"
                style={[
                  styles.timerMainBtn,
                  { backgroundColor: timerRunning ? theme.warning : theme.primary },
                ]}
                onPress={() => void handleTimerToggle()}
                disabled={alarmScheduling}
              >
                <Ionicons name={timerRunning ? 'pause' : 'play'} size={24} color="#FFFFFF" />
                <Text style={styles.timerMainBtnText}>
                  {alarmScheduling ? 'Setting alarm…' : timerRunning ? 'Pause' : timerSeconds === timerMaxSeconds ? 'Start Focus' : 'Resume'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                id="timer-log-btn"
                style={[styles.timerResetBtn, { borderColor: theme.success, backgroundColor: theme.success + '18' }]}
                onPress={logCurrentProgress}
              >
                <Ionicons name="checkmark-done" size={22} color={theme.success} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── MODAL: NOTIFICATIONS ───────────────────────── */}
      <Modal visible={showNotifsModal} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Notifications
                {unreadNotificationsCount > 0
                  ? ` · ${unreadNotificationsCount} new`
                  : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowNotifsModal(false)}>
                <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            {notifications.length === 0 ? (
              <View style={styles.notifsEmpty}>
                <Ionicons name="notifications-off-outline" size={48} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.text, marginTop: 14 }]}>
                  All Clear!
                </Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  No notifications yet.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
                {notifications.map((n) => {
                  const icon = notifIcon(n.type);
                  const iconColor = n.type === 'deadline' ? theme.danger
                    : n.type === 'achievement' ? theme.warning
                    : theme.primary;
                  return (
                    <TouchableOpacity
                      key={n.id}
                      style={[
                        styles.notifItem,
                        {
                          backgroundColor: n.is_read === 0 ? theme.primaryLight : theme.cardAlt,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => markNotificationRead(n.id)}
                    >
                      <View style={[styles.notifIconBox, { backgroundColor: iconColor + '22' }]}>
                        <Ionicons name={icon} size={20} color={iconColor} />
                      </View>
                      <View style={styles.notifTextCol}>
                        <Text style={[styles.notifTitle, { color: theme.text }]}>{n.title}</Text>
                        <Text style={[styles.notifMessage, { color: theme.textSecondary }]}>
                          {n.message}
                        </Text>
                      </View>
                      {n.is_read === 0 && (
                        <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  id="clear-all-notifs-btn"
                  style={[styles.clearNotifsBtn, { borderColor: theme.danger + '44' }]}
                  onPress={() => {
                    clearAllNotifications();
                    setShowNotifsModal(false);
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  <Text style={[styles.clearNotifsText, { color: theme.danger }]}>
                    Clear All
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: AI ACADEMIC INTERVENTION ───────────── */}
      <Modal
        visible={!!selectedIntervention}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedIntervention(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedIntervention(null)}>
          <Pressable
            style={[styles.interventionModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={styles.interventionHeaderRow}>
                <View style={[styles.aiBadgeIcon, { backgroundColor: theme.primary + '20' }]}>
                  <Ionicons name="sparkles" size={18} color={theme.primary} />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    AI Academic Intervention
                  </Text>
                  <Text style={[styles.modalSubTitle, { color: theme.textSecondary }]}>
                    {selectedIntervention?.subjectName} ({selectedIntervention?.subjectCode})
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedIntervention(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.interventionModalBody} showsVerticalScrollIndicator={false}>
              {/* Alert Badge */}
              <View style={[styles.modalAlertBanner, { backgroundColor: '#EF444415', borderColor: '#EF444450' }]}>
                <Ionicons name="alert-circle" size={22} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalAlertTitle}>
                    Failing Grade: {selectedIntervention?.phScale.toFixed(2)} (Passing mark: 3.00)
                  </Text>
                  <Text style={[styles.modalAlertDesc, { color: theme.textSecondary }]}>
                    Your current score is {selectedIntervention?.currentPercentage}%. Grades from 3.10 to 5.00 are failing under Philippine academic standards.
                  </Text>
                </View>
              </View>

              {/* 1. Diagnosis */}
              <Text style={[styles.interventionSectionHeading, { color: theme.text }]}>
                1. AI Performance Diagnostic
              </Text>
              <View style={[styles.interventionTextCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <Text style={[styles.interventionParagraph, { color: theme.text }]}>
                  {selectedIntervention?.aiIntervention?.diagnosis}
                </Text>
              </View>

              {/* 2. Target Recovery Benchmark */}
              <Text style={[styles.interventionSectionHeading, { color: theme.text }]}>
                2. Target Recovery Benchmark
              </Text>
              <View style={[styles.targetScoreCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <View style={styles.targetScoreRow}>
                  <Text style={[styles.targetScoreValue, { color: theme.primary }]}>
                    {selectedIntervention?.aiIntervention?.targetScoreToPass}%
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.targetScoreDesc, { color: theme.text }]}>
                      Score needed on remaining {selectedIntervention?.remainingWeight}% of course deliverables
                    </Text>
                    <Text style={[styles.targetScoreSub, { color: theme.textSecondary }]}>
                      Achieving this benchmark will raise your standing to a 3.00 passing mark.
                    </Text>
                  </View>
                </View>
              </View>

              {/* 3. Action Plan */}
              <Text style={[styles.interventionSectionHeading, { color: theme.text }]}>
                3. Step-by-Step Remediation Roadmap
              </Text>
              <View style={styles.actionPlanList}>
                {selectedIntervention?.aiIntervention?.actionPlan.map((step, idx) => (
                  <View key={idx} style={[styles.actionPlanItem, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                    <View style={[styles.stepNumCircle, { backgroundColor: theme.primary }]}>
                      <Text style={styles.stepNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.stepContentText, { color: theme.text }]}>{step}</Text>
                  </View>
                ))}
              </View>

              {/* Launch AI Tutor Button */}
              <TouchableOpacity
                style={[styles.launchTutorBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setSelectedIntervention(null);
                  router.push('/(tabs)/chat' as Href);
                }}
              >
                <Ionicons name="chatbubbles" size={18} color="#FFFFFF" />
                <Text style={styles.launchTutorBtnText}>Start Remediation with AI Tutor</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>

    {/* Floating Quick Action FAB */}
    <FloatingQuickAction
      onAddTask={() => setShowTaskModal(true)}
      onAddCourse={() => setShowSubjectModal(true)}
      onAddAssessment={() => router.push('/grades' as Href)}
      onAddSchedule={() => router.push('/scan-schedule' as Href)}
      onScanScoreProof={() => router.push('/scan-score-proof' as Href)}
      onOpenTimer={() => setShowTimerModal(true)}
      onSwitchPeriod={() => setShowPeriodModal(true)}
    />

    {/* Academic Period Modal */}
    <AcademicPeriodModal visible={showPeriodModal} onClose={() => setShowPeriodModal(false)} />
  </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  desktopContainer: {
    maxWidth: 1080,
    alignSelf: 'center',
    width: '100%',
  },
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  periodBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  gradesCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 22,
  },
  gradesCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  gradesIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradesCardInfo: {
    flex: 1,
  },
  gradesCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  gradesCardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  gradesCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gradesGpaText: {
    fontSize: 22,
    fontWeight: '900',
  },
  gradesGpaScale: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  userInfoCol: { flex: 1 },
  dateText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  greetingText: { fontSize: 22, fontWeight: '800', marginTop: 3, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  // Hero card
  heroCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroLeft: { flex: 1, paddingRight: 16 },
  heroLabel: { color: '#C7D2FE', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroHours: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 6, letterSpacing: -1 },
  heroHoursUnit: { fontSize: 16, fontWeight: '600', color: '#E0E7FF' },
  heroSub: { color: '#E0E7FF', fontSize: 13, marginTop: 6, lineHeight: 18 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  ringPercent: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },

  // Quick actions
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sectionLink: { fontSize: 13, fontWeight: '700' },

  // Empty state
  emptyCard: {
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 5, lineHeight: 19 },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  emptyActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 12,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Task list
  taskListCol: { gap: 10, marginBottom: 20 },
  taskItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskInfo: { flex: 1 },
  taskTitleText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  completedText: { textDecorationLine: 'line-through', opacity: 0.45 },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  subjectBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  subjectBadgeText: { fontSize: 11, fontWeight: '800' },
  dueText: { fontSize: 12 },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  showMoreText: { fontSize: 13, fontWeight: '700' },

  // Schedule
  scheduleCol: { gap: 10, marginBottom: 20 },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 5,
    gap: 14,
  },
  scheduleTimeBox: { alignItems: 'center', minWidth: 52 },
  scheduleTimeStart: { fontSize: 14, fontWeight: '800' },
  scheduleTimeSep: { fontSize: 11, marginVertical: 1 },
  scheduleTimeEnd: { fontSize: 12 },
  scheduleDetails: { flex: 1 },
  scheduleTitle: { fontSize: 15, fontWeight: '700' },
  scheduleLocation: { fontSize: 12, marginTop: 3 },
  scheduleTypePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  scheduleTypeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },

  // Subjects
  subjectsScroll: { marginBottom: 20 },
  subjectsScrollContent: { paddingRight: 20, gap: 12 },
  subjectCard: {
    width: 148,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  subjectColorBar: { width: 32, height: 5, borderRadius: 3, marginBottom: 10 },
  subjectCodeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  subjectNameText: { fontSize: 14, fontWeight: '700', marginTop: 4, minHeight: 38, lineHeight: 19 },
  subjectProfText: { fontSize: 11, marginTop: 3 },
  subjectProgressTrack: { height: 4, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  subjectProgressFill: { height: '100%', borderRadius: 2 },
  subjectPendingText: { fontSize: 11, marginTop: 6 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  timerOverlayDesktop: {
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    gap: 10,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
  },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  chipScrollRow: { marginVertical: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    marginRight: 8,
  },
  twoColRow: { flexDirection: 'row', gap: 10 },
  colHalf: { flex: 1 },
  prioritySelector: { flexDirection: 'row', gap: 8, marginVertical: 6 },
  priorityBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  priorityText: { fontSize: 13, fontWeight: '800' },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  colorCircle: { width: 34, height: 34, borderRadius: 17 },
  colorCircleSelected: { borderWidth: 3, borderColor: '#000000' },

  // Focus Timer Modal
  timerCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    alignSelf: 'center',
    borderRadius: 30,
    padding: 0,
    overflow: 'hidden',
  },
  timerCardContent: {
    padding: 20,
    alignItems: 'center',
    gap: 16,
    paddingBottom: 28,
  },
  presetRow: { flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'center' },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  customTimerSection: {
    width: '100%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  customTimerInputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 8,
  },
  customTimerLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  customStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customMinutesInput: {
    width: 50,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 15,
  },
  customMinutesUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  customQuickStep: {
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmSoundRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  alarmSoundOption: {
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  timerCountdownText: { fontSize: 40, fontWeight: '900', letterSpacing: -2 },
  timerStatusLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  timerControls: { flexDirection: 'row', gap: 12, width: '100%', alignItems: 'center' },
  timerMainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  timerMainBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  timerResetBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Notifications
  notifsEmpty: { alignItems: 'center', paddingVertical: 40 },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  notifIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTextCol: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '700' },
  notifMessage: { fontSize: 13, marginTop: 3, lineHeight: 19 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  clearNotifsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  clearNotifsText: { fontSize: 14, fontWeight: '700' },

  // Academic Alert Hero
  academicAlertHero: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 20,
    gap: 14,
  },
  alertHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertHeroTitle: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
  },
  alertHeroSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  failingCoursesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  failingCourseChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  failingCourseChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  alertHeroActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  alertHeroActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Percentage Breakdown Box
  percentageBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    marginBottom: 16,
    gap: 12,
  },
  percentageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentageTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  percentageSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  totalPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  totalPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  fourInputsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  quarterField: {
    flex: 1,
  },
  weightInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  weightInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // AI Intervention Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  interventionModalCard: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  interventionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  aiBadgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  interventionModalBody: {
    marginTop: 14,
  },
  modalAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  modalAlertTitle: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '800',
  },
  modalAlertDesc: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  interventionSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
  },
  interventionTextCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  interventionParagraph: {
    fontSize: 13,
    lineHeight: 20,
  },
  targetScoreCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  targetScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  targetScoreValue: {
    fontSize: 34,
    fontWeight: '900',
  },
  targetScoreDesc: {
    fontSize: 13,
    fontWeight: '700',
  },
  targetScoreSub: {
    fontSize: 11,
    marginTop: 3,
  },
  actionPlanList: {
    gap: 8,
  },
  actionPlanItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepNumCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepContentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  launchTutorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  launchTutorBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
