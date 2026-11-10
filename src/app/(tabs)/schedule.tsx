import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AcademicPeriodModal } from '@/components/AcademicPeriodModal';
import { useStudy } from '@/context/StudyContext';
import { useTheme } from '@/theme';
import type { ScheduleItem, Subject } from '@/db/studytrack';
import { confirmAction, showSuccess } from '@/utils/confirm';

const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    schedules,
    subjects,
    tasks,
    toggleTask,
    createSchedule,
    editSchedule,
    removeSchedule,
    createSubject,
    removeSubject,
    activePeriod,
  } = useStudy();

  const [showPeriodModal, setShowPeriodModal] = useState(false);

  // View mode switcher: Daily, Weekly, Monthly, or Courses
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'courses'>('daily');

  // Selected date for Daily view (defaults to today in YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Selected day of week for Weekly view (1 = Monday)
  const [selectedWeekDay, setSelectedWeekDay] = useState(1);

  // Month navigation for Monthly view
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedSubjectId, setSchedSubjectId] = useState(subjects[0]?.id || '');
  const [schedDay, setSchedDay] = useState(1);
  const [schedStart, setSchedStart] = useState('09:00');
  const [schedEnd, setSchedEnd] = useState('10:30');
  const [schedLoc, setSchedLoc] = useState('');
  const [schedType, setSchedType] = useState<ScheduleItem['type']>('lecture');

  // Subject / Course Modal with percentage breakdown
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subColor, setSubColor] = useState(theme.subjectColors[0]);
  const [subProf, setSubProf] = useState('');
  const [subRoom, setSubRoom] = useState('');
  const [subNotes, setSubNotes] = useState('');
  const [subCredits, setSubCredits] = useState('3.0');
  const [subTargetGrade] = useState('90.0');

  // Percentage breakdown weights
  const [subQuizWeight, setSubQuizWeight] = useState('25');
  const [subExamWeight, setSubExamWeight] = useState('40');
  const [subActivityWeight, setSubActivityWeight] = useState('25');
  const [subAttendanceWeight, setSubAttendanceWeight] = useState('10');

  // Universal confirm helper that works cleanly on Web and Native
  const universalConfirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  };

  // Sum of percentage breakdown
  const totalPercentage = useMemo(() => {
    const q = parseFloat(subQuizWeight) || 0;
    const e = parseFloat(subExamWeight) || 0;
    const act = parseFloat(subActivityWeight) || 0;
    const att = parseFloat(subAttendanceWeight) || 0;
    return Math.round((q + e + act + att) * 10) / 10;
  }, [subQuizWeight, subExamWeight, subActivityWeight, subAttendanceWeight]);

  const applyWeightPreset = (q: number, e: number, act: number, att: number) => {
    setSubQuizWeight(q.toString());
    setSubExamWeight(e.toString());
    setSubActivityWeight(act.toString());
    setSubAttendanceWeight(att.toString());
  };

  // Schedule modal open
  const openAddSchedule = () => {
    setEditingSchedule(null);
    setSchedTitle('');
    setSchedSubjectId(subjects[0]?.id || '');
    setSchedDay(selectedWeekDay);
    setSchedStart('09:00');
    setSchedEnd('10:30');
    setSchedLoc('');
    setSchedType('lecture');
    setShowScheduleModal(true);
  };

  const openEditSchedule = (item: ScheduleItem) => {
    setEditingSchedule(item);
    setSchedTitle(item.title);
    setSchedSubjectId(item.subject_id || '');
    setSchedDay(item.day_of_week);
    setSchedStart(item.start_time);
    setSchedEnd(item.end_time);
    setSchedLoc(item.location || '');
    setSchedType(item.type);
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async () => {
    if (!schedTitle.trim()) return;
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const startMatch = timePattern.exec(schedStart);
    const endMatch = timePattern.exec(schedEnd);
    if (!startMatch || !endMatch) {
      Alert.alert('Invalid Time', 'Enter class times in 24-hour HH:mm format, such as 09:00.');
      return;
    }
    const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
    const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
    if (endMinutes <= startMinutes) {
      Alert.alert('Invalid Time', 'Class end time must be later than the start time.');
      return;
    }

    if (editingSchedule) {
      await editSchedule(editingSchedule.id, {
        title: schedTitle.trim(),
        subject_id: schedSubjectId || undefined,
        day_of_week: schedDay,
        start_time: schedStart,
        end_time: schedEnd,
        location: schedLoc.trim(),
        type: schedType,
      });
    } else {
      await createSchedule({
        title: schedTitle.trim(),
        subject_id: schedSubjectId || undefined,
        day_of_week: schedDay,
        start_time: schedStart,
        end_time: schedEnd,
        location: schedLoc.trim(),
        type: schedType,
      });
    }
    setShowScheduleModal(false);
  };

  const confirmDeleteSchedule = (item: ScheduleItem) => {
    confirmAction(
      'Delete Session',
      `Remove "${item.title}" from timetable? This cannot be undone.`,
      'Delete',
      async () => {
        await removeSchedule(item.id);
        showSuccess('Session Deleted', `"${item.title}" has been removed from your timetable.`);
      }
    );
  };

  const handleSaveCourse = async () => {
    if (!subName.trim() || !subCode.trim()) return;

    const quizW = parseFloat(subQuizWeight) || 25;
    const examW = parseFloat(subExamWeight) || 40;
    const actW = parseFloat(subActivityWeight) || 25;
    const attW = parseFloat(subAttendanceWeight) || 10;
    const credits = parseFloat(subCredits) || 3.0;
    const target = parseFloat(subTargetGrade) || 90.0;

    await createSubject({
      name: subName.trim(),
      code: subCode.trim().toUpperCase(),
      color: subColor,
      professor: subProf.trim(),
      room: subRoom.trim(),
      notes: subNotes.trim(),
      credits,
      target_grade: target,
      passing_grade: 75.0,
      quiz_weight: quizW,
      exam_weight: examW,
      activity_weight: actW,
      attendance_weight: attW,
    });

    setSubName('');
    setSubCode('');
    setSubProf('');
    setSubRoom('');
    setSubNotes('');
    setSubQuizWeight('25');
    setSubExamWeight('40');
    setSubActivityWeight('25');
    setSubAttendanceWeight('10');
    setShowSubjectModal(false);
  };

  const confirmDeleteCourse = (sub: Subject) => {
    confirmAction(
      'Delete Course',
      `Delete "${sub.name}" (${sub.code}) and all its associated tasks and timetable sessions?`,
      'Delete',
      async () => {
        await removeSubject(sub.id);
        showSuccess('Course Deleted', `"${sub.name}" and all its data have been successfully deleted.`);
      }
    );
  };

  const getSubject = (id?: string) => subjects.find((s) => s.id === id);

  // -----------------------------------------------------------------
  // CALENDAR / MONTHLY COMPUTATIONS
  // -----------------------------------------------------------------
  const currentYear = currentMonthDate.getFullYear();
  const currentMonth = currentMonthDate.getMonth();
  const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    setCurrentMonthDate(new Date(currentYear, currentMonth - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonthDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: { dateString: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      const d = new Date(currentYear, currentMonth - 1, dayNum);
      days.push({
        dateString: d.toISOString().split('T')[0],
        dayNum,
        isCurrentMonth: false,
      });
    }

    for (let day = 1; day <= totalDays; day++) {
      const monthStr = (currentMonth + 1).toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      days.push({
        dateString: `${currentYear}-${monthStr}-${dayStr}`,
        dayNum: day,
        isCurrentMonth: true,
      });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    for (let j = 1; j <= remaining; j++) {
      const d = new Date(currentYear, currentMonth + 1, j);
      days.push({
        dateString: d.toISOString().split('T')[0],
        dayNum: j,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  // Tasks mapped by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const existing = map.get(t.due_date) || [];
      existing.push(t);
      map.set(t.due_date, existing);
    }
    return map;
  }, [tasks]);

  // Daily View computations
  const selectedDateTasks = useMemo(() => {
    return tasksByDate.get(selectedDate) || [];
  }, [tasksByDate, selectedDate]);

  const selectedDateDayOfWeek = useMemo(() => {
    const parts = selectedDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.getDay();
  }, [selectedDate]);

  const selectedDateSchedules = useMemo(() => {
    return schedules
      .filter((sc) => sc.day_of_week === selectedDateDayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, selectedDateDayOfWeek]);

  // Daily stepper navigation
  const stepDate = (daysToAdd: number) => {
    const parts = selectedDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + daysToAdd);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const jumpToToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    setCurrentMonthDate(new Date());
  };

  const formattedSelectedDate = useMemo(() => {
    const parts = selectedDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  // Weekly view filtered schedules
  const weekDaySchedules = useMemo(() => {
    return schedules
      .filter((s) => s.day_of_week === selectedWeekDay)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, selectedWeekDay]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Academic Schedule</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Daily, Weekly & Monthly Calendar Planner
          </Text>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: theme.primary + '18',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              marginTop: 6,
              alignSelf: 'flex-start',
            }}
            onPress={() => setShowPeriodModal(true)}
          >
            <Ionicons name="calendar-outline" size={13} color={theme.primary} />
            <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
              {activePeriod ? `${activePeriod.academic_year} • ${activePeriod.semester}` : 'Select Period'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={theme.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => {
            if (viewMode === 'courses') {
              setShowSubjectModal(true);
            } else {
              Alert.alert('Add to Schedule', 'What would you like to add?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Class Schedule', onPress: openAddSchedule },
                { text: 'New Course', onPress: () => setShowSubjectModal(true) },
              ]);
            }
          }}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* 4-Way Segmented View Switcher: Daily | Weekly | Monthly | Courses */}
      <View style={[styles.tabBar, { backgroundColor: theme.cardAlt }]}>
        <TouchableOpacity
          style={[
            styles.tabBarItem,
            viewMode === 'daily' && { backgroundColor: theme.card, shadowOpacity: 0.08 },
          ]}
          onPress={() => setViewMode('daily')}
        >
          <Ionicons
            name="today"
            size={16}
            color={viewMode === 'daily' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabBarText,
              { color: viewMode === 'daily' ? theme.primary : theme.textSecondary },
            ]}
          >
            Daily
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBarItem,
            viewMode === 'weekly' && { backgroundColor: theme.card, shadowOpacity: 0.08 },
          ]}
          onPress={() => setViewMode('weekly')}
        >
          <Ionicons
            name="time"
            size={16}
            color={viewMode === 'weekly' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabBarText,
              { color: viewMode === 'weekly' ? theme.primary : theme.textSecondary },
            ]}
          >
            Weekly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBarItem,
            viewMode === 'monthly' && { backgroundColor: theme.card, shadowOpacity: 0.08 },
          ]}
          onPress={() => setViewMode('monthly')}
        >
          <Ionicons
            name="calendar"
            size={16}
            color={viewMode === 'monthly' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabBarText,
              { color: viewMode === 'monthly' ? theme.primary : theme.textSecondary },
            ]}
          >
            Monthly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBarItem,
            viewMode === 'courses' && { backgroundColor: theme.card, shadowOpacity: 0.08 },
          ]}
          onPress={() => setViewMode('courses')}
        >
          <Ionicons
            name="book"
            size={16}
            color={viewMode === 'courses' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabBarText,
              { color: viewMode === 'courses' ? theme.primary : theme.textSecondary },
            ]}
          >
            Courses ({subjects.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ---------------------------------------------------------- */}
      {/* 1. DAILY VIEW                                              */}
      {/* ---------------------------------------------------------- */}
      {viewMode === 'daily' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Daily Date Navigation Card */}
          <View style={[styles.dateNavCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.cardAlt }]}
              onPress={() => stepDate(-1)}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.dateCenterBtn} onPress={jumpToToday}>
              <Text style={[styles.dateNavTitle, { color: theme.text }]}>
                {formattedSelectedDate}
              </Text>
              <Text style={[styles.todayHint, { color: theme.primary }]}>
                {selectedDate === new Date().toISOString().split('T')[0] ? '• Today' : 'Tap for Today'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.cardAlt }]}
              onPress={() => stepDate(1)}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Classes Scheduled for Today */}
          <View style={styles.sectionTitleRow}>
            <Ionicons name="school-outline" size={18} color={theme.primary} />
            <Text style={[styles.sectionHeading, { color: theme.text }]}>
              Class Timetable ({selectedDateSchedules.length})
            </Text>
          </View>

          {schedules.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyBoxTitle, { color: theme.text }]}>No schedules yet</Text>
              <Text style={[styles.emptyBoxSubtitle, { color: theme.textSecondary }]}>
                No schedules yet. Add a schedule or scan your class timetable to get started.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                  onPress={openAddSchedule}
                >
                  <Text style={styles.emptyAddBtnText}>+ Add Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: theme.secondary ?? '#8B5CF6' }]}
                  onPress={() => router.push({ pathname: '/scan-schedule', params: { source: 'camera' } } as any)}
                >
                  <Text style={styles.emptyAddBtnText}>📷 Scan Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : selectedDateSchedules.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="sunny-outline" size={40} color={theme.warning} />
              <Text style={[styles.emptyBoxTitle, { color: theme.text }]}>No classes on this date</Text>
              <Text style={[styles.emptyBoxSubtitle, { color: theme.textSecondary }]}>
                Enjoy your free study block or schedule an academic session!
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                  onPress={openAddSchedule}
                >
                  <Text style={styles.emptyAddBtnText}>+ Add Session</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: theme.secondary ?? '#8B5CF6' }]}
                  onPress={() => router.push({ pathname: '/scan-schedule', params: { source: 'camera' } } as any)}
                >
                  <Text style={styles.emptyAddBtnText}>📷 Scan Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.scheduleList}>
              {selectedDateSchedules.map((item) => {
                const subject = getSubject(item.subject_id);
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.schedCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        borderLeftColor: subject?.color || theme.primary,
                      },
                    ]}
                  >
                    <View style={styles.schedTimeCol}>
                      <Text style={[styles.schedStartTime, { color: theme.text }]}>
                        {item.start_time}
                      </Text>
                      <View style={[styles.schedTimeDivider, { backgroundColor: theme.border }]} />
                      <Text style={[styles.schedEndTime, { color: theme.textSecondary }]}>
                        {item.end_time}
                      </Text>
                    </View>

                    <View style={styles.schedInfoCol}>
                      <View style={styles.schedBadgeRow}>
                        {subject && (
                          <View
                            style={[
                              styles.courseBadge,
                              { backgroundColor: (subject.color || theme.primary) + '20' },
                            ]}
                          >
                            <Text style={[styles.courseBadgeText, { color: subject.color || theme.primary }]}>
                              {subject.code}
                            </Text>
                          </View>
                        )}
                        <View style={[styles.typePill, { backgroundColor: theme.cardAlt }]}>
                          <Text style={[styles.typePillText, { color: theme.primary }]}>
                            {item.type.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.schedTitleText, { color: theme.text }]}>
                        {item.title}
                      </Text>

                      {subject && (
                        <Text style={[styles.schedProfText, { color: theme.textSecondary }]}>
                          {subject.name} {subject.professor ? `• ${subject.professor}` : ''}
                        </Text>
                      )}

                      {item.location ? (
                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
                          <Text style={[styles.locationText, { color: theme.textSecondary }]}>
                            {item.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.schedActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEditSchedule(item)}
                      >
                        <Ionicons name="pencil-outline" size={17} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => confirmDeleteSchedule(item)}
                      >
                        <Ionicons name="trash-outline" size={17} color={theme.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Tasks Due on this Day */}
          <View style={[styles.sectionTitleRow, { marginTop: 22 }]}>
            <Ionicons name="checkbox-outline" size={18} color={theme.secondary} />
            <Text style={[styles.sectionHeading, { color: theme.text }]}>
              Deadlines & Tasks for this Day ({selectedDateTasks.length})
            </Text>
          </View>

          {selectedDateTasks.length === 0 ? (
            <View style={[styles.emptyBoxCompact, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyBoxSubtitle, { color: theme.textSecondary }]}>
                No assignments or tasks due on this date.
              </Text>
            </View>
          ) : (
            <View style={styles.tasksList}>
              {selectedDateTasks.map((t) => {
                const sub = getSubject(t.subject_id);
                const isDone = t.status === 'completed';
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => toggleTask(t.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isDone ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isDone ? theme.success : theme.textSecondary}
                    />
                    <View style={styles.taskInfo}>
                      <Text
                        style={[
                          styles.taskTitle,
                          {
                            color: isDone ? theme.textTertiary : theme.text,
                            textDecorationLine: isDone ? 'line-through' : 'none',
                          },
                        ]}
                      >
                        {t.title}
                      </Text>
                      <View style={styles.taskMetaRow}>
                        {sub && (
                          <Text style={[styles.taskSubTag, { color: sub.color }]}>
                            {sub.code}
                          </Text>
                        )}
                        {t.due_time && (
                          <Text style={[styles.taskTimeTag, { color: theme.textSecondary }]}>
                            Due at {t.due_time}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ---------------------------------------------------------- */}
      {/* 2. WEEKLY VIEW                                             */}
      {/* ---------------------------------------------------------- */}
      {viewMode === 'weekly' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Day of Week Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.daySelectorScroll}
            contentContainerStyle={styles.daySelectorContent}
          >
            {WEEKDAYS.map((w) => {
              const isSelected = selectedWeekDay === w.day;
              const count = schedules.filter((s) => s.day_of_week === w.day).length;

              return (
                <TouchableOpacity
                  key={w.day}
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.card,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedWeekDay(w.day)}
                >
                  <Text
                    style={[
                      styles.dayChipLabel,
                      { color: isSelected ? '#FFFFFF' : theme.textSecondary },
                    ]}
                  >
                    {w.label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        styles.dayChipCount,
                        { backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : theme.cardAlt },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayChipCountText,
                          { color: isSelected ? '#FFFFFF' : theme.text },
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Timetable Items for selected weekday */}
          {weekDaySchedules.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="sunny-outline" size={48} color={theme.warning} />
              <Text style={[styles.emptyBoxTitle, { color: theme.text }]}>No Classes on this day</Text>
              <Text style={[styles.emptyBoxSubtitle, { color: theme.textSecondary }]}>
                No scheduled lectures or labs. Tap + to add a session or scan your class schedule!
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                  onPress={openAddSchedule}
                >
                  <Text style={styles.emptyAddBtnText}>+ Add Class Session</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: theme.secondary ?? '#8B5CF6' }]}
                  onPress={() => router.push({ pathname: '/scan-schedule', params: { source: 'camera' } } as any)}
                >
                  <Text style={styles.emptyAddBtnText}>📷 Scan Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.scheduleList}>
              {weekDaySchedules.map((item) => {
                const subject = getSubject(item.subject_id);

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.schedCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        borderLeftColor: subject?.color || theme.primary,
                      },
                    ]}
                  >
                    <View style={styles.schedTimeCol}>
                      <Text style={[styles.schedStartTime, { color: theme.text }]}>
                        {item.start_time}
                      </Text>
                      <View style={[styles.schedTimeDivider, { backgroundColor: theme.border }]} />
                      <Text style={[styles.schedEndTime, { color: theme.textSecondary }]}>
                        {item.end_time}
                      </Text>
                    </View>

                    <View style={styles.schedInfoCol}>
                      <View style={styles.schedBadgeRow}>
                        {subject && (
                          <View
                            style={[
                              styles.courseBadge,
                              { backgroundColor: (subject.color || theme.primary) + '20' },
                            ]}
                          >
                            <Text style={[styles.courseBadgeText, { color: subject.color || theme.primary }]}>
                              {subject.code}
                            </Text>
                          </View>
                        )}
                        <View style={[styles.typePill, { backgroundColor: theme.cardAlt }]}>
                          <Text style={[styles.typePillText, { color: theme.primary }]}>
                            {item.type.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.schedTitleText, { color: theme.text }]}>
                        {item.title}
                      </Text>

                      {subject && (
                        <Text style={[styles.schedProfText, { color: theme.textSecondary }]}>
                          {subject.name} {subject.professor ? `• ${subject.professor}` : ''}
                        </Text>
                      )}

                      {item.location ? (
                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
                          <Text style={[styles.locationText, { color: theme.textSecondary }]}>
                            {item.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.schedActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEditSchedule(item)}
                      >
                        <Ionicons name="pencil-outline" size={17} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => confirmDeleteSchedule(item)}
                      >
                        <Ionicons name="trash-outline" size={17} color={theme.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ---------------------------------------------------------- */}
      {/* 3. MONTHLY VIEW (INTEGRATED FULL CALENDAR)                  */}
      {/* ---------------------------------------------------------- */}
      {viewMode === 'monthly' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Month Navigator Card */}
          <View style={[styles.calendarCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.monthHeader}>
              <TouchableOpacity
                style={[styles.monthNavBtn, { backgroundColor: theme.cardAlt }]}
                onPress={prevMonth}
              >
                <Ionicons name="chevron-back" size={20} color={theme.text} />
              </TouchableOpacity>

              <TouchableOpacity onPress={jumpToToday}>
                <Text style={[styles.monthTitleText, { color: theme.text }]}>{monthName}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.monthNavBtn, { backgroundColor: theme.cardAlt }]}
                onPress={nextMonth}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View style={styles.daysRow}>
              {DAYS_OF_WEEK.map((d) => (
                <Text key={d} style={[styles.dayHeaderCell, { color: theme.textTertiary }]}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar Days 7xN Grid */}
            <View style={styles.gridContainer}>
              {calendarDays.map((d, index) => {
                const isSelected = d.dateString === selectedDate;
                const isToday = d.dateString === new Date().toISOString().split('T')[0];
                const dayTasks = tasksByDate.get(d.dateString) || [];
                const dayOfWeek = new Date(
                  parseInt(d.dateString.split('-')[0], 10),
                  parseInt(d.dateString.split('-')[1], 10) - 1,
                  parseInt(d.dateString.split('-')[2], 10)
                ).getDay();
                const dayClassCount = schedules.filter((s) => s.day_of_week === dayOfWeek).length;

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.cellTouch,
                      isSelected && { backgroundColor: theme.primary, borderRadius: 12 },
                    ]}
                    onPress={() => setSelectedDate(d.dateString)}
                  >
                    <Text
                      style={[
                        styles.cellDayNum,
                        {
                          color: isSelected
                            ? '#FFFFFF'
                            : d.isCurrentMonth
                            ? isToday
                              ? theme.primary
                              : theme.text
                            : theme.textTertiary,
                          fontWeight: isToday || isSelected ? '800' : '500',
                        },
                      ]}
                    >
                      {d.dayNum}
                    </Text>

                    {/* Dots indicator for tasks & classes */}
                    <View style={styles.cellDotsRow}>
                      {dayClassCount > 0 && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isSelected ? '#FFFFFF' : theme.primary },
                          ]}
                        />
                      )}
                      {dayTasks.length > 0 && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isSelected ? '#FFFFFF' : theme.danger },
                          ]}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Agenda for the Day selected in the Monthly calendar */}
          <View style={[styles.agendaHeaderRow, { marginTop: 16 }]}>
            <Text style={[styles.agendaHeading, { color: theme.text }]}>
              Agenda for {formattedSelectedDate}
            </Text>
          </View>

          {selectedDateSchedules.length === 0 && selectedDateTasks.length === 0 ? (
            <View style={[styles.emptyBoxCompact, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyBoxSubtitle, { color: theme.textSecondary }]}>
                No classes or task deadlines scheduled on this date.
              </Text>
            </View>
          ) : (
            <View style={styles.scheduleList}>
              {selectedDateSchedules.map((sc) => {
                const sub = getSubject(sc.subject_id);
                return (
                  <View
                    key={sc.id}
                    style={[
                      styles.schedCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        borderLeftColor: sub?.color || theme.primary,
                      },
                    ]}
                  >
                    <View style={styles.schedTimeCol}>
                      <Text style={[styles.schedStartTime, { color: theme.text }]}>{sc.start_time}</Text>
                      <Text style={[styles.schedEndTime, { color: theme.textSecondary }]}>{sc.end_time}</Text>
                    </View>
                    <View style={styles.schedInfoCol}>
                      <Text style={[styles.schedTitleText, { color: theme.text }]}>{sc.title}</Text>
                      {sub && (
                        <Text style={[styles.schedProfText, { color: theme.textSecondary }]}>
                          {sub.code} • {sub.name}
                        </Text>
                      )}
                      {sc.location ? (
                        <Text style={[styles.locationText, { color: theme.textSecondary }]}>
                          {sc.location}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              {selectedDateTasks.map((t) => (
                <View
                  key={t.id}
                  style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                >
                  <Ionicons
                    name={t.status === 'completed' ? 'checkbox' : 'alert-circle'}
                    size={20}
                    color={t.status === 'completed' ? theme.success : theme.warning}
                  />
                  <View style={styles.taskInfo}>
                    <Text style={[styles.taskTitle, { color: theme.text }]}>{t.title}</Text>
                    <Text style={[styles.taskTimeTag, { color: theme.textSecondary }]}>
                      Due: {t.due_time || 'End of day'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ---------------------------------------------------------- */}
      {/* 4. COURSES VIEW WITH GRADING PERCENTAGES                    */}
      {/* ---------------------------------------------------------- */}
      {viewMode === 'courses' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.coursesGrid}>
            {subjects.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 16 }]}>
                <Ionicons name="book-outline" size={40} color={theme.textTertiary} />
                <Text style={[styles.emptyBoxTitle, { color: theme.text }]}>No subjects yet</Text>
                <Text style={[styles.emptyBoxSubtitle, { color: theme.textSecondary }]}>
                  No subjects or assessments exist for this semester. Enrol your subjects or scan your schedule to begin.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                    onPress={() => setShowSubjectModal(true)}
                  >
                    <Text style={styles.emptyAddBtnText}>+ Enrol Course</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emptyAddBtn, { backgroundColor: theme.secondary ?? '#8B5CF6' }]}
                    onPress={() => router.push({ pathname: '/scan-schedule', params: { source: 'camera' } } as any)}
                  >
                    <Text style={styles.emptyAddBtnText}>📷 Scan Schedule</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {subjects.map((sub) => {
              const qW = sub.quiz_weight ?? 25;
              const eW = sub.exam_weight ?? 40;
              const actW = sub.activity_weight ?? 25;
              const attW = sub.attendance_weight ?? 10;

              return (
                <View
                  key={sub.id}
                  style={[
                    styles.courseCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      borderTopColor: sub.color,
                    },
                  ]}
                >
                  <View style={styles.courseCardHeader}>
                    <View style={[styles.courseColorIndicator, { backgroundColor: sub.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.courseCodeLarge, { color: sub.color }]}>{sub.code}</Text>
                      <Text style={[styles.courseUnitsSub, { color: theme.textSecondary }]}>
                        {sub.credits ?? 3.0} Units • Target: {sub.target_grade ?? 90}%
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.courseDeleteBtn}
                      onPress={() => confirmDeleteCourse(sub)}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.courseNameLarge, { color: theme.text }]}>{sub.name}</Text>

                  {sub.professor ? (
                    <View style={styles.courseDetailRow}>
                      <Ionicons name="person-outline" size={14} color={theme.textSecondary} />
                      <Text style={[styles.courseDetailText, { color: theme.textSecondary }]}>
                        {sub.professor}
                      </Text>
                    </View>
                  ) : null}

                  {sub.room ? (
                    <View style={styles.courseDetailRow}>
                      <Ionicons name="business-outline" size={14} color={theme.textSecondary} />
                      <Text style={[styles.courseDetailText, { color: theme.textSecondary }]}>
                        {sub.room}
                      </Text>
                    </View>
                  ) : null}

                  {/* Grading Breakdown Percentages Chip Grid */}
                  <View style={[styles.gradeWeightsBox, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                    <Text style={[styles.gradeWeightsHeading, { color: theme.textSecondary }]}>
                      GRADE BREAKDOWN CRITERIA
                    </Text>
                    <View style={styles.gradeWeightsRow}>
                      <View style={styles.weightBadge}>
                        <Text style={[styles.weightBadgeValue, { color: theme.primary }]}>{qW}%</Text>
                        <Text style={[styles.weightBadgeLabel, { color: theme.textSecondary }]}>Quizzes</Text>
                      </View>
                      <View style={styles.weightBadge}>
                        <Text style={[styles.weightBadgeValue, { color: theme.secondary }]}>{eW}%</Text>
                        <Text style={[styles.weightBadgeLabel, { color: theme.textSecondary }]}>Exams</Text>
                      </View>
                      <View style={styles.weightBadge}>
                        <Text style={[styles.weightBadgeValue, { color: '#10B981' }]}>{actW}%</Text>
                        <Text style={[styles.weightBadgeLabel, { color: theme.textSecondary }]}>Activities</Text>
                      </View>
                      <View style={styles.weightBadge}>
                        <Text style={[styles.weightBadgeValue, { color: '#F59E0B' }]}>{attW}%</Text>
                        <Text style={[styles.weightBadgeLabel, { color: theme.textSecondary }]}>Attendance</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              style={[
                styles.addCourseDashedCard,
                { borderColor: theme.border, backgroundColor: theme.cardAlt },
              ]}
              onPress={() => setShowSubjectModal(true)}
            >
              <Ionicons name="add-circle-outline" size={32} color={theme.primary} />
              <Text style={[styles.addCourseDashedText, { color: theme.primary }]}>
                Enrol New Course & Set Percentages
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ---------------------------------------------------------- */}
      {/* TIMETABLE SESSION MODAL                                    */}
      {/* ---------------------------------------------------------- */}
      <Modal visible={showScheduleModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeading, { color: theme.text }]}>
                {editingSchedule ? 'Edit Class Session' : 'New Schedule Entry'}
              </Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Title (e.g. Calculus Lecture)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="Session title"
                placeholderTextColor={theme.textTertiary}
                value={schedTitle}
                onChangeText={setSchedTitle}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Course</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.chipItem,
                      {
                        backgroundColor: schedSubjectId === s.id ? s.color : theme.cardAlt,
                        borderColor: s.color,
                      },
                    ]}
                    onPress={() => setSchedSubjectId(s.id)}
                  >
                    <Text
                      style={{
                        color: schedSubjectId === s.id ? '#FFFFFF' : theme.text,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {s.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Day of Week</Text>
              <View style={styles.weekSelector}>
                {WEEKDAYS.map((w) => (
                  <TouchableOpacity
                    key={w.day}
                    style={[
                      styles.weekSelectBtn,
                      {
                        backgroundColor: schedDay === w.day ? theme.primary : theme.cardAlt,
                        borderColor: schedDay === w.day ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setSchedDay(w.day)}
                  >
                    <Text
                      style={[
                        styles.weekSelectText,
                        { color: schedDay === w.day ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {w.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.twoInputsRow}>
                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Start Time</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="09:00"
                    placeholderTextColor={theme.textTertiary}
                    value={schedStart}
                    onChangeText={setSchedStart}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>End Time</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="10:30"
                    placeholderTextColor={theme.textTertiary}
                    value={schedEnd}
                    onChangeText={setSchedEnd}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Location / Room</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="Hall B, Room 304 or Zoom Link"
                placeholderTextColor={theme.textTertiary}
                value={schedLoc}
                onChangeText={setSchedLoc}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Session Type</Text>
              <View style={styles.typeSelectorRow}>
                {(['lecture', 'lab', 'tutorial', 'exam'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeBtn,
                      {
                        backgroundColor: schedType === t ? theme.primary : theme.cardAlt,
                        borderColor: schedType === t ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setSchedType(t)}
                  >
                    <Text
                      style={[
                        styles.typeBtnText,
                        { color: schedType === t ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveSchedule}
              >
                <Text style={styles.saveBtnText}>
                  {editingSchedule ? 'Update Session' : 'Save Session'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------------------------------------------------------- */}
      {/* ADD COURSE MODAL (WITH GRADING BREAKDOWN PERCENTAGES)       */}
      {/* ---------------------------------------------------------- */}
      <Modal visible={showSubjectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardLarge, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalHeading, { color: theme.text }]}>Add New Course</Text>
                <Text style={[styles.modalSubheading, { color: theme.textSecondary }]}>
                  Course details & grading percentage criteria
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSubjectModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Course Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="e.g. Data Structures & Algorithms"
                placeholderTextColor={theme.textTertiary}
                value={subName}
                onChangeText={setSubName}
              />

              <View style={styles.twoInputsRow}>
                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Course Code *</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="e.g. CS 210"
                    placeholderTextColor={theme.textTertiary}
                    value={subCode}
                    onChangeText={setSubCode}
                    autoCapitalize="characters"
                  />
                </View>

                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Credit Units</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="3.0"
                    placeholderTextColor={theme.textTertiary}
                    value={subCredits}
                    onChangeText={setSubCredits}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* GRADING PERCENTAGE INPUTS SECTION */}
              <View style={[styles.percentageCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <View style={styles.percentageHeaderRow}>
                  <View>
                    <Text style={[styles.percentageCardTitle, { color: theme.text }]}>
                      Grade Breakdown Percentages *
                    </Text>
                    <Text style={[styles.percentageCardSubtitle, { color: theme.textSecondary }]}>
                      Specify how quizzes, exams, activities, & attendance are weighted
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.totalPill,
                      { backgroundColor: totalPercentage === 100 ? '#10B98120' : '#EF444420' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.totalPillText,
                        { color: totalPercentage === 100 ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      Total: {totalPercentage}%
                    </Text>
                  </View>
                </View>

                {/* 4 Weight Inputs Grid */}
                <View style={styles.fourInputsGrid}>
                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Quiz %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      placeholder="25"
                      placeholderTextColor={theme.textTertiary}
                      value={subQuizWeight}
                      onChangeText={setSubQuizWeight}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Exam %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      placeholder="40"
                      placeholderTextColor={theme.textTertiary}
                      value={subExamWeight}
                      onChangeText={setSubExamWeight}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Activities %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      placeholder="25"
                      placeholderTextColor={theme.textTertiary}
                      value={subActivityWeight}
                      onChangeText={setSubActivityWeight}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.quarterField}>
                    <Text style={[styles.weightInputLabel, { color: theme.text }]}>Attendance %</Text>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                      placeholder="10"
                      placeholderTextColor={theme.textTertiary}
                      value={subAttendanceWeight}
                      onChangeText={setSubAttendanceWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Quick Presets */}
                <Text style={[styles.presetsTitle, { color: theme.textSecondary }]}>Quick Presets:</Text>
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={[styles.presetChip, { borderColor: theme.border }]}
                    onPress={() => applyWeightPreset(25, 40, 25, 10)}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>
                      Standard (25/40/25/10)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetChip, { borderColor: theme.border }]}
                    onPress={() => applyWeightPreset(20, 50, 20, 10)}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>
                      Exam Heavy (20/50/20/10)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetChip, { borderColor: theme.border }]}
                    onPress={() => applyWeightPreset(20, 30, 40, 10)}
                  >
                    <Text style={[styles.presetChipText, { color: theme.primary }]}>
                      Activity Heavy (20/30/40/10)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Professor / Instructor</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="e.g. Prof. David Vance"
                placeholderTextColor={theme.textTertiary}
                value={subProf}
                onChangeText={setSubProf}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Room / Campus</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="e.g. Turing Hall 102"
                placeholderTextColor={theme.textTertiary}
                value={subRoom}
                onChangeText={setSubRoom}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Color Theme</Text>
              <View style={styles.colorPaletteRow}>
                {theme.subjectColors.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      subColor === c && styles.colorDotSelected,
                    ]}
                    onPress={() => setSubColor(c)}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary, marginTop: 16 }]}
                onPress={handleSaveCourse}
              >
                <Text style={styles.saveBtnText}>Save Course & Grading Scale</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AcademicPeriodModal
        visible={showPeriodModal}
        onClose={() => setShowPeriodModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 14,
    marginBottom: 10,
  },
  tabBarItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBarText: { fontSize: 12, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // Daily View Stepper Card
  dateNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenterBtn: { alignItems: 'center', flex: 1 },
  dateNavTitle: { fontSize: 16, fontWeight: '800' },
  todayHint: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionHeading: { fontSize: 16, fontWeight: '800' },

  // Weekly selector
  daySelectorScroll: { marginBottom: 16 },
  daySelectorContent: { gap: 8 },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 54,
  },
  dayChipLabel: { fontSize: 13, fontWeight: '700' },
  dayChipCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  dayChipCountText: { fontSize: 10, fontWeight: '800' },

  // Empty box
  emptyBox: {
    padding: 30,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyBoxCompact: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyBoxTitle: { fontSize: 17, fontWeight: '800', marginTop: 6 },
  emptyBoxSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyAddBtn: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyAddBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  // Timetable cards
  scheduleList: { gap: 10 },
  schedCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 5,
    padding: 14,
    alignItems: 'center',
  },
  schedTimeCol: {
    alignItems: 'center',
    paddingRight: 12,
    minWidth: 58,
  },
  schedStartTime: { fontSize: 14, fontWeight: '800' },
  schedTimeDivider: { width: 1, height: 12, marginVertical: 3 },
  schedEndTime: { fontSize: 12, fontWeight: '600' },
  schedInfoCol: { flex: 1, paddingRight: 6 },
  schedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  courseBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  courseBadgeText: { fontSize: 11, fontWeight: '800' },
  typePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typePillText: { fontSize: 10, fontWeight: '800' },
  schedTitleText: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  schedProfText: { fontSize: 12, marginBottom: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: 11 },
  schedActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6 },

  // Tasks in Daily view
  tasksList: { gap: 8 },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '600' },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  taskSubTag: { fontSize: 11, fontWeight: '700' },
  taskTimeTag: { fontSize: 11 },

  // Monthly Calendar Card
  calendarCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleText: { fontSize: 17, fontWeight: '800' },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#88888830',
    marginBottom: 8,
  },
  dayHeaderCell: { width: 38, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  cellTouch: {
    width: '14.28%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  cellDayNum: { fontSize: 13 },
  cellDotsRow: { flexDirection: 'row', gap: 3, marginTop: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  agendaHeaderRow: { marginBottom: 10 },
  agendaHeading: { fontSize: 16, fontWeight: '800' },

  // Courses View
  coursesGrid: { gap: 12 },
  courseCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderTopWidth: 5,
    padding: 16,
  },
  courseCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  courseColorIndicator: { width: 10, height: 10, borderRadius: 5 },
  courseCodeLarge: { fontSize: 16, fontWeight: '800' },
  courseUnitsSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  courseDeleteBtn: { padding: 6 },
  courseNameLarge: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  courseDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  courseDetailText: { fontSize: 13 },

  gradeWeightsBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  gradeWeightsHeading: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  gradeWeightsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weightBadge: { alignItems: 'center' },
  weightBadgeValue: { fontSize: 14, fontWeight: '800' },
  weightBadgeLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  addCourseDashedCard: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addCourseDashedText: { fontSize: 14, fontWeight: '700' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 22,
    padding: 20,
    maxHeight: '90%',
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    padding: 20,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalHeading: { fontSize: 19, fontWeight: '800' },
  modalSubheading: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  inputLabel: { fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 5 },
  formInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  twoInputsRow: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  chipRow: { marginBottom: 6 },
  chipItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  weekSelector: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  weekSelectBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  weekSelectText: { fontSize: 12, fontWeight: '700' },
  typeSelectorRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeBtnText: { fontSize: 11, fontWeight: '800' },

  // Percentage Box inside Modal
  percentageCard: {
    marginVertical: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  percentageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  percentageCardTitle: { fontSize: 14, fontWeight: '800' },
  percentageCardSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  totalPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  totalPillText: { fontSize: 12, fontWeight: '800' },
  fourInputsGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quarterField: { flex: 1 },
  weightInputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  weightInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '700',
  },
  presetsTitle: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetChipText: { fontSize: 11, fontWeight: '700' },

  colorPaletteRow: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
