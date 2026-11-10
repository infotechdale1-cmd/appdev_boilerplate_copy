import { Ionicons } from '@expo/vector-icons';
import React, { useState, useMemo } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStudy } from '@/context/StudyContext';
import { useTheme } from '@/theme';
import { confirmAction, showSuccess } from '@/utils/confirm';
import type { Task } from '@/db/studytrack';

type FilterType = 'all' | 'pending' | 'completed' | 'high';

export default function TasksScreen() {
  const theme = useTheme();
  const {
    tasks,
    subjects,
    assessments,
    createTask,
    editTask,
    toggleTask,
    removeTask,
    createAssessment,
    editAssessment,
    createSubject,
    completedCount,
    pendingCount,
  } = useStudy();

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Plus menu modal state (Add Task vs Add Course)
  const [addMenuVisible, setAddMenuVisible] = useState(false);

  // Modal create/edit task state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSubjectId, setFormSubjectId] = useState<string>('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDueTime, setFormDueTime] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formEstimated, setFormEstimated] = useState('45');

  // Add Course modal state
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseColor, setCourseColor] = useState(theme.subjectColors[0]);
  const [courseProf, setCourseProf] = useState('');
  const [courseRoom, setCourseRoom] = useState('');
  const [courseCredits, setCourseCredits] = useState('3.0');
  const [courseQuizWeight, setCourseQuizWeight] = useState('25');
  const [courseExamWeight, setCourseExamWeight] = useState('40');
  const [courseActivityWeight, setCourseActivityWeight] = useState('25');
  const [courseAttendanceWeight, setCourseAttendanceWeight] = useState('10');
  const [savingCourse, setSavingCourse] = useState(false);

  // Score recording modal state (shown when completing or tapping a task)
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [scoreTask, setScoreTask] = useState<Task | null>(null);
  const [scoreSubjectId, setScoreSubjectId] = useState<string>('');
  const [scoreRaw, setScoreRaw] = useState('');
  const [scoreTotal, setScoreTotal] = useState('100');
  const [scoreCategory, setScoreCategory] = useState<'quiz' | 'assignment' | 'exam' | 'activity' | 'other'>('activity');
  const [scoreSaving, setScoreSaving] = useState(false);

  // Helper to find recorded assessment linked to this task
  const getTaskAssessment = (task: Task) => {
    return assessments.find((a) => {
      if (a.notes && a.notes.includes(task.id)) return true;
      return (
        task.subject_id &&
        a.subject_id === task.subject_id &&
        a.title.toLowerCase().trim() === task.title.toLowerCase().trim()
      );
    });
  };

  const openCreateModal = () => {
    setAddMenuVisible(false);
    setEditingTask(null);
    setFormTitle('');
    setFormDesc('');
    setFormSubjectId(subjects[0]?.id || '');
    setFormDueDate(new Date().toISOString().split('T')[0]);
    setFormDueTime('18:00');
    setFormPriority('medium');
    setFormEstimated('45');
    setModalVisible(true);
  };

  const openAddCourseModal = () => {
    setAddMenuVisible(false);
    setCourseName('');
    setCourseCode('');
    setCourseColor(theme.subjectColors[subjects.length % theme.subjectColors.length]);
    setCourseProf('');
    setCourseRoom('');
    setCourseCredits('3.0');
    setCourseQuizWeight('25');
    setCourseExamWeight('40');
    setCourseActivityWeight('25');
    setCourseAttendanceWeight('10');
    setCourseModalVisible(true);
  };

  const handleSaveCourse = async () => {
    if (!courseName.trim() || !courseCode.trim()) {
      Alert.alert('Missing Info', 'Please enter course name and course code.');
      return;
    }
    const qW = parseFloat(courseQuizWeight) || 0;
    const eW = parseFloat(courseExamWeight) || 0;
    const actW = parseFloat(courseActivityWeight) || 0;
    const attW = parseFloat(courseAttendanceWeight) || 0;
    const totalW = qW + eW + actW + attW;

    if (totalW !== 100) {
      const proceed = confirm(
        `Category weights total ${totalW}% (must ideally equal 100%). Continue anyway?`
      );
      if (!proceed) return;
    }

    setSavingCourse(true);
    try {
      const created = await createSubject({
        name: courseName.trim(),
        code: courseCode.trim().toUpperCase(),
        color: courseColor,
        credits: parseFloat(courseCredits) || 3.0,
        professor: courseProf.trim() || undefined,
        room: courseRoom.trim() || undefined,
        quiz_weight: qW,
        exam_weight: eW,
        activity_weight: actW,
        attendance_weight: attW,
      });
      // If we were adding/editing task, auto-select this new course
      setFormSubjectId(created.id);
      setScoreSubjectId(created.id);
      setCourseModalVisible(false);
      Alert.alert('Course Created! 🎓', `"${created.code} - ${created.name}" has been added.`);
    } catch {
      Alert.alert('Error', 'Failed to create course. Please try again.');
    } finally {
      setSavingCourse(false);
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDesc(task.description || '');
    setFormSubjectId(task.subject_id || '');
    setFormDueDate(task.due_date);
    setFormDueTime(task.due_time || '23:59');
    setFormPriority(task.priority);
    setFormEstimated((task.estimated_minutes || 45).toString());
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;

    if (editingTask) {
      await editTask(editingTask.id, {
        title: formTitle.trim(),
        description: formDesc.trim(),
        subject_id: formSubjectId || undefined,
        due_date: formDueDate,
        due_time: formDueTime,
        priority: formPriority,
        estimated_minutes: parseInt(formEstimated, 10) || 45,
      });
    } else {
      await createTask({
        title: formTitle.trim(),
        description: formDesc.trim(),
        subject_id: formSubjectId || undefined,
        due_date: formDueDate,
        due_time: formDueTime,
        priority: formPriority,
        estimated_minutes: parseInt(formEstimated, 10) || 45,
      });
    }
    setModalVisible(false);
  };

  const confirmDelete = (task: Task) => {
    confirmAction(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"? This action cannot be undone.`,
      'Delete',
      async () => {
        await removeTask(task.id);
        showSuccess('Task Deleted', `"${task.title}" has been successfully deleted.`);
      }
    );
  };

  // Open score modal for a specific task (preloading existing score if available)
  const openScoreModalForTask = (task: Task) => {
    setScoreTask(task);
    setScoreSubjectId(task.subject_id || subjects[0]?.id || '');

    const existing = getTaskAssessment(task);
    if (existing) {
      setScoreRaw(String(existing.raw_score));
      setScoreTotal(String(existing.total_items || 100));
      setScoreCategory((existing.category as any) || 'activity');
    } else {
      setScoreRaw('');
      setScoreTotal('100');
      // Guess category from task title
      const lower = task.title.toLowerCase();
      if (lower.includes('exam') || lower.includes('midterm') || lower.includes('final')) {
        setScoreCategory('exam');
      } else if (lower.includes('quiz')) {
        setScoreCategory('quiz');
      } else if (lower.includes('assign') || lower.includes('homework')) {
        setScoreCategory('assignment');
      } else {
        setScoreCategory('activity');
      }
    }
    setScoreModalVisible(true);
  };

  // Completed tasks can be reopened later to add or edit their score.
  const handleTaskCardClick = (task: Task) => {
    if (task.status === 'completed') {
      openScoreModalForTask(task);
    } else {
      Alert.alert(
        task.title,
        'What would you like to do with this activity?',
        [
          {
            text: 'Edit Details',
            onPress: () => openEditModal(task),
          },
          {
            text: 'Complete without score',
            onPress: () => {
              void toggleTask(task.id);
            },
          },
          {
            text: 'Complete & Record Score',
            onPress: () => {
              void toggleTask(task.id);
              openScoreModalForTask({ ...task, status: 'completed' });
            },
          },
        ]
      );
    }
  };

  // A checkbox only changes completion; score entry remains optional.
  const handleTaskComplete = (task: Task) => {
    void toggleTask(task.id);
  };

  // Save score as an assessment record linked to the task's subject
  const handleSaveScore = async () => {
    if (!scoreTask) return;
    const finalSubjectId = scoreSubjectId || scoreTask.subject_id;
    if (!finalSubjectId) {
      Alert.alert('Course Required', 'Please assign a course to this activity to record its grade.');
      return;
    }

    const raw = parseFloat(scoreRaw);
    const total = parseFloat(scoreTotal);
    if (isNaN(raw) || raw < 0) {
      Alert.alert('Invalid Score', 'Please enter a valid raw score.');
      return;
    }
    if (isNaN(total) || total <= 0) {
      Alert.alert('Invalid Total', 'Please enter a valid total points value.');
      return;
    }
    if (raw > total) {
      Alert.alert('Score Error', 'Score cannot exceed total points.');
      return;
    }

    setScoreSaving(true);
    try {
      // Ensure the task has this subject assigned if it had none
      if (!scoreTask.subject_id && finalSubjectId) {
        await editTask(scoreTask.id, { subject_id: finalSubjectId });
      }

      const existing = getTaskAssessment(scoreTask);
      const notePayload = JSON.stringify({ taskId: scoreTask.id, fromTask: true });

      if (existing) {
        await editAssessment(existing.id, {
          subject_id: finalSubjectId,
          title: scoreTask.title,
          category: scoreCategory,
          raw_score: raw,
          total_items: total,
          notes: notePayload,
        });
      } else {
        await createAssessment({
          subject_id: finalSubjectId,
          title: scoreTask.title,
          category: scoreCategory,
          raw_score: raw,
          total_items: total,
          weight_percent: 0, // Handled automatically by course category weights
          date: new Date().toISOString().split('T')[0],
          notes: notePayload,
        });
      }
      Alert.alert('Score Saved! 🎉', `Score for "${scoreTask.title}" recorded to your course grade.`);
    } catch {
      Alert.alert('Error', 'Could not save score. Please try again.');
    } finally {
      setScoreSaving(false);
      setScoreModalVisible(false);
    }
  };

  // Filtered task list
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Status & priority filter
      if (activeFilter === 'pending' && t.status !== 'pending') return false;
      if (activeFilter === 'completed' && t.status !== 'completed') return false;
      if (activeFilter === 'high' && (t.priority !== 'high' || t.status === 'completed')) return false;

      // Subject filter
      if (selectedSubjectId && t.subject_id !== selectedSubjectId) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = (t.description || '').toLowerCase().includes(q);
        const sub = subjects.find((s) => s.id === t.subject_id);
        const matchesSub = sub ? sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q) : false;
        if (!matchesTitle && !matchesDesc && !matchesSub) return false;
      }

      return true;
    });
  }, [tasks, activeFilter, selectedSubjectId, searchQuery, subjects]);

  const getSubject = (id?: string) => subjects.find((s) => s.id === id);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Study Tasks</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {pendingCount} remaining • {completedCount} completed
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => setAddMenuVisible(true)}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name="search" size={20} color={theme.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search tasks, courses, notes..."
          placeholderTextColor={theme.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Chips */}
      <View style={styles.filtersRow}>
        {(['all', 'pending', 'high', 'completed'] as FilterType[]).map((filter) => {
          const isSelected = activeFilter === filter;
          const label =
            filter === 'all'
              ? `All (${tasks.length})`
              : filter === 'pending'
              ? `Pending (${pendingCount})`
              : filter === 'high'
              ? 'Urgent / High'
              : `Done (${completedCount})`;

          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? theme.primary : theme.card,
                  borderColor: isSelected ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isSelected ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subject Filter Row */}
      {subjects.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subjectFilterScroll}
          contentContainerStyle={styles.subjectFilterContent}
        >
          <TouchableOpacity
            style={[
              styles.subChip,
              {
                backgroundColor: selectedSubjectId === null ? theme.cardAlt : theme.card,
                borderColor: selectedSubjectId === null ? theme.text : theme.border,
              },
            ]}
            onPress={() => setSelectedSubjectId(null)}
          >
            <Text
              style={[
                styles.subChipText,
                { color: selectedSubjectId === null ? theme.text : theme.textSecondary },
              ]}
            >
              All Courses
            </Text>
          </TouchableOpacity>

          {subjects.map((sub) => {
            const isSelected = selectedSubjectId === sub.id;
            return (
              <TouchableOpacity
                key={sub.id}
                style={[
                  styles.subChip,
                  {
                    backgroundColor: isSelected ? sub.color + '22' : theme.card,
                    borderColor: isSelected ? sub.color : theme.border,
                  },
                ]}
                onPress={() => setSelectedSubjectId(isSelected ? null : sub.id)}
              >
                <View style={[styles.subChipDot, { backgroundColor: sub.color }]} />
                <Text
                  style={[
                    styles.subChipText,
                    { color: isSelected ? sub.color : theme.textSecondary, fontWeight: '700' },
                  ]}
                >
                  {sub.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Task List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredTasks.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="document-text-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {tasks.length === 0 ? 'No activities yet' : 'No Tasks Found'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {tasks.length === 0
                ? 'No activities yet. Add your first academic activity.'
                : searchQuery
                ? `No results matching "${searchQuery}".`
                : activeFilter === 'completed'
                ? 'No completed tasks yet. Finish a task to see it here!'
                : 'No tasks match your current filter. Tap "+" above to create one!'}
            </Text>
            {tasks.length === 0 && (
              <TouchableOpacity
                style={{
                  marginTop: 14,
                  backgroundColor: theme.primary,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
                onPress={openCreateModal}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>+ Add Activity</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredTasks.map((task) => {
            const subject = getSubject(task.subject_id);
            const isDone = task.status === 'completed';
            const linkedAssessment = getTaskAssessment(task);

            return (
              <View
                key={task.id}
                style={[
                  styles.taskCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderLeftColor: subject?.color || theme.primary,
                  },
                ]}
              >
                {/* Checkbox */}
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isDone ? theme.success : theme.border,
                      backgroundColor: isDone ? theme.success : 'transparent',
                    },
                  ]}
                  onPress={() => handleTaskComplete(task)}
                >
                  {isDone && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </TouchableOpacity>

                {/* Content - Clickable to Put Score or Edit */}
                <TouchableOpacity
                  style={styles.cardContent}
                  activeOpacity={0.7}
                  onPress={() => handleTaskCardClick(task)}
                >
                  <Text
                    style={[
                      styles.cardTitle,
                      { color: theme.text },
                      isDone && styles.strikethrough,
                    ]}
                  >
                    {task.title}
                  </Text>

                  {task.description ? (
                    <Text
                      style={[styles.cardDesc, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {task.description}
                    </Text>
                  ) : null}

                  {/* Metadata Row */}
                  <View style={styles.metaRow}>
                    {subject && (
                      <View
                        style={[
                          styles.subBadge,
                          { backgroundColor: (subject.color || theme.primary) + '1A' },
                        ]}
                      >
                        <Text style={[styles.subBadgeText, { color: subject.color || theme.primary }]}>
                          {subject.code}
                        </Text>
                      </View>
                    )}

                    <View style={styles.dueWrap}>
                      <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                      <Text style={[styles.dueLabel, { color: theme.textSecondary }]}>
                        {task.due_date} {task.due_time ? `• ${task.due_time}` : ''}
                      </Text>
                    </View>

                    {task.estimated_minutes ? (
                      <View style={styles.dueWrap}>
                        <Ionicons name="hourglass-outline" size={13} color={theme.textSecondary} />
                        <Text style={[styles.dueLabel, { color: theme.textSecondary }]}>
                          {task.estimated_minutes}m
                        </Text>
                      </View>
                    ) : null}

                    {/* Linked Score Badge or Put Score Prompt */}
                    {linkedAssessment ? (
                      <View
                        style={[
                          styles.scoreBadgePill,
                          {
                            backgroundColor:
                              linkedAssessment.raw_score / linkedAssessment.total_items >= 0.75
                                ? '#10B98120'
                                : '#EF444420',
                            borderColor:
                              linkedAssessment.raw_score / linkedAssessment.total_items >= 0.75
                                ? '#10B98160'
                                : '#EF444460',
                          },
                        ]}
                      >
                        <Ionicons
                          name="ribbon-outline"
                          size={12}
                          color={
                            linkedAssessment.raw_score / linkedAssessment.total_items >= 0.75
                              ? '#10B981'
                              : '#EF4444'
                          }
                        />
                        <Text
                          style={[
                            styles.scoreBadgeText,
                            {
                              color:
                                linkedAssessment.raw_score / linkedAssessment.total_items >= 0.75
                                  ? '#10B981'
                                  : '#EF4444',
                            },
                          ]}
                        >
                          Score: {linkedAssessment.raw_score}/{linkedAssessment.total_items} (
                          {Math.round(
                            (linkedAssessment.raw_score / linkedAssessment.total_items) * 100
                          )}
                          %)
                        </Text>
                      </View>
                    ) : isDone ? (
                      <View
                        style={[
                          styles.putScoreBtn,
                          { backgroundColor: theme.primary + '18', borderColor: theme.primary + '50' },
                        ]}
                      >
                        <Ionicons name="add-circle-outline" size={12} color={theme.primary} />
                        <Text style={[styles.putScoreBtnText, { color: theme.primary }]}>
                          Put Score
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>

                {/* Action buttons (Edit & Delete) */}
                <View style={styles.actionsCol}>
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => openEditModal(task)}
                  >
                    <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => confirmDelete(task)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* CREATE / EDIT TASK MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeading, { color: theme.text }]}>
                {editingTask ? 'Edit Task' : 'New Study Task'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Task Title *</Text>
              <TextInput
                style={[
                  styles.formInput,
                  { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                ]}
                placeholder="e.g. Write Literature Term Paper"
                placeholderTextColor={theme.textTertiary}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <Text style={[styles.inputLabel, { color: theme.text, marginTop: 0 }]}>Course / Subject</Text>
                <TouchableOpacity onPress={openAddCourseModal}>
                  <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700' }}>+ Add Course</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {subjects.map((sub) => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[
                      styles.chipItem,
                      {
                        backgroundColor: formSubjectId === sub.id ? sub.color : theme.cardAlt,
                        borderColor: sub.color,
                      },
                    ]}
                    onPress={() => setFormSubjectId(sub.id)}
                  >
                    <Text
                      style={{
                        color: formSubjectId === sub.id ? '#FFFFFF' : theme.text,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {sub.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Notes & Details</Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    backgroundColor: theme.inputBackground,
                    color: theme.text,
                    borderColor: theme.border,
                    height: 60,
                  },
                ]}
                placeholder="Reference materials, rubric, instructions..."
                placeholderTextColor={theme.textTertiary}
                value={formDesc}
                onChangeText={setFormDesc}
                multiline
              />

              <View style={styles.twoInputsRow}>
                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Due Date</Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                    ]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textTertiary}
                    value={formDueDate}
                    onChangeText={setFormDueDate}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Due Time</Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
                    ]}
                    placeholder="HH:mm"
                    placeholderTextColor={theme.textTertiary}
                    value={formDueTime}
                    onChangeText={setFormDueTime}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Priority Level</Text>
              <View style={styles.priorityGroup}>
                {(['low', 'medium', 'high'] as const).map((p) => {
                  const isSel = formPriority === p;
                  const activeBg =
                    p === 'high' ? theme.danger : p === 'medium' ? theme.warning : theme.success;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.priorityChoice,
                        {
                          backgroundColor: isSel ? activeBg : theme.cardAlt,
                          borderColor: isSel ? activeBg : theme.border,
                        },
                      ]}
                      onPress={() => setFormPriority(p)}
                    >
                      <Text
                        style={[
                          styles.priorityChoiceText,
                          { color: isSel ? '#FFFFFF' : theme.textSecondary },
                        ]}
                      >
                        {p.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.saveTaskBtn, { backgroundColor: theme.primary }]}
                onPress={handleSave}
              >
                <Text style={styles.saveTaskBtnText}>
                  {editingTask ? 'Update Task' : 'Create Task'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Score Recording Modal ── */}
      <Modal
        visible={scoreModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScoreModalVisible(false)}
      >
        <Pressable
          style={styles.scoreOverlay}
          onPress={() => setScoreModalVisible(false)}
        >
          <Pressable style={[styles.scoreSheet, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
            {/* Header */}
            <View style={[styles.scoreHeader, { borderBottomColor: theme.border }]}>
              <View style={[styles.scoreIconWrap, { backgroundColor: theme.success + '22' }]}>
                <Ionicons name="ribbon" size={24} color={theme.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.scoreTitle, { color: theme.text }]}>Record Score / Grade</Text>
                <Text style={[styles.scoreSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  {scoreTask?.title}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setScoreModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20 }}>
              <Text style={[styles.scorePromptText, { color: theme.textSecondary }]}>
                Record your performance for this activity to automatically calculate into your course grade.
              </Text>

              {/* Course Selector */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={[styles.scoreLabel, { color: theme.text, marginTop: 0 }]}>Course / Subject *</Text>
                <TouchableOpacity onPress={openAddCourseModal}>
                  <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700' }}>+ New Course</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                {subjects.map((sub) => {
                  const isSel = scoreSubjectId === sub.id;
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      style={[
                        styles.chipItem,
                        {
                          backgroundColor: isSel ? sub.color : theme.cardAlt,
                          borderColor: sub.color,
                        },
                      ]}
                      onPress={() => setScoreSubjectId(sub.id)}
                    >
                      <Text
                        style={{
                          color: isSel ? '#FFFFFF' : theme.text,
                          fontWeight: '700',
                          fontSize: 13,
                        }}
                      >
                        {sub.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Category */}
              <Text style={[styles.scoreLabel, { color: theme.text }]}>Activity Category</Text>
              <View style={styles.scoreCategoryRow}>
                {(['quiz', 'assignment', 'exam', 'activity', 'other'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.scoreCatChip,
                      {
                        backgroundColor: scoreCategory === cat ? theme.primary : theme.cardAlt || theme.card,
                        borderColor: scoreCategory === cat ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setScoreCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.scoreCatChipText,
                        { color: scoreCategory === cat ? '#FFFFFF' : theme.textSecondary },
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Score Inputs (Weight % is removed, handled by course weights) */}
              <View style={styles.scoreInputRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.scoreLabel, { color: theme.text }]}>Raw Score</Text>
                  <TextInput
                    style={[styles.scoreInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={scoreRaw}
                    onChangeText={setScoreRaw}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 45"
                    placeholderTextColor={theme.textTertiary}
                    returnKeyType="next"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scoreLabel, { color: theme.text }]}>Total Points</Text>
                  <TextInput
                    style={[styles.scoreInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                    value={scoreTotal}
                    onChangeText={setScoreTotal}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 50"
                    placeholderTextColor={theme.textTertiary}
                    returnKeyType="done"
                  />
                </View>
              </View>

              {/* Percentage preview */}
              {scoreRaw !== '' && scoreTotal !== '' && !isNaN(Number(scoreRaw)) && !isNaN(Number(scoreTotal)) && Number(scoreTotal) > 0 && (
                <View style={[styles.scorePreviewRow, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]}>
                  <Ionicons name="stats-chart" size={16} color={theme.primary} />
                  <Text style={[styles.scorePreviewText, { color: theme.primary }]}>
                    {((Number(scoreRaw) / Number(scoreTotal)) * 100).toFixed(1)}% — {
                      (Number(scoreRaw) / Number(scoreTotal)) >= 0.9 ? 'Excellent 🌟' :
                      (Number(scoreRaw) / Number(scoreTotal)) >= 0.75 ? 'Passing 👍' :
                      (Number(scoreRaw) / Number(scoreTotal)) >= 0.6 ? 'Needs Review 📚' : 'Failing / Keep Trying 💪'
                    }
                  </Text>
                </View>
              )}

              <Text style={{ color: theme.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: 10 }}>
                ℹ Weight % is already configured in the course breakdown and automatically computed into your grades.
              </Text>

              {/* Actions */}
              <View style={styles.scoreActions}>
                <TouchableOpacity
                  style={[styles.scoreSkipBtn, { borderColor: theme.border }]}
                  onPress={() => setScoreModalVisible(false)}
                >
                  <Text style={[styles.scoreSkipText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scoreSaveBtn, { backgroundColor: theme.primary, opacity: scoreSaving ? 0.7 : 1 }]}
                  onPress={handleSaveScore}
                  disabled={scoreSaving}
                >
                  <Ionicons name="save-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.scoreSaveText}>{scoreSaving ? 'Saving…' : 'Save Score'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── PLUS SIGN ACTION MENU MODAL ── */}
      <Modal
        visible={addMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMenuVisible(false)}
      >
        <Pressable style={styles.addMenuOverlay} onPress={() => setAddMenuVisible(false)}>
          <View style={[styles.addMenuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.addMenuHeader}>
              <Text style={[styles.addMenuTitle, { color: theme.text }]}>Quick Add</Text>
              <TouchableOpacity onPress={() => setAddMenuVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.addMenuItem, { backgroundColor: theme.cardAlt }]}
              onPress={openCreateModal}
            >
              <View style={[styles.addMenuIconWrap, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="checkbox-outline" size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuItemTitle, { color: theme.text }]}>New Study Task</Text>
                <Text style={[styles.addMenuItemSubtitle, { color: theme.textSecondary }]}>
                  Assignment, homework, activity, or project
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addMenuItem, { backgroundColor: theme.cardAlt }]}
              onPress={openAddCourseModal}
            >
              <View style={[styles.addMenuIconWrap, { backgroundColor: '#06B6D420' }]}>
                <Ionicons name="book-outline" size={22} color="#06B6D4" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuItemTitle, { color: theme.text }]}>Add New Course</Text>
                <Text style={[styles.addMenuItemSubtitle, { color: theme.textSecondary }]}>
                  Course code, name, units & grading weights
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── ADD COURSE MODAL ── */}
      <Modal
        visible={courseModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCourseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeading, { color: theme.text }]}>Add New Course</Text>
              <TouchableOpacity onPress={() => setCourseModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Course Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="e.g. Data Structures & Algorithms"
                placeholderTextColor={theme.textTertiary}
                value={courseName}
                onChangeText={setCourseName}
              />

              <View style={styles.twoInputsRow}>
                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Course Code *</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="e.g. CS 201"
                    placeholderTextColor={theme.textTertiary}
                    value={courseCode}
                    onChangeText={setCourseCode}
                    autoCapitalize="characters"
                  />
                </View>

                <View style={styles.halfField}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Units / Credits</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    placeholder="3.0"
                    placeholderTextColor={theme.textTertiary}
                    value={courseCredits}
                    onChangeText={setCourseCredits}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Color Theme</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                {theme.subjectColors.map((col) => (
                  <TouchableOpacity
                    key={col}
                    style={[
                      styles.colorDotBtn,
                      { backgroundColor: col },
                      courseColor === col && styles.colorDotBtnSelected,
                    ]}
                    onPress={() => setCourseColor(col)}
                  />
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, { color: theme.text, marginTop: 10 }]}>
                Grading Weights (% Breakdown)
              </Text>
              <View style={styles.twoInputsRow}>
                <View style={styles.halfField}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 2 }}>Major Exams %</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    value={courseExamWeight}
                    onChangeText={setCourseExamWeight}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 2 }}>Quizzes %</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    value={courseQuizWeight}
                    onChangeText={setCourseQuizWeight}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={[styles.twoInputsRow, { marginTop: 6 }]}>
                <View style={styles.halfField}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 2 }}>Activities & Projects %</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    value={courseActivityWeight}
                    onChangeText={setCourseActivityWeight}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 2 }}>Attendance %</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                    value={courseAttendanceWeight}
                    onChangeText={setCourseAttendanceWeight}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveTaskBtn, { backgroundColor: theme.primary, marginTop: 20 }]}
                onPress={handleSaveCourse}
                disabled={savingCourse}
              >
                <Text style={styles.saveTaskBtnText}>{savingCourse ? 'Saving...' : 'Create Course'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  subjectFilterScroll: { maxHeight: 36, marginBottom: 12 },
  subjectFilterContent: { paddingHorizontal: 20, gap: 8 },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  subChipDot: { width: 8, height: 8, borderRadius: 4 },
  subChipText: { fontSize: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 5,
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
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  strikethrough: { textDecorationLine: 'line-through', opacity: 0.5 },
  cardDesc: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  subBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  subBadgeText: { fontSize: 11, fontWeight: '700' },
  dueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueLabel: { fontSize: 12 },
  actionsCol: { gap: 6 },
  actionIconBtn: { padding: 4 },
  emptyContainer: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '88%',
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalHeading: { fontSize: 20, fontWeight: '800' },
  inputLabel: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  formInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', marginVertical: 4 },
  chipItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  twoInputsRow: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  priorityGroup: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  priorityChoice: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  priorityChoiceText: { fontSize: 12, fontWeight: '700' },
  saveTaskBtn: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 12,
  },
  saveTaskBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // ── Score Recording Modal ──
  scoreOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  scoreSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  scoreIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreTitle: { fontSize: 16, fontWeight: '800' as const },
  scoreSubtitle: { fontSize: 12, marginTop: 1 },
  scorePromptText: { fontSize: 13, marginTop: 14, marginBottom: 4 },
  scoreLabel: { fontSize: 13, fontWeight: '700' as const, marginTop: 12, marginBottom: 6 },
  scoreCategoryRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  scoreCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  scoreCatChipText: { fontSize: 12, fontWeight: '700' as const },
  scoreInputRow: { flexDirection: 'row' as const, marginTop: 4 },
  scoreInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scorePreviewRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  scorePreviewText: { fontSize: 13, fontWeight: '700' as const },
  scoreActions: {
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 20,
    marginBottom: 6,
  },
  scoreSkipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  scoreSkipText: { fontSize: 15, fontWeight: '700' as const },
  scoreSaveBtn: {
    flex: 2,
    flexDirection: 'row' as const,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  scoreSaveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' as const },
  scoreBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  scoreBadgeText: { fontSize: 11, fontWeight: '700' },
  putScoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  putScoreBtnText: { fontSize: 11, fontWeight: '700' },
  addMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addMenuCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  addMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  addMenuTitle: { fontSize: 18, fontWeight: '800' },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
  },
  addMenuIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMenuItemTitle: { fontSize: 15, fontWeight: '700' },
  addMenuItemSubtitle: { fontSize: 12, marginTop: 2 },
  colorDotBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  colorDotBtnSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
});
