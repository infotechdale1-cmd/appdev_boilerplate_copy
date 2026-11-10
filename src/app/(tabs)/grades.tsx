import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
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
import { useStudy, type SubjectGradeStats } from '@/context/StudyContext';
import type { Assessment, GradingCategory, Subject } from '@/db/studytrack';
import { useTheme } from '@/theme';

/** Quick regex-based score detector: looks for "18/20", "18 out of 20" */
export function detectScoreInText(text: string): { raw: number; total: number } | null {
  const patterns = [
    /\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/,
    /\b(\d+(?:\.\d+)?)\s+out\s+of\s+(\d+(?:\.\d+)?)\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const raw = parseFloat(m[1]);
      const total = parseFloat(m[2]);
      if (!isNaN(raw) && !isNaN(total) && total > 0 && raw <= total) return { raw, total };
    }
  }
  return null;
}

const ASSESSMENT_CATEGORIES: { id: Assessment['category']; label: string; icon: string; color: string }[] = [
  { id: 'quiz', label: 'Quiz', icon: 'clipboard-outline', color: '#F59E0B' },
  { id: 'exam', label: 'Major Exam', icon: 'document-text-outline', color: '#EF4444' },
  { id: 'activity', label: 'Activity / Homework', icon: 'reader-outline', color: '#3B82F6' },
  { id: 'attendance', label: 'Attendance', icon: 'checkmark-circle-outline', color: '#10B981' },
  { id: 'project', label: 'Project', icon: 'laptop-outline', color: '#8B5CF6' },
  { id: 'assignment', label: 'Assignment', icon: 'document-attach-outline', color: '#06B6D4' },
  { id: 'recitation', label: 'Recitation', icon: 'chatbubbles-outline', color: '#EC4899' },
  { id: 'other', label: 'Other', icon: 'bookmark-outline', color: '#6B7280' },
];

export default function GradesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const {
    subjects,
    activePeriod,
    createAssessment,
    editAssessment,
    removeAssessment,
    createSubject,
    editSubject,
    getSubjectGradeStats,
    getSubjectAssessments,
    semesterGPA,
    semesterGWA,
    semesterAveragePercentage,
    totalEnrolledCredits,
    passingSubjectsCount,
    atRiskSubjectsCount,
    failingSubjects,
    gradingMode,
  } = useStudy();

  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [assessmentModalVisible, setAssessmentModalVisible] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const [selectedIntervention, setSelectedIntervention] = useState<SubjectGradeStats | null>(null);

  // Add Course Modal states
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseProf, setNewCourseProf] = useState('');
  const [newCourseRoom, setNewCourseRoom] = useState('');
  const [newCourseColor, setNewCourseColor] = useState(theme.subjectColors[0]);
  const [newCourseQuizWeight, setNewCourseQuizWeight] = useState('25');
  const [newCourseExamWeight, setNewCourseExamWeight] = useState('40');
  const [newCourseActivityWeight, setNewCourseActivityWeight] = useState('25');
  const [newCourseAttendanceWeight, setNewCourseAttendanceWeight] = useState('10');

  // Score Proof Viewer & Management Modal
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [activeProofItem, setActiveProofItem] = useState<Assessment | null>(null);

  // Custom Grading Categories Breakdown Modal
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalSubject, setCategoryModalSubject] = useState<Subject | null>(null);
  const [editingCategories, setEditingCategories] = useState<GradingCategory[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatWeight, setNewCatWeight] = useState('');

  // Form states
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<Assessment['category']>('quiz');
  const [formCustomCategory, setFormCustomCategory] = useState('');
  const [formRawScore, setFormRawScore] = useState('');
  const [formTotalItems, setFormTotalItems] = useState('100');
  const [formWeight, setFormWeight] = useState('20');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formEvidenceUri, setFormEvidenceUri] = useState<string>('');

  // Score suggestion from proof
  const [suggestedRaw, setSuggestedRaw] = useState<number | null>(null);
  const [suggestedTotal, setSuggestedTotal] = useState<number | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const openAddAssessmentModal = (subjectId?: string) => {
    setEditingAssessment(null);
    const subId = subjectId || (subjects.length > 0 ? subjects[0].id : '');
    setFormSubjectId(subId);
    setFormTitle('');
    setFormCategory('quiz');
    setFormCustomCategory('');
    setFormRawScore('');
    setFormTotalItems('100');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormEvidenceUri('');
    setSuggestedRaw(null);
    setSuggestedTotal(null);
    setShowSuggestion(false);
    setAssessmentModalVisible(true);
  };

  const openEditAssessmentModal = (assessment: Assessment) => {
    setEditingAssessment(assessment);
    setFormSubjectId(assessment.subject_id);
    setFormTitle(assessment.title);
    setFormCategory(assessment.category);
    setFormCustomCategory(assessment.custom_category || '');
    setFormRawScore(String(assessment.raw_score));
    setFormTotalItems(String(assessment.total_items));
    setFormDate(assessment.date || new Date().toISOString().split('T')[0]);
    setFormNotes(assessment.notes || '');
    setFormEvidenceUri(assessment.evidence_uri || '');
    setSuggestedRaw(null);
    setSuggestedTotal(null);
    setShowSuggestion(false);
    setAssessmentModalVisible(true);
  };

  const handleSaveCourse = async () => {
    if (!newCourseName.trim() || !newCourseCode.trim()) {
      Alert.alert('Required Fields', 'Please enter course title and code.');
      return;
    }
    const qW = parseFloat(newCourseQuizWeight) || 25;
    const eW = parseFloat(newCourseExamWeight) || 40;
    const actW = parseFloat(newCourseActivityWeight) || 25;
    const attW = parseFloat(newCourseAttendanceWeight) || 10;
    await createSubject({
      name: newCourseName.trim(),
      code: newCourseCode.trim().toUpperCase(),
      color: newCourseColor,
      professor: newCourseProf.trim(),
      room: newCourseRoom.trim(),
      credits: 3.0,
      target_grade: 90.0,
      passing_grade: 75.0,
      quiz_weight: qW,
      exam_weight: eW,
      activity_weight: actW,
      attendance_weight: attW,
    });
    setNewCourseName('');
    setNewCourseCode('');
    setNewCourseProf('');
    setNewCourseRoom('');
    setCourseModalVisible(false);
  };

  const openProofModal = (item: Assessment) => {
    setActiveProofItem(item);
    setProofModalVisible(true);
  };

  const openCategoryModal = (sub: Subject) => {
    setCategoryModalSubject(sub);
    let cats: GradingCategory[] = [];
    if (sub.grading_categories) {
      try {
        cats = JSON.parse(sub.grading_categories);
      } catch {
        cats = [];
      }
    }
    if (cats.length === 0) {
      cats = [
        { id: 'exam', name: 'Major Exams', weight: sub.exam_weight ?? 40 },
        { id: 'quiz', name: 'Quizzes', weight: sub.quiz_weight ?? 25 },
        { id: 'activity', name: 'Activities & Projects', weight: sub.activity_weight ?? 25 },
        { id: 'attendance', name: 'Attendance', weight: sub.attendance_weight ?? 10 },
      ];
    }
    setEditingCategories(cats);
    setNewCatName('');
    setNewCatWeight('');
    setCategoryModalVisible(true);
  };

  const handleSaveCategories = async () => {
    if (!categoryModalSubject) return;
    const total = editingCategories.reduce((s, c) => s + (c.weight ?? 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      const proceed = Platform.OS === 'web'
        ? window.confirm(`Weights total ${total.toFixed(1)}% (must equal 100% for a complete breakdown). If you save now, grades will be marked as provisional until weights total 100%. Save anyway?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Provisional Breakdown',
              `Weights total ${total.toFixed(1)}% (must equal 100% for a finalized grade). Save as provisional breakdown?`,
              [
                { text: 'Keep Editing', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Save Provisional', onPress: () => resolve(true) },
              ]
            );
          });
      if (!proceed) return;
    }
    await editSubject(categoryModalSubject.id, {
      grading_categories: JSON.stringify(editingCategories),
    });
    setCategoryModalVisible(false);
  };

  const handleSaveAssessment = async () => {
    if (!formSubjectId) {
      Alert.alert('Required', 'Please select a subject.');
      return;
    }
    if (!formTitle.trim()) {
      Alert.alert('Required', 'Please enter an assessment title.');
      return;
    }
    const raw = parseFloat(formRawScore);
    const total = parseFloat(formTotalItems);

    if (isNaN(raw) || isNaN(total) || total <= 0) {
      Alert.alert('Invalid Score', 'Raw score and total items must be valid positive numbers.');
      return;
    }

    // Weight % is automatically handled by course-level grading category weights
    const weight = editingAssessment ? editingAssessment.weight_percent : 0;

    try {
      if (editingAssessment) {
        await editAssessment(editingAssessment.id, {
          title: formTitle.trim(),
          category: formCategory,
          custom_category: formCustomCategory.trim() || undefined,
          raw_score: raw,
          total_items: total,
          weight_percent: weight,
          date: formDate,
          notes: formNotes.trim(),
          evidence_uri: formEvidenceUri || undefined,
        });
      } else {
        await createAssessment({
          subject_id: formSubjectId,
          title: formTitle.trim(),
          category: formCategory,
          custom_category: formCustomCategory.trim() || undefined,
          raw_score: raw,
          total_items: total,
          weight_percent: weight,
          date: formDate,
          notes: formNotes.trim(),
          evidence_uri: formEvidenceUri || undefined,
        });
      }
      setAssessmentModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save assessment score.');
    }
  };

  const handleDeleteAssessment = (id: string, title: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete assessment "${title}"?`)) {
        void removeAssessment(id);
      }
    } else {
      Alert.alert('Delete Assessment', `Delete "${title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void removeAssessment(id) },
      ]);
    }
  };

  // Academic standing definition using Philippine College Scale (1.00 - 5.00)
  const academicStanding = useMemo(() => {
    if (gradingMode === 'percentage') {
      if (semesterAveragePercentage >= 90) {
        return { title: "With High Honors", color: '#10B981', icon: 'ribbon-outline' };
      }
      if (semesterAveragePercentage > 0 && semesterAveragePercentage < 75) {
        return { title: 'Academic Warning', color: '#EF4444', icon: 'alert-circle-outline' };
      }
      return { title: 'Good Academic Standing', color: '#3B82F6', icon: 'shield-checkmark-outline' };
    }

    if (semesterGWA > 0 && semesterGWA <= 1.75) {
      return { title: "Dean's Honor List", color: '#10B981', icon: 'ribbon-outline' };
    }
    if (semesterGWA > 3.0 || atRiskSubjectsCount > 0) {
      return { title: 'Academic Warning', color: '#EF4444', icon: 'alert-circle-outline' };
    }
    return { title: 'Good Academic Standing', color: '#3B82F6', icon: 'shield-checkmark-outline' };
  }, [gradingMode, semesterGWA, semesterAveragePercentage, atRiskSubjectsCount]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.desktopContainer]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header & Period Selector */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Academic Performance</Text>
            <Text style={[styles.pageSubtitle, { color: theme.textSecondary }]}>
              Grades, weighted scores & GWA tracking
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setPeriodModalVisible(true)}
            style={[styles.periodPill, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Ionicons name="calendar-outline" size={15} color={theme.primary} />
            <Text style={[styles.periodPillText, { color: theme.text }]}>
              {activePeriod ? `${activePeriod.semester} (${activePeriod.academic_year})` : 'Set Term'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Urgent Failing Alert Global Banner */}
        {failingSubjects.length > 0 && (
          <View style={[styles.failingGlobalBanner, { backgroundColor: '#EF444415', borderColor: '#EF444455' }]}>
            <View style={styles.failingBannerLeft}>
              <View style={[styles.failingAlertIconWrap, { backgroundColor: '#EF444425' }]}>
                <Ionicons name="warning" size={24} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.failingBannerTitle}>
                  {gradingMode === 'percentage'
                    ? `Academic Alert: ${failingSubjects.length} Course(s) Below Passing (< 75%)`
                    : `Academic Alert: ${failingSubjects.length} Course(s) Failing (> 3.00)`}
                </Text>
                <Text style={[styles.failingBannerSub, { color: theme.textSecondary }]}>
                  {gradingMode === 'percentage'
                    ? 'Passing requirement is 75.0%. Courses below 75.0% require immediate intervention.'
                    : 'Passing grade is 3.00. Courses in the 3.10 – 5.00 range require immediate intervention.'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.interventionBannerBtn, { backgroundColor: theme.primary }]}
              onPress={() => setSelectedIntervention(failingSubjects[0])}
            >
              <Ionicons name="sparkles" size={15} color="#FFFFFF" />
              <Text style={styles.interventionBannerBtnText}>View AI Intervention</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Desktop 2-column or Mobile 1-column layout */}
        <View style={isDesktop ? styles.desktopLayout : styles.mobileLayout}>
          {/* LEFT COLUMN: Summary Cards & Simulator */}
          <View style={isDesktop ? styles.desktopColLeft : styles.fullWidth}>
            {/* GPA Summary Card */}
            <View style={[styles.gpaHeroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.gpaHeroTop}>
                <View style={{ flex: 1 }}>
                  {gradingMode === 'percentage' ? (
                    <>
                      <Text style={[styles.gpaLabel, { color: theme.textSecondary }]}>
                        OVERALL AVERAGE PERCENTAGE
                      </Text>
                      <View style={styles.gpaNumberRow}>
                        <View>
                          <Text style={[styles.scaleHeaderLabel, { color: theme.textSecondary }]}>
                            High School Mode (0–100%)
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                            <Text
                              style={[
                                styles.gpaNumber,
                                { color: (semesterAveragePercentage > 0 ? semesterAveragePercentage : 100) < 75 ? '#EF4444' : theme.primary },
                              ]}
                            >
                              {semesterAveragePercentage > 0 ? `${semesterAveragePercentage}` : '—'}
                            </Text>
                            <Text style={[styles.gpaScaleLabel, { color: theme.textSecondary }]}>%</Text>
                          </View>
                          <Text style={[styles.scaleHeaderLabel, { color: semesterAveragePercentage > 0 && semesterAveragePercentage < 75 ? '#EF4444' : '#10B981', marginTop: 2 }]}>
                            {semesterAveragePercentage >= 75 ? '✓ Passing (≥75%)' : semesterAveragePercentage > 0 ? '✗ Below Passing' : 'No data yet'}
                          </Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.gpaLabel, { color: theme.textSecondary }]}>
                        GENERAL WEIGHTED AVERAGE (GWA)
                      </Text>
                      <View style={styles.gpaNumberRow}>
                        <View>
                          <Text style={[styles.scaleHeaderLabel, { color: theme.textSecondary }]}>
                            College Scale (1.00 – 5.00)
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                            <Text
                              style={[
                                styles.gpaNumber,
                                { color: semesterGWA > 3.0 ? '#EF4444' : theme.primary },
                              ]}
                            >
                              {semesterGWA > 0 ? semesterGWA.toFixed(2) : '—'}
                            </Text>
                            <Text style={[styles.gpaScaleLabel, { color: theme.textSecondary }]}>GWA</Text>
                          </View>
                          <Text style={[styles.scaleHeaderLabel, { color: semesterGWA > 0 && semesterGWA > 3.0 ? '#EF4444' : '#10B981', marginTop: 2 }]}>
                            {semesterGWA > 0 ? (semesterGWA <= 3.0 ? '✓ Passing (≤3.00)' : '✗ Below Passing (>3.00)') : 'No grades recorded yet'}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                <View style={[styles.standingBadge, { backgroundColor: academicStanding.color + '18' }]}>
                  <Ionicons name={academicStanding.icon as any} size={16} color={academicStanding.color} />
                  <Text style={[styles.standingBadgeText, { color: academicStanding.color }]}>
                    {academicStanding.title}
                  </Text>
                </View>
              </View>

              {/* Metric Quick Stats */}
              <View style={[styles.metricStatsGrid, { borderTopColor: theme.border }]}>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricValue, { color: theme.text }]}>
                    {semesterAveragePercentage > 0 ? `${semesterAveragePercentage}%` : '—'}
                  </Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Avg Score</Text>
                </View>

                <View style={[styles.metricDivider, { backgroundColor: theme.border }]} />

                <View style={styles.metricItem}>
                  <Text style={[styles.metricValue, { color: theme.text }]}>{totalEnrolledCredits}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Units Enrolled</Text>
                </View>

                <View style={[styles.metricDivider, { backgroundColor: theme.border }]} />

                <View style={styles.metricItem}>
                  <Text style={[styles.metricValue, { color: '#10B981' }]}>{passingSubjectsCount}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                    {gradingMode === 'percentage' ? 'Passing (≥ 75%)' : 'Passing (≤ 3.0)'}
                  </Text>
                </View>

                {failingSubjects.length > 0 && (
                  <>
                    <View style={[styles.metricDivider, { backgroundColor: theme.border }]} />
                    <View style={styles.metricItem}>
                      <Text style={[styles.metricValue, { color: '#EF4444' }]}>{failingSubjects.length}</Text>
                      <Text style={[styles.metricLabel, { color: '#EF4444', fontWeight: '700' }]}>
                        {gradingMode === 'percentage' ? 'Failing (< 75%)' : 'Failing (> 3.0)'}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* What-If Target Simulator Card */}
            <View style={[styles.simulatorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.simulatorHeader}>
                <View style={[styles.simIconWrap, { backgroundColor: theme.secondary + '18' }]}>
                  <Ionicons name="calculator-outline" size={18} color={theme.secondary} />
                </View>
                <View>
                  <Text style={[styles.simTitle, { color: theme.text }]}>Target Grade Simulator</Text>
                  <Text style={[styles.simSubtitle, { color: theme.textSecondary }]}>
                    What scores you need on remaining exams
                  </Text>
                </View>
              </View>

              {subjects.length === 0 ? (
                <Text style={[styles.simEmpty, { color: theme.textSecondary }]}>
                  Add subjects to view target projections.
                </Text>
              ) : (
                subjects.map((sub) => {
                  const stats = getSubjectGradeStats(sub.id);
                  return (
                    <View key={sub.id} style={[styles.simRow, { borderColor: theme.border }]}>
                      <View style={styles.simSubjectLeft}>
                        <View style={[styles.subColorDot, { backgroundColor: sub.color }]} />
                        <Text style={[styles.simSubjectCode, { color: theme.text }]}>{sub.code}</Text>
                      </View>

                      <View style={styles.simSubjectRight}>
                        {stats.remainingWeight === 0 ? (
                          <Text style={[styles.simStatusDone, { color: '#10B981' }]}>100% Completed</Text>
                        ) : stats.neededPercentageForTarget !== null ? (
                          <Text style={[styles.simNeededText, { color: theme.text }]}>
                            Need{' '}
                            <Text style={{ color: theme.primary, fontWeight: '700' }}>
                              {stats.neededPercentageForTarget}%
                            </Text>{' '}
                            on remaining {stats.remainingWeight}%
                          </Text>
                        ) : (
                          <Text style={[styles.simNeededText, { color: theme.textSecondary }]}>
                            Target reached
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>

          {/* RIGHT COLUMN: Subject Breakdown & Assessment Tables */}
          <View style={isDesktop ? styles.desktopColRight : styles.fullWidth}>
            <View style={styles.subjectListHeader}>
              <Text style={[styles.sectionHeading, { color: theme.text }]}>Courses & Assessments</Text>
              <TouchableOpacity
                onPress={() => openAddAssessmentModal()}
                style={[styles.addScoreTopBtn, { backgroundColor: theme.primary }]}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addScoreTopBtnText}>Record Score</Text>
              </TouchableOpacity>
            </View>

            {subjects.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Ionicons name="school-outline" size={40} color={theme.textSecondary} />
                <Text style={[styles.emptyBoxTitle, { color: theme.text }]}>No assessments recorded for this semester</Text>
                <Text style={[styles.emptyBoxDesc, { color: theme.textSecondary }]}>
                  No subjects or assessments exist for this semester. Add your enrolled courses to start recording assessment scores and tracking weighted grades.
                </Text>
              </View>
            ) : (
              subjects.map((sub) => {
                const stats = getSubjectGradeStats(sub.id);
                const subAssessments = getSubjectAssessments(sub.id);
                const isExpanded = expandedSubjectId === sub.id || isDesktop;

                return (
                  <View
                    key={sub.id}
                    style={[styles.subjectCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                  >
                    {/* Subject Header */}
                    <TouchableOpacity
                      onPress={() => setExpandedSubjectId(isExpanded && !isDesktop ? null : sub.id)}
                      activeOpacity={0.8}
                      style={styles.subjectHeaderRow}
                    >
                      <View style={styles.subjectHeaderLeft}>
                        <View style={[styles.subjectColorBar, { backgroundColor: sub.color }]} />
                        <View>
                          <View style={styles.codeCreditsRow}>
                            <Text style={[styles.subjectCode, { color: theme.text }]}>{sub.code}</Text>
                            <View style={[styles.creditsPill, { backgroundColor: theme.border + '60' }]}>
                              <Text style={[styles.creditsText, { color: theme.textSecondary }]}>
                                {sub.credits ?? 3.0} Units
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.subjectName, { color: theme.textSecondary }]} numberOfLines={1}>
                            {sub.name}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.subjectHeaderRight}>
                        <View style={styles.gradeBadgeWrap}>
                          {stats.earnedWeight > 0 ? (
                            <>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text
                                  style={[
                                    styles.phGradeLarge,
                                    { color: stats.isFailing ? '#EF4444' : theme.text },
                                  ]}
                                >
                                  {gradingMode === 'college'
                                    ? stats.phScale.toFixed(2)
                                    : `${stats.currentPercentage.toFixed(1)}%`}
                                </Text>
                                <Text style={[styles.phGradeSub, { color: theme.textSecondary }]}>
                                  {gradingMode === 'college'
                                    ? `${stats.currentPercentage.toFixed(1)}% raw`
                                    : stats.isProvisional
                                    ? 'provisional'
                                    : stats.isFailing
                                    ? 'below 75%'
                                    : 'passing'}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.letterGradePill,
                                  {
                                    backgroundColor: stats.isFailing
                                      ? '#EF444420'
                                      : stats.status === 'excellent'
                                      ? '#10B98120'
                                      : '#3B82F620',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.letterGradeText,
                                    {
                                      color: stats.isFailing
                                        ? '#EF4444'
                                        : stats.status === 'excellent'
                                        ? '#10B981'
                                        : '#3B82F6',
                                    },
                                  ]}
                                >
                                  {stats.isFailing ? 'FAILING' : stats.status === 'excellent' ? 'EXCELLENT' : stats.status === 'at-risk' ? 'AT RISK' : 'PASSING'}
                                </Text>
                              </View>
                            </>
                          ) : (
                            <Text style={[styles.gradePercentText, { color: theme.textSecondary }]}>
                              Pending
                            </Text>
                          )}
                        </View>

                        {!isDesktop && (
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={theme.textSecondary}
                          />
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Failing Grade Academic Warning Box */}
                    {stats.isFailing && (
                      <View style={[styles.failingCardAlert, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
                        <View style={styles.failingCardAlertHeader}>
                          <Ionicons name="warning" size={17} color="#EF4444" />
                          <Text style={styles.failingCardAlertTitle}>
                            Failing Grade Detected ({stats.phScale.toFixed(2)} &gt; 3.00)
                          </Text>
                        </View>
                        <Text style={[styles.failingCardAlertDesc, { color: theme.textSecondary }]}>
                          Minimum passing requirement is 3.00 (75.0%). Your raw score is {stats.currentPercentage}%. An AI intervention plan has been prepared to help you recover.
                        </Text>
                        <TouchableOpacity
                          style={[styles.aiInterventionBtn, { backgroundColor: theme.primary }]}
                          onPress={() => setSelectedIntervention(stats)}
                        >
                          <Ionicons name="sparkles" size={15} color="#FFFFFF" />
                          <Text style={styles.aiInterventionBtnText}>View AI Academic Intervention</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Progress Bar */}
                    <View style={styles.progressBarWrap}>
                      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, stats.currentPercentage)}%`,
                              backgroundColor:
                                stats.isFailing
                                  ? '#EF4444'
                                  : stats.status === 'excellent'
                                  ? '#10B981'
                                  : theme.primary,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.progressFooter}>
                        <Text style={[styles.weightCoveredText, { color: theme.textSecondary }]}>
                          Course Weight Covered: {stats.earnedWeight}% / 100%
                        </Text>
                        <Text style={[styles.targetMarkerText, { color: theme.textSecondary }]}>
                          Target: {sub.target_grade ?? 90}%
                        </Text>
                      </View>
                    </View>

                    {/* Criteria Percentage Breakdown Badges + Edit Breakdown Button */}
                    <View style={[styles.categoryBreakdownRow, { backgroundColor: theme.cardAlt }]}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', gap: 10, paddingRight: 8 }}>
                          {stats.categoryStats.map((cat) => (
                            <View key={cat.category} style={styles.categoryPill}>
                              <Text style={[styles.catLabel, { color: theme.textSecondary }]}>
                                {cat.label} ({cat.weight}%)
                              </Text>
                              <Text
                                style={[
                                  styles.catValue,
                                  {
                                    color:
                                      cat.averagePercentage !== null
                                        ? cat.averagePercentage >= 75
                                          ? '#10B981'
                                          : '#EF4444'
                                        : theme.textTertiary,
                                  },
                                ]}
                              >
                                {cat.averagePercentage !== null ? `${cat.averagePercentage}%` : '—'}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                      <TouchableOpacity
                        style={[styles.breakdownEditBtn, { borderColor: theme.primary + '60' }]}
                        onPress={() => openCategoryModal(sub)}
                      >
                        <Ionicons name="options-outline" size={13} color={theme.primary} />
                        <Text style={[styles.breakdownEditBtnText, { color: theme.primary }]}>Edit</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Provisional Warning Badge */}
                    {stats.isProvisional && (
                      <View style={[styles.provisionalBadge, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                        <Ionicons name="information-circle-outline" size={14} color="#F59E0B" />
                        <Text style={styles.provisionalBadgeText}>
                          {stats.provisionalMessage || "Provisional grade — category weights don't add up to 100%"}
                        </Text>
                      </View>
                    )}

                    {/* Assessments Breakdown List (Accordion on mobile, always visible on desktop) */}
                    {isExpanded && (
                      <View style={[styles.assessmentsWrap, { borderTopColor: theme.border }]}>
                        <View style={styles.assessmentsTopRow}>
                          <Text style={[styles.assessmentsTitle, { color: theme.textSecondary }]}>
                            ASSESSMENTS & SCORES ({subAssessments.length})
                          </Text>
                          <TouchableOpacity
                            onPress={() => openAddAssessmentModal(sub.id)}
                            style={styles.addAssessmentInlineBtn}
                          >
                            <Ionicons name="add-circle-outline" size={15} color={theme.primary} />
                            <Text style={[styles.addAssessmentInlineText, { color: theme.primary }]}>Add</Text>
                          </TouchableOpacity>
                        </View>

                        {subAssessments.length === 0 ? (
                          <Text style={[styles.noAssessmentsText, { color: theme.textSecondary }]}>
                            No assessment scores recorded for this course yet.
                          </Text>
                        ) : (
                          subAssessments.map((item) => {
                            const cat =
                              ASSESSMENT_CATEGORIES.find((c) => c.id === item.category) ||
                              ASSESSMENT_CATEGORIES[0];
                            const itemPct =
                              item.total_items > 0
                                ? Math.round((item.raw_score / item.total_items) * 1000) / 10
                                : 0;

                            return (
                              <View
                                key={item.id}
                                style={[styles.assessmentRow, { borderColor: theme.border }]}
                              >
                                <View style={styles.assessmentLeft}>
                                  <View style={[styles.catIconWrap, { backgroundColor: cat.color + '15' }]}>
                                    <Ionicons name={cat.icon as any} size={15} color={cat.color} />
                                  </View>
                                  <View>
                                    <Text style={[styles.assessmentItemTitle, { color: theme.text }]}>
                                      {item.title}
                                    </Text>
                                    <Text style={[styles.assessmentItemMeta, { color: theme.textSecondary }]}>
                                      {item.custom_category || cat.label}
                                      {item.date ? ` • ${item.date}` : ''}
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.assessmentRight}>
                                  <View style={styles.scoreBox}>
                                    <Text style={[styles.rawScoreText, { color: theme.text }]}>
                                      {item.raw_score} / {item.total_items}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.itemPctText,
                                        { color: itemPct >= 75 ? '#10B981' : '#EF4444' },
                                      ]}
                                    >
                                      {itemPct}%
                                    </Text>
                                  </View>

                                  <View style={styles.actionIconsRow}>
                                    {/* Score Proof Badge or Attach Button */}
                                    {item.evidence_uri ? (
                                      <TouchableOpacity
                                        onPress={() => openProofModal(item)}
                                        style={[styles.proofBadgeBtn, { backgroundColor: '#10B98120', borderColor: '#10B98150' }]}
                                      >
                                        <Ionicons name="image-outline" size={13} color="#10B981" />
                                        <Text style={styles.proofBadgeText}>Proof</Text>
                                      </TouchableOpacity>
                                    ) : (
                                      <TouchableOpacity
                                        onPress={() =>
                                          router.push({
                                            pathname: '/scan-score-proof',
                                            params: { assessmentId: item.id, subjectId: item.subject_id, source: 'camera' },
                                          } as Href)
                                        }
                                        style={[styles.attachProofBtn, { borderColor: theme.border }]}
                                      >
                                        <Ionicons name="camera-outline" size={13} color={theme.textSecondary} />
                                        <Text style={[styles.attachProofText, { color: theme.textSecondary }]}>Proof</Text>
                                      </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                      onPress={() => openEditAssessmentModal(item)}
                                      style={styles.iconBtn}
                                    >
                                      <Ionicons name="pencil-outline" size={15} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => handleDeleteAssessment(item.id, item.title)}
                                      style={styles.iconBtn}
                                    >
                                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Quick Action FAB */}
      <FloatingQuickAction
        onAddAssessment={() => openAddAssessmentModal()}
        onAddCourse={() => setCourseModalVisible(true)}
        onScanScoreProof={() => router.push('/scan-score-proof' as Href)}
        onAddSchedule={() => router.push('/scan-schedule' as Href)}
        onSwitchPeriod={() => setPeriodModalVisible(true)}
      />

      {/* Academic Period Switcher Modal */}
      <AcademicPeriodModal visible={periodModalVisible} onClose={() => setPeriodModalVisible(false)} />

      {/* Add Course Modal */}
      <Modal visible={courseModalVisible} transparent animationType="slide" onRequestClose={() => setCourseModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCourseModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Course</Text>
              <TouchableOpacity onPress={() => setCourseModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>COURSE NAME *</Text>
              <TextInput
                value={newCourseName}
                onChangeText={setNewCourseName}
                placeholder="e.g. Data Structures & Algorithms"
                placeholderTextColor={theme.textSecondary}
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>COURSE CODE *</Text>
              <TextInput
                value={newCourseCode}
                onChangeText={setNewCourseCode}
                placeholder="e.g. CS 201"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              />

              <View style={[styles.twoColRow, { marginTop: 12 }]}>
                <View style={styles.col}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>PROFESSOR</Text>
                  <TextInput
                    value={newCourseProf}
                    onChangeText={setNewCourseProf}
                    placeholder="e.g. Dr. Santos"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ROOM</Text>
                  <TextInput
                    value={newCourseRoom}
                    onChangeText={setNewCourseRoom}
                    placeholder="e.g. Lab 3B"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>COURSE COLOR</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {theme.subjectColors.map((col) => (
                    <TouchableOpacity
                      key={col}
                      onPress={() => setNewCourseColor(col)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: col,
                        borderWidth: newCourseColor === col ? 3 : 1,
                        borderColor: newCourseColor === col ? '#FFFFFF' : 'transparent',
                      }}
                    />
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>
                GRADING WEIGHTS (%)
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>Exams</Text>
                  <TextInput
                    value={newCourseExamWeight}
                    onChangeText={setNewCourseExamWeight}
                    keyboardType="numeric"
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 2 }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>Quizzes</Text>
                  <TextInput
                    value={newCourseQuizWeight}
                    onChangeText={setNewCourseQuizWeight}
                    keyboardType="numeric"
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 2 }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>Activities</Text>
                  <TextInput
                    value={newCourseActivityWeight}
                    onChangeText={setNewCourseActivityWeight}
                    keyboardType="numeric"
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 2 }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>Attend.</Text>
                  <TextInput
                    value={newCourseAttendanceWeight}
                    onChangeText={setNewCourseAttendanceWeight}
                    keyboardType="numeric"
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 2 }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSaveCourse}
                style={[styles.modalSaveBtn, { backgroundColor: theme.primary, marginTop: 18 }]}
              >
                <Text style={styles.modalSaveBtnText}>Save Course</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add / Edit Assessment Score Modal */}
      <Modal visible={assessmentModalVisible} transparent animationType="fade" onRequestClose={() => setAssessmentModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssessmentModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingAssessment ? 'Edit Assessment Score' : 'Record Assessment / Grade'}
              </Text>
              <TouchableOpacity onPress={() => setAssessmentModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Select Subject */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>COURSE / SUBJECT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {subjects.map((s) => {
                  const isSel = formSubjectId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setFormSubjectId(s.id)}
                      style={[
                        styles.subjectChip,
                        {
                          backgroundColor: isSel ? s.color : theme.background,
                          borderColor: isSel ? s.color : theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.subjectChipText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Assessment Title */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 14 }]}>
                TITLE / DESCRIPTION
              </Text>
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="e.g. Midterm Exam, Quiz 3, Lab Report"
                placeholderTextColor={theme.textSecondary}
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              />

              {/* Category Picker */}
              {(() => {
                const selSub = subjects.find((s) => s.id === formSubjectId);
                let customCats: GradingCategory[] = [];
                if (selSub?.grading_categories) {
                  try {
                    const parsed = JSON.parse(selSub.grading_categories);
                    if (Array.isArray(parsed) && parsed.length > 0) customCats = parsed;
                  } catch {}
                }

                return (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                      <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 0 }]}>
                        {customCats.length > 0 ? 'COURSE GRADING CATEGORIES' : 'CATEGORY'}
                      </Text>
                      {selSub && (
                        <TouchableOpacity onPress={() => { setAssessmentModalVisible(false); openCategoryModal(selSub); }}>
                          <Text style={{ fontSize: 11, color: theme.primary, fontWeight: '600' }}>Customize Breakdown</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {customCats.length > 0 && (
                      <View style={[styles.categoriesRow, { marginBottom: 6 }]}>
                        {customCats.map((cc) => {
                          const isSel = formCustomCategory === cc.name;
                          return (
                            <TouchableOpacity
                              key={cc.id}
                              onPress={() => {
                                setFormCustomCategory(cc.name);
                                setFormWeight(String(cc.weight ?? 20));
                                const lower = cc.name.toLowerCase();
                                if (lower.includes('exam')) setFormCategory('exam');
                                else if (lower.includes('quiz')) setFormCategory('quiz');
                                else if (lower.includes('proj')) setFormCategory('project');
                                else if (lower.includes('lab') || lower.includes('activ')) setFormCategory('activity');
                                else if (lower.includes('attend')) setFormCategory('attendance');
                                else setFormCategory('other');
                              }}
                              style={[
                                styles.catPill,
                                {
                                  backgroundColor: isSel ? theme.primary : theme.background,
                                  borderColor: isSel ? theme.primary : theme.border,
                                },
                              ]}
                            >
                              <Text style={[styles.catPillText, { color: isSel ? '#FFFFFF' : theme.text, fontWeight: isSel ? '700' : '500' }]}>
                                {cc.name} ({cc.weight}%)
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: customCats.length > 0 ? 6 : 0, fontSize: 11 }]}>
                      STANDARD OR CUSTOM LABEL
                    </Text>
                    <View style={styles.categoriesRow}>
                      {ASSESSMENT_CATEGORIES.map((cat) => {
                        const isSel = !formCustomCategory && formCategory === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => {
                              setFormCategory(cat.id);
                              setFormCustomCategory('');
                            }}
                            style={[
                              styles.catPill,
                              {
                                backgroundColor: isSel ? cat.color : theme.background,
                                borderColor: isSel ? cat.color : theme.border,
                              },
                            ]}
                          >
                            <Text style={[styles.catPillText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TextInput
                      value={formCustomCategory}
                      onChangeText={setFormCustomCategory}
                      placeholder="Or enter custom category label (e.g. Practical Exam)"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, marginTop: 8, fontSize: 13 }]}
                    />
                  </>
                );
              })()}

              {/* Scores Inputs (Weight is determined by Course settings) */}
              <View style={styles.twoColRow}>
                <View style={styles.col}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>RAW SCORE</Text>
                  <TextInput
                    value={formRawScore}
                    onChangeText={setFormRawScore}
                    placeholder="e.g. 45"
                    keyboardType="numeric"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>

                <View style={styles.col}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>TOTAL ITEMS</Text>
                  <TextInput
                    value={formTotalItems}
                    onChangeText={setFormTotalItems}
                    placeholder="e.g. 50"
                    keyboardType="numeric"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  />
                </View>
              </View>

              {(() => {
                const r = parseFloat(formRawScore);
                const t = parseFloat(formTotalItems);
                if (!isNaN(r) && !isNaN(t) && t > 0) {
                  const pct = Math.round((r / t) * 1000) / 10;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: pct >= 75 ? '#10B981' : '#EF4444' }}>
                        Calculated: {pct}% {pct >= 75 ? '(Passing)' : '(Below Passing)'}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                        Weight applied from Course
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}

              {/* Date */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 14 }]}>DATE</Text>
              <TextInput
                value={formDate}
                onChangeText={setFormDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              />

              {/* Score Proof Attachment Section */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 14 }]}>
                SCORE PROOF / EVIDENCE (OPTIONAL)
              </Text>

              {/* Score suggestion confirmation banner */}
              {showSuggestion && suggestedRaw !== null && suggestedTotal !== null && (
                <View style={[styles.suggestionBanner, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '40' }]}>
                  <Ionicons name="bulb-outline" size={18} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.suggestionTitle, { color: theme.primary }]}>Score Detected</Text>
                    <Text style={[styles.suggestionBody, { color: theme.text }]}>
                      Raw: {suggestedRaw} / Total: {suggestedTotal}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setFormRawScore(String(suggestedRaw));
                      setFormTotalItems(String(suggestedTotal));
                      setShowSuggestion(false);
                    }}
                    style={[styles.suggestionApplyBtn, { backgroundColor: theme.primary }]}
                  >
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Apply</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowSuggestion(false)}>
                    <Ionicons name="close" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}

              {formEvidenceUri ? (
                <View style={[styles.proofAttachPreview, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <Image
                    source={{ uri: formEvidenceUri }}
                    style={styles.proofAttachThumb}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: theme.text, fontSize: 13, fontWeight: '600' }]} numberOfLines={1}>
                      Proof attached
                    </Text>
                    <Text style={[{ color: theme.textSecondary, fontSize: 11 }]}>
                      Tap to preview or replace
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      // Replace: open picker again
                      void (async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
                        if (!result.canceled && result.assets[0]) setFormEvidenceUri(result.assets[0].uri);
                      })();
                    }}
                  >
                    <Ionicons name="refresh-outline" size={20} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setFormEvidenceUri('')}>
                    <Ionicons name="trash-outline" size={20} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.proofPickerRow]}>
                  <TouchableOpacity
                    style={[styles.proofPickerBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => {
                      void (async () => {
                        const perm = await ImagePicker.requestCameraPermissionsAsync();
                        if (!perm.granted) { Alert.alert('Permission', 'Camera access is required.'); return; }
                        const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
                        if (!result.canceled && result.assets[0]) {
                          const uri = result.assets[0].uri;
                          setFormEvidenceUri(uri);
                        }
                      })();
                    }}
                  >
                    <Ionicons name="camera-outline" size={20} color={theme.primary} />
                    <Text style={[styles.proofPickerBtnText, { color: theme.text }]}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.proofPickerBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => {
                      void (async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
                        if (!result.canceled && result.assets[0]) {
                          setFormEvidenceUri(result.assets[0].uri);
                        }
                      })();
                    }}
                  >
                    <Ionicons name="image-outline" size={20} color={theme.primary} />
                    <Text style={[styles.proofPickerBtnText, { color: theme.text }]}>Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.proofPickerBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => router.push('/scan-score-proof' as Href)}
                  >
                    <Ionicons name="receipt-outline" size={20} color={theme.primary} />
                    <Text style={[styles.proofPickerBtnText, { color: theme.text }]}>Scan</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Notes */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 14 }]}>
                FEEDBACK / NOTES (OPTIONAL)
              </Text>
              <TextInput
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Notes on mistakes, topics reviewed, etc."
                placeholderTextColor={theme.textSecondary}
                style={[styles.modalInput, styles.notesInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                multiline
              />

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setAssessmentModalVisible(false)}
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => void handleSaveAssessment()}
                  style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.modalSaveBtnText}>
                    {editingAssessment ? 'Update Score' : 'Save Score'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================================================ */}
      {/* SCORE PROOF EVIDENCE MODAL                                      */}
      {/* ================================================================ */}
      <Modal
        visible={proofModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProofModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setProofModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="image-outline" size={20} color={theme.primary} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Score Proof</Text>
              </View>
              <TouchableOpacity onPress={() => setProofModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {activeProofItem?.evidence_uri ? (
                <Image
                  source={{ uri: activeProofItem.evidence_uri }}
                  style={styles.proofImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.proofImagePlaceholder, { borderColor: theme.border }]}>
                  <Ionicons name="image-outline" size={48} color={theme.textTertiary} />
                  <Text style={[styles.noProofText, { color: theme.textSecondary }]}>No proof image attached.</Text>
                </View>
              )}

              {activeProofItem && (
                <View style={[styles.proofMetaCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <Text style={[styles.proofMetaTitle, { color: theme.text }]}>{activeProofItem.title}</Text>
                  <Text style={[styles.proofMetaSub, { color: theme.textSecondary }]}>
                    Score: {activeProofItem.raw_score} / {activeProofItem.total_items} •{' '}
                    {activeProofItem.total_items > 0
                      ? `${Math.round((activeProofItem.raw_score / activeProofItem.total_items) * 1000) / 10}%`
                      : '—'}
                  </Text>
                </View>
              )}

              <View style={[styles.modalActions, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: '#EF444460' }]}
                  onPress={() => {
                    if (activeProofItem) {
                      void editAssessment(activeProofItem.id, { evidence_uri: '' });
                    }
                    setProofModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalCancelBtnText, { color: '#EF4444' }]}>Remove Proof</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    setProofModalVisible(false);
                    if (activeProofItem) {
                      router.push({
                        pathname: '/scan-score-proof',
                        params: { assessmentId: activeProofItem.id, subjectId: activeProofItem.subject_id, source: 'camera' },
                      } as Href);
                    }
                  }}
                >
                  <Text style={styles.modalSaveBtnText}>Replace Proof</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================================================ */}
      {/* CUSTOM GRADING BREAKDOWN MODAL                                   */}
      {/* ================================================================ */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pie-chart-outline" size={20} color={theme.primary} />
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Grading Breakdown</Text>
                  {categoryModalSubject && (
                    <Text style={[styles.modalSubTitle, { color: theme.textSecondary }]}>
                      {categoryModalSubject.code} – {categoryModalSubject.name}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Weight sum indicator */}
              {(() => {
                const total = editingCategories.reduce((s, c) => s + (c.weight ?? 0), 0);
                const isOk = Math.abs(total - 100) < 0.01;
                const isUnder = total < 100;
                const statusColor = isOk ? '#10B981' : isUnder ? '#F59E0B' : '#EF4444';
                return (
                  <>
                    <View
                      style={[
                        styles.weightSumBar,
                        { backgroundColor: statusColor + '18', borderColor: statusColor + '50' },
                      ]}
                    >
                      <Ionicons
                        name={isOk ? 'checkmark-circle-outline' : 'warning-outline'}
                        size={16}
                        color={statusColor}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: statusColor, flex: 1 }}>
                        Total: {total.toFixed(1)}% {isOk ? '✓ (100% Complete)' : isUnder ? `(${(100 - total).toFixed(1)}% unallocated — provisional)` : `(${(total - 100).toFixed(1)}% over 100%)`}
                      </Text>
                    </View>

                    {/* Quick Presets */}
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 6 }]}>
                        QUICK TEMPLATES (OPTIONAL)
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            onPress={() => setEditingCategories([
                              { id: 'exam', name: 'Major Examinations', weight: 40 },
                              { id: 'quiz', name: 'Written Quizzes', weight: 25 },
                              { id: 'activity', name: 'Class Activities & Projects', weight: 25 },
                              { id: 'attendance', name: 'Attendance', weight: 10 },
                            ])}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
                          >
                            <Text style={{ fontSize: 11, color: theme.text, fontWeight: '600' }}>College Standard (40/25/25/10)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setEditingCategories([
                              { id: 'written', name: 'Written Work', weight: 40 },
                              { id: 'performance', name: 'Performance Tasks', weight: 40 },
                              { id: 'quarterly', name: 'Quarterly Assessment', weight: 20 },
                            ])}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
                          >
                            <Text style={{ fontSize: 11, color: theme.text, fontWeight: '600' }}>DepEd High School (40/40/20)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setEditingCategories([
                              { id: 'lab', name: 'Laboratory Exercises', weight: 35 },
                              { id: 'exam', name: 'Major Exams', weight: 35 },
                              { id: 'quiz', name: 'Quizzes', weight: 15 },
                              { id: 'project', name: 'Projects', weight: 15 },
                            ])}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
                          >
                            <Text style={{ fontSize: 11, color: theme.text, fontWeight: '600' }}>Lab-Heavy (35/35/15/15)</Text>
                          </TouchableOpacity>
                        </View>
                      </ScrollView>
                    </View>
                  </>
                );
              })()}

              {/* Category rows */}
              {editingCategories.map((cat, idx) => (
                <View
                  key={cat.id + idx}
                  style={[styles.catEditRow, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={cat.name}
                      onChangeText={(v) => {
                        const next = [...editingCategories];
                        next[idx] = { ...next[idx], name: v };
                        setEditingCategories(next);
                      }}
                      style={[styles.catEditInput, { color: theme.text, borderColor: theme.border }]}
                      placeholder="Category name"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>
                  <View style={styles.catWeightWrap}>
                    <TextInput
                      value={String(cat.weight ?? '')}
                      onChangeText={(v) => {
                        const next = [...editingCategories];
                        next[idx] = { ...next[idx], weight: parseFloat(v) || 0 };
                        setEditingCategories(next);
                      }}
                      keyboardType="numeric"
                      style={[styles.catWeightInput, { color: theme.text, borderColor: theme.border }]}
                      placeholder="0"
                      placeholderTextColor={theme.textSecondary}
                    />
                    <Text style={[styles.catWeightPct, { color: theme.textSecondary }]}>%</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.catRemoveBtn}
                    onPress={() => setEditingCategories(editingCategories.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add new category */}
              <View style={[styles.catEditRow, { borderColor: theme.border, backgroundColor: theme.background, marginTop: 4 }]}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={newCatName}
                    onChangeText={setNewCatName}
                    style={[styles.catEditInput, { color: theme.text, borderColor: theme.border }]}
                    placeholder="New category name"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
                <View style={styles.catWeightWrap}>
                  <TextInput
                    value={newCatWeight}
                    onChangeText={setNewCatWeight}
                    keyboardType="numeric"
                    style={[styles.catWeightInput, { color: theme.text, borderColor: theme.border }]}
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <Text style={[styles.catWeightPct, { color: theme.textSecondary }]}>%</Text>
                </View>
                <TouchableOpacity
                  style={[styles.catAddBtn, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    if (!newCatName.trim()) return;
                    const id = newCatName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
                    setEditingCategories([
                      ...editingCategories,
                      { id, name: newCatName.trim(), weight: parseFloat(newCatWeight) || 0 },
                    ]);
                    setNewCatName('');
                    setNewCatWeight('');
                  }}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setCategoryModalVisible(false)}
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleSaveCategories()}
                  style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.modalSaveBtnText}>Save Breakdown</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* AI ACADEMIC INTERVENTION MODAL */}
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
                    {gradingMode === 'percentage'
                      ? `Below Passing: ${selectedIntervention?.currentPercentage}% (Passing mark: 75.0%)`
                      : `Failing Grade: ${selectedIntervention?.phScale.toFixed(2)} (Passing mark: 3.00)`}
                  </Text>
                  <Text style={[styles.modalAlertDesc, { color: theme.textSecondary }]}>
                    {gradingMode === 'percentage'
                      ? `Your current score is ${selectedIntervention?.currentPercentage}%. Grades below 75.0% are below the passing threshold.`
                      : `Your current score is ${selectedIntervention?.currentPercentage}%. Grades from 3.10 to 5.00 are failing under Philippine academic standards.`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  desktopContainer: {
    maxWidth: 1140,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  periodPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  desktopLayout: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
  },
  mobileLayout: {
    flexDirection: 'column',
    gap: 16,
  },
  desktopColLeft: {
    flex: 4,
    gap: 16,
  },
  desktopColRight: {
    flex: 6,
    gap: 16,
  },
  fullWidth: {
    width: '100%',
    gap: 16,
  },
  gpaHeroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  gpaHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  gpaLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  gpaNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  gpaNumber: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  gpaScaleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  standingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  standingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: '80%',
    alignSelf: 'center',
  },
  simulatorCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  simulatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  simIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  simTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  simSubtitle: {
    fontSize: 11,
  },
  simEmpty: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  simRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  simSubjectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  simSubjectCode: {
    fontSize: 13,
    fontWeight: '600',
  },
  simSubjectRight: {},
  simStatusDone: {
    fontSize: 12,
    fontWeight: '600',
  },
  simNeededText: {
    fontSize: 12,
  },
  subjectListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  addScoreTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  addScoreTopBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyBoxTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  emptyBoxDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  subjectCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  subjectHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  subjectColorBar: {
    width: 5,
    height: 38,
    borderRadius: 3,
  },
  codeCreditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectCode: {
    fontSize: 15,
    fontWeight: '700',
  },
  creditsPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creditsText: {
    fontSize: 11,
    fontWeight: '600',
  },
  subjectName: {
    fontSize: 12,
    marginTop: 2,
  },
  subjectHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gradeBadgeWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  gradePercentText: {
    fontSize: 15,
    fontWeight: '800',
  },
  letterGradePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  letterGradeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressBarWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  weightCoveredText: {
    fontSize: 11,
  },
  targetMarkerText: {
    fontSize: 11,
  },
  assessmentsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingTop: 12,
  },
  assessmentsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  assessmentsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  addAssessmentInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addAssessmentInlineText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noAssessmentsText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  assessmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  assessmentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  catIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assessmentItemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  assessmentItemMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  assessmentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreBox: {
    alignItems: 'flex-end',
  },
  rawScoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemPctText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  proofBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  proofBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  attachProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  attachProofText: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconBtn: {
    padding: 4,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 8,
  },
  subjectChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  notesInput: {
    height: 60,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  suggestionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  suggestionTitle: { fontSize: 12, fontWeight: '700' },
  suggestionBody: { fontSize: 13 },
  suggestionApplyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  proofPickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  proofPickerBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
  },
  proofPickerBtnText: { fontSize: 11, fontWeight: '600' },
  proofAttachPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    marginBottom: 4,
  },
  proofAttachThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  col: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    marginBottom: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Failing Banner & Alert styles
  failingGlobalBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  failingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  failingAlertIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failingBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EF4444',
  },
  failingBannerSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  interventionBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  interventionBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Scale headers in GPA Hero
  scaleHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  gpaVertDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 16,
    alignSelf: 'center',
  },

  // Subject Card failing & grade styles
  phGradeLarge: {
    fontSize: 18,
    fontWeight: '900',
  },
  phGradeSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  failingCardAlert: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  failingCardAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  failingCardAlertTitle: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  failingCardAlertDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  aiInterventionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  aiInterventionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Criteria breakdown on subject card
  categoryBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 10,
    gap: 8,
  },
  breakdownEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  breakdownEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  provisionalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  provisionalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    flex: 1,
  },
  categoryPill: {
    alignItems: 'center',
    minWidth: 60,
  },
  catLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  catValue: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },

  // AI Intervention Modal
  interventionModalCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '92%',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  interventionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  aiBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  interventionModalBody: {
    padding: 20,
  },
  modalAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  modalAlertTitle: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '800',
  },
  modalAlertDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  interventionSectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 6,
  },
  interventionTextCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  interventionParagraph: {
    fontSize: 13,
    lineHeight: 19,
  },
  targetScoreCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  targetScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  targetScoreValue: {
    fontSize: 28,
    fontWeight: '900',
  },
  targetScoreDesc: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  targetScoreSub: {
    fontSize: 11,
    marginTop: 3,
  },
  actionPlanList: {
    gap: 8,
    marginBottom: 18,
  },
  actionPlanItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepNumCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepContentText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  launchTutorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  launchTutorBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  // Score Proof Modal
  proofImage: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: '#0001',
  },
  proofImagePlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  noProofText: {
    fontSize: 13,
  },
  proofMetaCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  proofMetaTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  proofMetaSub: {
    fontSize: 12,
    marginTop: 2,
  },
  // Category Breakdown Modal
  weightSumBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  catEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  catEditInput: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  catWeightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  catWeightInput: {
    height: 36,
    width: 52,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  catWeightPct: {
    fontSize: 13,
    fontWeight: '700',
  },
  catRemoveBtn: {
    padding: 2,
  },
  catAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
