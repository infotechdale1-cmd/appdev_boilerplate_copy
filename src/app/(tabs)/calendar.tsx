import { Ionicons } from '@expo/vector-icons';
import React, { useState, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStudy } from '@/context/StudyContext';
import { useTheme } from '@/theme';
import { formatTime12Hour } from '@/utils/time';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const theme = useTheme();
  const { tasks, schedules, subjects, toggleTask } = useStudy();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Calendar month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Generate days in current month grid
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    const days: ({ dateString: string; dayNum: number; isCurrentMonth: boolean })[] = [];

    // Prev month padding
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

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const monthStr = (currentMonth + 1).toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      days.push({
        dateString: `${currentYear}-${monthStr}-${dayStr}`,
        dayNum: day,
        isCurrentMonth: true,
      });
    }

    // Trailing days
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

  // Selected date agenda items (tasks + class schedules for that day of week)
  const selectedDateTasks = useMemo(() => {
    return tasksByDate.get(selectedDate) || [];
  }, [tasksByDate, selectedDate]);

  const selectedDayOfWeek = useMemo(() => {
    const parts = selectedDate.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.getDay();
  }, [selectedDate]);

  const selectedDateSchedules = useMemo(() => {
    return schedules
      .filter((sc) => sc.day_of_week === selectedDayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, selectedDayOfWeek]);

  const getSubject = (id?: string) => subjects.find((s) => s.id === id);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <View style={styles.topHeader}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>Study Calendar</Text>
        <Text style={[styles.screenSubtitle, { color: theme.textSecondary }]}>
          Deadlines, exams & class schedules
        </Text>
      </View>

      {/* Month Navigator Card */}
      <View style={[styles.calendarCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.monthHeader}>
          <TouchableOpacity
            style={[styles.monthNavBtn, { backgroundColor: theme.cardAlt }]}
            onPress={prevMonth}
          >
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </TouchableOpacity>

          <Text style={[styles.monthTitleText, { color: theme.text }]}>{monthName}</Text>

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

        {/* Calendar Grid */}
        <View style={styles.gridContainer}>
          {calendarDays.map((item, index) => {
            const isSelected = item.dateString === selectedDate;
            const isToday = item.dateString === new Date().toISOString().split('T')[0];
            const dayTasks = tasksByDate.get(item.dateString) || [];
            const hasUrgent = dayTasks.some((t) => t.priority === 'high' && t.status === 'pending');

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  isSelected && {
                    backgroundColor: theme.primary,
                    borderRadius: 14,
                  },
                ]}
                onPress={() => setSelectedDate(item.dateString)}
              >
                <Text
                  style={[
                    styles.dayNumText,
                    {
                      color: isSelected
                        ? '#FFFFFF'
                        : isToday
                        ? theme.primary
                        : item.isCurrentMonth
                        ? theme.text
                        : theme.textTertiary,
                      fontWeight: isSelected || isToday ? '800' : '600',
                    },
                  ]}
                >
                  {item.dayNum}
                </Text>

                {/* Dot indicators for deadlines/events */}
                <View style={styles.dotsRow}>
                  {dayTasks.length > 0 && (
                    <View
                      style={[
                        styles.indicatorDot,
                        {
                          backgroundColor: isSelected
                            ? '#FFFFFF'
                            : hasUrgent
                            ? theme.danger
                            : theme.primary,
                        },
                      ]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected Day Agenda */}
      <View style={styles.agendaHeader}>
        <View>
          <Text style={[styles.agendaTitle, { color: theme.text }]}>
            Agenda for {selectedDate}
          </Text>
          <Text style={[styles.agendaSubtitle, { color: theme.textSecondary }]}>
            {DAYS_OF_WEEK[selectedDayOfWeek]} • {selectedDateTasks.length} task{selectedDateTasks.length === 1 ? '' : 's'} • {selectedDateSchedules.length} class{selectedDateSchedules.length === 1 ? '' : 'es'}
          </Text>
        </View>
      </View>

      {/* Scheduled Classes & Sessions */}
      {selectedDateSchedules.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={[styles.blockTitle, { color: theme.textSecondary }]}>CLASSES & SESSIONS</Text>
          {selectedDateSchedules.map((sc) => {
            const subject = getSubject(sc.subject_id);
            return (
              <View
                key={sc.id}
                style={[
                  styles.agendaItemCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderLeftColor: subject?.color || theme.primary,
                  },
                ]}
              >
                <View style={styles.timeTag}>
                  <Text style={[styles.timeTagText, { color: theme.text }]}>{sc.start_time}</Text>
                  <Text style={[styles.timeTagSub, { color: theme.textSecondary }]}>{sc.end_time}</Text>
                </View>

                <View style={styles.agendaInfo}>
                  <Text style={[styles.agendaMainTitle, { color: theme.text }]}>{sc.title}</Text>
                  <Text style={[styles.agendaSubTitle, { color: theme.textSecondary }]}>
                    {subject ? `${subject.code} (${subject.name})` : 'General'}
                    {sc.location ? ` • ${sc.location}` : ''}
                  </Text>
                </View>

                <View style={[styles.typeBadge, { backgroundColor: theme.cardAlt }]}>
                  <Text style={[styles.typeBadgeText, { color: theme.primary }]}>
                    {sc.type.toUpperCase()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Due Tasks */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.blockTitle, { color: theme.textSecondary }]}>DEADLINES & TASKS</Text>
        {selectedDateTasks.length === 0 ? (
          <View style={[styles.emptyDayCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="checkmark-done-circle-outline" size={32} color={theme.success} />
            <Text style={[styles.emptyDayText, { color: theme.text }]}>No deadlines for this date</Text>
          </View>
        ) : (
          selectedDateTasks.map((task) => {
            const subject = getSubject(task.subject_id);
            const isDone = task.status === 'completed';

            return (
              <View
                key={task.id}
                style={[
                  styles.agendaItemCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderLeftColor: subject?.color || theme.primary,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isDone ? theme.success : theme.border,
                      backgroundColor: isDone ? theme.success : 'transparent',
                    },
                  ]}
                  onPress={() => toggleTask(task.id)}
                >
                  {isDone && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                </TouchableOpacity>

                <View style={styles.agendaInfo}>
                  <Text
                    style={[
                      styles.agendaMainTitle,
                      { color: theme.text },
                      isDone && styles.strikethrough,
                    ]}
                  >
                    {task.title}
                  </Text>
                  <Text style={[styles.agendaSubTitle, { color: theme.textSecondary }]}>
                    {subject ? `${subject.code} • ` : ''}Due at {formatTime12Hour(task.due_time || '23:59')}
                  </Text>
                </View>

                {task.priority === 'high' && (
                  <View style={[styles.typeBadge, { backgroundColor: theme.danger + '18' }]}>
                    <Text style={[styles.typeBadgeText, { color: theme.danger }]}>URGENT</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  topHeader: { marginBottom: 14 },
  screenTitle: { fontSize: 26, fontWeight: '800' },
  screenSubtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  calendarCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitleText: { fontSize: 17, fontWeight: '800' },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysRow: { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dayNumText: { fontSize: 14 },
  dotsRow: { height: 6, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  indicatorDot: { width: 5, height: 5, borderRadius: 2.5 },
  agendaHeader: { marginBottom: 12 },
  agendaTitle: { fontSize: 18, fontWeight: '800' },
  agendaSubtitle: { fontSize: 12, marginTop: 2 },
  sectionBlock: { marginBottom: 16, gap: 8 },
  blockTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  agendaItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 5,
    gap: 12,
  },
  timeTag: { alignItems: 'center', minWidth: 50 },
  timeTagText: { fontSize: 13, fontWeight: '800' },
  timeTagSub: { fontSize: 11 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaInfo: { flex: 1 },
  agendaMainTitle: { fontSize: 14, fontWeight: '700' },
  agendaSubTitle: { fontSize: 12, marginTop: 3 },
  strikethrough: { textDecorationLine: 'line-through', opacity: 0.5 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  emptyDayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyDayText: { fontSize: 14, fontWeight: '600' },
});
