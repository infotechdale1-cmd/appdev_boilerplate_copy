import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { syncClassScheduleReminders } from '@/services/notifications';
import { useAuth } from './AuthContext';
import {
  getSubjects,
  addSubject,
  updateSubject as dbUpdateSubject,
  deleteSubject as dbDeleteSubject,
  getTasks,
  addTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  toggleTaskStatus as dbToggleTaskStatus,
  getSchedules,
  addSchedule,
  updateSchedule as dbUpdateSchedule,
  deleteSchedule as dbDeleteSchedule,
  getStudySessions,
  logStudySession,
  getNotifications,
  addNotification,
  markNotificationAsRead as dbMarkNotificationRead,
  clearNotifications as dbClearNotifications,
  getStudyGoals,
  updateStudyGoals as dbUpdateStudyGoals,
  getAcademicPeriods,
  getActiveAcademicPeriod,
  createAcademicPeriod as dbCreateAcademicPeriod,
  setActiveAcademicPeriod as dbSetActiveAcademicPeriod,
  deleteAcademicPeriod as dbDeleteAcademicPeriod,
  backfillPeriodData,
  getAssessments,
  addAssessment as dbAddAssessment,
  updateAssessment as dbUpdateAssessment,
  deleteAssessment as dbDeleteAssessment,
  cleanupLegacyDemoRecords,
  type Subject,
  type Task,
  type ScheduleItem,
  type StudySession,
  type AppNotification,
  type StudyGoals,
  type AcademicPeriod,
  type Assessment,
  type GradingCategory,
} from '@/db/studytrack';

export interface AIInterventionPlan {
  diagnosis: string;
  actionPlan: string[];
  targetScoreToPass: number;
  recommendedHours: number;
  promptForTutor: string;
}

export interface CategoryStat {
  id: string;
  category: string;
  label: string;
  weight: number;
  averagePercentage: number | null;
  itemsCount: number;
}

export interface SubjectGradeStats {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  earnedWeight: number; // total % weight recorded so far (e.g. 60%)
  currentPercentage: number; // calculated weighted score (0-100)
  letterGrade: string; // e.g., 'A', 'B+'
  gpaScale4: number; // 4.0 scale equivalent
  phScale: number; // 1.00 - 5.00 university scale equivalent or percentage (0 when unrated)
  targetGrade: number;
  passingGrade: number;
  credits: number;
  status: 'excellent' | 'passing' | 'at-risk' | 'failing';
  isFailing: boolean; // TRUE when failing thresholds are crossed
  failingAlertMessage: string | null;
  aiIntervention: AIInterventionPlan | null;
  remainingWeight: number; // 100 - earnedWeight
  neededPercentageForTarget: number | null; // what-if score needed on remaining weight
  categoryStats: CategoryStat[];
  isProvisional: boolean;
  provisionalMessage: string | null;
  totalWeightAllocated: number;
  gradingMode: 'college' | 'percentage';
}

interface StudyContextType {
  subjects: Subject[];
  tasks: Task[];
  schedules: ScheduleItem[];
  studySessions: StudySession[];
  notifications: AppNotification[];
  goals: StudyGoals | null;
  academicPeriods: AcademicPeriod[];
  activePeriod: AcademicPeriod | null;
  assessments: Assessment[];
  gradingMode: 'college' | 'percentage';
  setGradingMode: (mode: 'college' | 'percentage') => Promise<void>;
  isLoading: boolean;
  refreshData: () => Promise<void>;

  // Academic Period operations
  switchAcademicPeriod: (periodId: string) => Promise<void>;
  createPeriod: (semester: string, academicYear: string, isActive?: boolean) => Promise<AcademicPeriod>;
  removePeriod: (periodId: string) => Promise<void>;

  // Subject operations
  createSubject: (data: Omit<Parameters<typeof addSubject>[0], 'user_id'>) => Promise<Subject>;
  editSubject: (id: string, data: Parameters<typeof dbUpdateSubject>[2]) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;

  // Task operations
  createTask: (data: Omit<Parameters<typeof addTask>[0], 'user_id'>) => Promise<Task>;
  editTask: (id: string, data: Parameters<typeof dbUpdateTask>[2]) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;

  // Assessment & Grade operations
  createAssessment: (data: Omit<Parameters<typeof dbAddAssessment>[0], 'user_id'>) => Promise<Assessment>;
  editAssessment: (id: string, data: Parameters<typeof dbUpdateAssessment>[2]) => Promise<void>;
  removeAssessment: (id: string) => Promise<void>;
  getSubjectAssessments: (subjectId: string) => Assessment[];
  getSubjectGradeStats: (subjectId: string) => SubjectGradeStats;

  // Schedule operations
  createSchedule: (data: Omit<Parameters<typeof addSchedule>[0], 'user_id'>) => Promise<ScheduleItem>;
  editSchedule: (id: string, data: Parameters<typeof dbUpdateSchedule>[2]) => Promise<void>;
  removeSchedule: (id: string) => Promise<void>;

  // Study timer & sessions
  recordFocusSession: (durationSeconds: number, subjectId?: string, notes?: string) => Promise<StudySession>;

  // Notifications
  markNotificationRead: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  sendReminderNotification: (title: string, message: string, type?: AppNotification['type']) => Promise<void>;

  // Goals
  updateGoals: (data: Partial<Omit<StudyGoals, 'user_id'>>) => Promise<void>;

  // Computed properties
  completedCount: number;
  pendingCount: number;
  urgentTasks: Task[];
  todaySchedules: ScheduleItem[];
  weeklyHoursStudied: number;
  progressPercentage: number;
  unreadNotificationsCount: number;
  semesterGPA: number;
  semesterGWA: number;
  semesterAveragePercentage: number;
  totalEnrolledCredits: number;
  passingSubjectsCount: number;
  atRiskSubjectsCount: number;
  failingSubjects: SubjectGradeStats[];
}

const StudyContext = createContext<StudyContextType | undefined>(undefined);

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [goals, setGoals] = useState<StudyGoals | null>(null);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);
  const [activePeriod, setActivePeriodState] = useState<AcademicPeriod | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [schedulesLoadedFor, setSchedulesLoadedFor] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    if (!currentUser) {
      setSubjects([]);
      setTasks([]);
      setSchedules([]);
      setStudySessions([]);
      setNotifications([]);
      setGoals(null);
      setAcademicPeriods([]);
      setActivePeriodState(null);
      setAssessments([]);
      return;
    }

    setIsLoading(true);
    try {
      await cleanupLegacyDemoRecords(currentUser.id);
      let periods = await getAcademicPeriods(currentUser.id);
      let activeP = await getActiveAcademicPeriod(currentUser.id);

      // If periods exist but none is marked active, activate the first one
      if (periods.length > 0 && !activeP) {
        await dbSetActiveAcademicPeriod(currentUser.id, periods[0].id);
        activeP = { ...periods[0], is_active: 1 };
        periods = periods.map((p, idx) => ({ ...p, is_active: idx === 0 ? 1 : 0 }));
      }

      setAcademicPeriods(periods);
      setActivePeriodState(activeP);
      if (activeP) {
        await backfillPeriodData(currentUser.id, activeP.id);
      }

      const [sessions, notifs, gls] = await Promise.all([
        getStudySessions(currentUser.id, activeP?.id),
        getNotifications(currentUser.id),
        getStudyGoals(currentUser.id),
      ]);
      setStudySessions(sessions);
      setNotifications(notifs);
      setGoals(gls);

      if (!activeP) {
        setSubjects([]);
        setTasks([]);
        setSchedules([]);
        setAssessments([]);
      } else {
        const [subs, ts, scs, allAssessments] = await Promise.all([
          getSubjects(currentUser.id, activeP.id),
          getTasks(currentUser.id, activeP.id),
          getSchedules(currentUser.id, activeP.id),
          getAssessments(currentUser.id, undefined, activeP.id),
        ]);
        setSubjects(subs);
        setTasks(ts);
        setSchedules(scs);
        setAssessments(allAssessments);
      }
    } catch (err) {
      console.error('Failed to load study data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    let isMounted = true;
    if (!currentUser) {
      queueMicrotask(() => {
        if (!isMounted) return;
        setSubjects([]);
        setTasks([]);
        setSchedules([]);
        setStudySessions([]);
        setNotifications([]);
        setGoals(null);
        setAcademicPeriods([]);
        setActivePeriodState(null);
        setAssessments([]);
      });
      return;
    }

    cleanupLegacyDemoRecords(currentUser.id).finally(async () => {
      try {
        let periods = await getAcademicPeriods(currentUser.id);
        let activeP = await getActiveAcademicPeriod(currentUser.id);

        if (periods.length > 0 && !activeP) {
          await dbSetActiveAcademicPeriod(currentUser.id, periods[0].id);
          activeP = { ...periods[0], is_active: 1 };
          periods = periods.map((p, idx) => ({ ...p, is_active: idx === 0 ? 1 : 0 }));
        }

        if (!isMounted) return;
        setAcademicPeriods(periods);
        setActivePeriodState(activeP);
        if (activeP) {
          await backfillPeriodData(currentUser.id, activeP.id);
        }

        const [sessions, notifs, gls] = await Promise.all([
          getStudySessions(currentUser.id, activeP?.id),
          getNotifications(currentUser.id),
          getStudyGoals(currentUser.id),
        ]);
        if (!isMounted) return;
        setStudySessions(sessions);
        setNotifications(notifs);
        setGoals(gls);

        if (!activeP) {
          setSubjects([]);
          setTasks([]);
          setSchedules([]);
          setAssessments([]);
        } else {
          const [subs, ts, scs, allAssessments] = await Promise.all([
            getSubjects(currentUser.id, activeP.id),
            getTasks(currentUser.id, activeP.id),
            getSchedules(currentUser.id, activeP.id),
            getAssessments(currentUser.id, undefined, activeP.id),
          ]);
          if (!isMounted) return;
          setSubjects(subs);
          setTasks(ts);
          setSchedules(scs);
          setAssessments(allAssessments);
        }
        if (isMounted) setSchedulesLoadedFor(currentUser.id);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      void syncClassScheduleReminders([], false).catch((error: unknown) => {
        console.error('[Notifications] Unable to clear signed-out class reminders:', error);
      });
      return;
    }
    if (!goals || schedulesLoadedFor !== currentUser.id) return;
    void syncClassScheduleReminders(schedules, Boolean(goals.notifications_enabled)).catch((error: unknown) => {
      console.error('[Notifications] Unable to sync class reminders:', error);
    });
  }, [currentUser, goals?.notifications_enabled, schedules, schedulesLoadedFor]);

  // Academic Period actions
  const switchAcademicPeriod = async (periodId: string) => {
    if (!currentUser) return;
    await dbSetActiveAcademicPeriod(currentUser.id, periodId);
    const targetPeriod = academicPeriods.find((p) => p.id === periodId) || null;
    setActivePeriodState(targetPeriod);
    setAcademicPeriods((prev) =>
      prev.map((p) => ({ ...p, is_active: p.id === periodId ? 1 : 0 }))
    );

    const [subs, ts, scs, allAssessments, sessions] = await Promise.all([
      getSubjects(currentUser.id, periodId),
      getTasks(currentUser.id, periodId),
      getSchedules(currentUser.id, periodId),
      getAssessments(currentUser.id, undefined, periodId),
      getStudySessions(currentUser.id, periodId),
    ]);
    setSubjects(subs);
    setTasks(ts);
    setSchedules(scs);
    setAssessments(allAssessments);
    setStudySessions(sessions);
  };

  const createPeriod = async (semester: string, academicYear: string, isActive = true) => {
    if (!currentUser) throw new Error('Not authenticated');
    const created = await dbCreateAcademicPeriod({
      user_id: currentUser.id,
      semester,
      academic_year: academicYear,
      is_active: isActive,
    });
    setAcademicPeriods((prev) => [
      created,
      ...(isActive ? prev.map((p) => ({ ...p, is_active: 0 })) : prev),
    ]);
    if (isActive) {
      setActivePeriodState(created);
      setSubjects([]);
      setTasks([]);
      setSchedules([]);
      setAssessments([]);
      setStudySessions([]);
    }
    return created;
  };

  const removePeriod = async (periodId: string) => {
    if (!currentUser) return;
    await dbDeleteAcademicPeriod(currentUser.id, periodId);
    setAcademicPeriods((prev) => prev.filter((p) => p.id !== periodId));
    if (activePeriod?.id === periodId) {
      const remaining = academicPeriods.filter((p) => p.id !== periodId);
      if (remaining.length > 0) {
        await switchAcademicPeriod(remaining[0].id);
      } else {
        setActivePeriodState(null);
        setSubjects([]);
        setTasks([]);
        setSchedules([]);
        setAssessments([]);
        setStudySessions([]);
      }
    }
  };

  // Subject actions
  const createSubject = async (data: Omit<Parameters<typeof addSubject>[0], 'user_id'>) => {
    if (!currentUser) throw new Error('Not authenticated');
    const created = await addSubject({
      ...data,
      user_id: currentUser.id,
      period_id: data.period_id || activePeriod?.id || '',
    });
    setSubjects((prev) => [...prev, created]);
    return created;
  };

  const editSubject = async (id: string, data: Parameters<typeof dbUpdateSubject>[2]) => {
    if (!currentUser) return;
    await dbUpdateSubject(id, currentUser.id, data);
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const removeSubject = async (id: string) => {
    if (!currentUser) return;
    await dbDeleteSubject(id, currentUser.id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setAssessments((prev) => prev.filter((a) => a.subject_id !== id));
    setTasks((prev) => prev.filter((t) => t.subject_id !== id));
    setSchedules((prev) => prev.filter((sc) => sc.subject_id !== id));
  };

  // Task actions
  const createTask = async (data: Omit<Parameters<typeof addTask>[0], 'user_id'>) => {
    if (!currentUser) throw new Error('Not authenticated');
    const created = await addTask({
      ...data,
      user_id: currentUser.id,
      period_id: data.period_id || activePeriod?.id || '',
    });
    setTasks((prev) => [created, ...prev]);

    if (created.priority === 'high') {
      void addNotification({
        user_id: currentUser.id,
        title: 'New High Priority Task ⚡',
        message: `"${created.title}" has been added with due date ${created.due_date}.`,
        type: 'deadline',
      }).then((notif) => setNotifications((prev) => [notif, ...prev]));
    }

    return created;
  };

  const editTask = async (id: string, data: Parameters<typeof dbUpdateTask>[2]) => {
    if (!currentUser) return;
    await dbUpdateTask(id, currentUser.id, data);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
  };

  const toggleTask = async (id: string) => {
    if (!currentUser) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const nextStatus = await dbToggleTaskStatus(id, currentUser.id, task.status);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: nextStatus,
              completed_at: nextStatus === 'completed' ? Date.now() : null,
            }
          : t
      )
    );

    if (nextStatus === 'completed') {
      void addNotification({
        user_id: currentUser.id,
        title: 'Task Completed! 🎉',
        message: `Great job finishing "${task.title}"! Keep up the momentum.`,
        type: 'achievement',
      }).then((notif) => setNotifications((prev) => [notif, ...prev]));
    }
  };

  const removeTask = async (id: string) => {
    if (!currentUser) return;
    await dbDeleteTask(id, currentUser.id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // Assessment actions
  const createAssessment = async (data: Omit<Parameters<typeof dbAddAssessment>[0], 'user_id'>) => {
    if (!currentUser) throw new Error('Not authenticated');
    const created = await dbAddAssessment({
      ...data,
      user_id: currentUser.id,
      period_id: data.period_id || activePeriod?.id || '',
    });
    setAssessments((prev) => [...prev, created]);
    return created;
  };

  const editAssessment = async (id: string, data: Parameters<typeof dbUpdateAssessment>[2]) => {
    if (!currentUser) return;
    await dbUpdateAssessment(id, currentUser.id, data);
    setAssessments((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
  };

  const removeAssessment = async (id: string) => {
    if (!currentUser) return;
    await dbDeleteAssessment(id, currentUser.id);
    setAssessments((prev) => prev.filter((a) => a.id !== id));
  };

  const getSubjectAssessments = useCallback(
    (subjectId: string) => assessments.filter((a) => a.subject_id === subjectId),
    [assessments]
  );

  const gradingMode: 'college' | 'percentage' = goals?.grading_mode === 'percentage' ? 'percentage' : 'college';
  const setGradingMode = async (mode: 'college' | 'percentage') => {
    await updateGoals({ grading_mode: mode });
  };

  const getSubjectGradeStats = useCallback(
    (subjectId: string): SubjectGradeStats => {
      const subject = subjects.find((s) => s.id === subjectId);
      const subAssessments = assessments.filter((a) => a.subject_id === subjectId);
      const credits = subject?.credits ?? 3.0;
      const targetGrade = subject?.target_grade ?? 90.0;
      const passingGrade = subject?.passing_grade ?? 75.0;

      // Parse custom grading categories or fall back to default subject weights
      let categories: GradingCategory[] = [];
      if (subject?.grading_categories) {
        try {
          const parsed = JSON.parse(subject.grading_categories);
          if (Array.isArray(parsed) && parsed.length > 0) {
            categories = parsed;
          }
        } catch {
          categories = [];
        }
      }

      if (categories.length === 0) {
        categories = [
          { id: 'exam', name: 'Major Exams', weight: subject?.exam_weight ?? 40.0 },
          { id: 'quiz', name: 'Quizzes', weight: subject?.quiz_weight ?? 25.0 },
          { id: 'activity', name: 'Activities & Projects', weight: subject?.activity_weight ?? 25.0 },
          { id: 'attendance', name: 'Attendance', weight: subject?.attendance_weight ?? 10.0 },
        ];
      }

      const totalWeightAllocated = Math.round(categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0));
      const isProvisional = totalWeightAllocated !== 100;
      const provisionalMessage = isProvisional
        ? `Weights total ${totalWeightAllocated}% (${
            100 - totalWeightAllocated > 0
              ? `${100 - totalWeightAllocated}% unallocated`
              : `${totalWeightAllocated - 100}% over`
          } — grades are provisional)`
        : null;

      // Group and calculate average for each category
      const categoryStats: CategoryStat[] = categories.map((cat) => {
        const catAssessments = subAssessments.filter((a) => {
          if (a.custom_category) {
            const cc = a.custom_category.trim().toLowerCase();
            return cc === cat.name.trim().toLowerCase() || cc === cat.id.toLowerCase();
          }
          const catId = cat.id.toLowerCase();
          const catName = cat.name.toLowerCase();
          const aCat = a.category.toLowerCase();
          if (catId === 'activity' || catName.includes('activ') || catName.includes('proj')) {
            return (
              aCat === 'assignment' ||
              aCat === 'project' ||
              aCat === 'recitation' ||
              aCat === 'activity' ||
              aCat === 'other' ||
              catName === aCat
            );
          }
          return aCat === catId || catName.includes(aCat);
        });

        let avg: number | null = null;
        if (catAssessments.length > 0) {
          let sum = 0;
          for (const item of catAssessments) {
            const tot = item.total_items > 0 ? item.total_items : 100;
            sum += Math.max(0, Math.min(100, (item.raw_score / tot) * 100));
          }
          avg = Math.round((sum / catAssessments.length) * 10) / 10;
        }

        return {
          id: cat.id,
          category: cat.id,
          label: cat.name,
          weight: Number(cat.weight) || 0,
          averagePercentage: avg,
          itemsCount: catAssessments.length,
        };
      });

      // Calculate earned active category weights and contribution
      let activeWeightSum = 0;
      let weightedPointsSum = 0;

      for (const cs of categoryStats) {
        if (cs.averagePercentage !== null) {
          activeWeightSum += cs.weight;
          weightedPointsSum += cs.averagePercentage * (cs.weight / 100);
        }
      }

      const earnedWeight = activeWeightSum;
      let currentPercentage = 0;
      if (activeWeightSum > 0) {
        currentPercentage = Math.round((weightedPointsSum / (activeWeightSum / 100)) * 10) / 10;
      }

      const remainingWeight = Math.max(0, 100 - earnedWeight);
      let neededPercentageForTarget: number | null = null;
      if (remainingWeight > 0) {
        const pointsNeeded = targetGrade - weightedPointsSum;
        const needed = Math.round((pointsNeeded / (remainingWeight / 100)) * 10) / 10;
        neededPercentageForTarget = Math.max(0, Math.min(100, needed));
      }

      let letterGrade = 'N/A';
      let gpaScale4 = 0.0;
      let phScale = 0.0;

      if (earnedWeight === 0) {
        letterGrade = 'N/A';
        gpaScale4 = 0.0;
        phScale = 0.0; // 0 denotes no assessments / unrated
      } else if (gradingMode === 'college') {
        // Philippine College Numerical Scale Formula: G = -4(R/T) + 5
        // Where R/T is currentPercentage / 100
        const rawG = -4 * (currentPercentage / 100) + 5;
        phScale = Math.min(5.0, Math.max(1.0, Math.round(rawG * 100) / 100));

        if (phScale <= 1.15) letterGrade = 'A+';
        else if (phScale <= 1.40) letterGrade = 'A';
        else if (phScale <= 1.65) letterGrade = 'A-';
        else if (phScale <= 1.90) letterGrade = 'B+';
        else if (phScale <= 2.15) letterGrade = 'B';
        else if (phScale <= 2.40) letterGrade = 'B-';
        else if (phScale <= 2.65) letterGrade = 'C+';
        else if (phScale <= 2.90) letterGrade = 'C';
        else if (phScale <= 3.00) letterGrade = 'C-';
        else if (phScale <= 4.00) letterGrade = 'D';
        else letterGrade = 'F';

        gpaScale4 = phScale <= 3.0 ? Math.max(1.0, Math.round((4.0 - (phScale - 1.0) * 1.5) * 10) / 10) : 0.0;
      } else {
        // Elementary / High School Percentage Mode: (R/T) * 100
        phScale = currentPercentage;

        if (currentPercentage >= 97) letterGrade = 'A+';
        else if (currentPercentage >= 93) letterGrade = 'A';
        else if (currentPercentage >= 90) letterGrade = 'A-';
        else if (currentPercentage >= 87) letterGrade = 'B+';
        else if (currentPercentage >= 83) letterGrade = 'B';
        else if (currentPercentage >= 80) letterGrade = 'B-';
        else if (currentPercentage >= 77) letterGrade = 'C+';
        else if (currentPercentage >= 75) letterGrade = 'C';
        else if (currentPercentage >= 70) letterGrade = 'D';
        else letterGrade = 'F';

        gpaScale4 = currentPercentage >= 75 ? Math.round((currentPercentage / 25) * 10) / 10 : 0.0;
      }

      // Failing status:
      // In College mode: 3.00 is passing, 3.10 - 5.00 is failing.
      // In Percentage mode: 75% or higher is passing, below 75% is failing.
      const isFailing =
        earnedWeight > 0 &&
        (gradingMode === 'college' ? phScale > 3.0 : currentPercentage < 75.0);

      let status: 'excellent' | 'passing' | 'at-risk' | 'failing' = 'passing';
      if (earnedWeight === 0) {
        status = 'passing';
      } else if (isFailing) {
        status = 'failing';
      } else if (currentPercentage >= targetGrade) {
        status = 'excellent';
      } else if (currentPercentage >= passingGrade) {
        status = 'passing';
      } else {
        status = 'at-risk';
      }

      const failingAlertMessage = isFailing
        ? gradingMode === 'college'
          ? `Academic Alert: Current grade is ${phScale.toFixed(2)} (Failing). Minimum passing requirement is 3.00.`
          : `Academic Alert: Current grade is ${currentPercentage.toFixed(1)}% (Failing). Minimum passing requirement is 75.0%.`
        : null;

      let aiIntervention: AIInterventionPlan | null = null;
      if (isFailing) {
        const weakCategories = categoryStats
          .filter((c) => c.averagePercentage !== null && c.averagePercentage < 75)
          .map((c) => `${c.label} (${c.averagePercentage}%, ${c.weight}% weight)`);
        const weakSummary = weakCategories.length > 0 ? weakCategories.join(', ') : 'recent assessments';

        const pointsNeededForPass = Math.max(0, 75.0 - weightedPointsSum);
        const scoreNeededOnRemaining =
          remainingWeight > 0
            ? Math.min(100, Math.round((pointsNeededForPass / (remainingWeight / 100)) * 10) / 10)
            : 100;

        aiIntervention = {
          diagnosis: `Failing Grade Warning in ${subject?.name || 'this course'} (${subject?.code || ''}). Current grade is ${
            gradingMode === 'college' ? phScale.toFixed(2) : `${currentPercentage}%`
          }. Passing threshold is ${gradingMode === 'college' ? '3.00' : '75.0%'}. Weakest areas: ${weakSummary}. Course completion is currently at ${earnedWeight}%.`,
          actionPlan: [
            `Target Recovery Score: You must achieve at least ${scoreNeededOnRemaining}% on all remaining assessments (${remainingWeight}% of total course weight) to recover to passing status.`,
            `Critical Weakness Intervention: Focus immediately on remediating ${weakSummary}. Review past test errors and class notes.`,
            `Structured Study Routine: Schedule dedicated study sessions with the Pomodoro focus timer.`,
            `AI Tutor Interactive Drill: Tap 'Consult AI Tutor' to practice difficult topics and receive worked explanations.`,
          ],
          targetScoreToPass: scoreNeededOnRemaining,
          recommendedHours: 5.5,
          promptForTutor: `ACADEMIC INTERVENTION: I am failing ${subject?.name || 'this course'} (${subject?.code || ''}) with a grade of ${
            gradingMode === 'college' ? phScale.toFixed(2) : `${currentPercentage}%`
          }. My raw average is ${currentPercentage}%, and my weakest performance is in ${weakSummary}. Please act as my academic tutor: diagnose my core weaknesses, generate 3 practice problems with worked step-by-step explanations, and give me a 5-day recovery study plan to pass this course.`,
        };
      }

      return {
        subjectId,
        subjectName: subject?.name || 'Course',
        subjectCode: subject?.code || '',
        earnedWeight,
        currentPercentage,
        letterGrade,
        gpaScale4,
        phScale,
        targetGrade,
        passingGrade,
        credits,
        status,
        isFailing,
        failingAlertMessage,
        aiIntervention,
        remainingWeight,
        neededPercentageForTarget,
        categoryStats,
        isProvisional,
        provisionalMessage,
        totalWeightAllocated,
        gradingMode,
      };
    },
    [assessments, subjects, gradingMode]
  );

  // Schedule actions
  const createSchedule = async (data: Omit<Parameters<typeof addSchedule>[0], 'user_id'>) => {
    if (!currentUser) throw new Error('Not authenticated');
    const created = await addSchedule({
      ...data,
      user_id: currentUser.id,
      period_id: data.period_id || activePeriod?.id || '',
    });
    setSchedules((prev) => [...prev, created]);
    return created;
  };

  const editSchedule = async (id: string, data: Parameters<typeof dbUpdateSchedule>[2]) => {
    if (!currentUser) return;
    await dbUpdateSchedule(id, currentUser.id, data);
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const removeSchedule = async (id: string) => {
    if (!currentUser) return;
    await dbDeleteSchedule(id, currentUser.id);
    setSchedules((prev) => prev.filter((sc) => sc.id !== id));
  };

  // Study timer & sessions
  const recordFocusSession = async (durationSeconds: number, subjectId?: string, notes?: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    const todayStr = new Date().toISOString().split('T')[0];
    const session = await logStudySession({
      user_id: currentUser.id,
      subject_id: subjectId,
      period_id: activePeriod?.id,
      duration_seconds: durationSeconds,
      session_date: todayStr,
      notes,
    });
    setStudySessions((prev) => [session, ...prev]);
    return session;
  };

  // Notifications
  const markNotificationRead = async (id: string) => {
    if (!currentUser) return;
    await dbMarkNotificationRead(id, currentUser.id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
  };

  const clearAllNotifications = async () => {
    if (!currentUser) return;
    await dbClearNotifications(currentUser.id);
    setNotifications([]);
  };

  const sendReminderNotification = async (title: string, message: string, type: AppNotification['type'] = 'system') => {
    if (!currentUser) return;
    const notif = await addNotification({
      user_id: currentUser.id,
      title,
      message,
      type,
    });
    setNotifications((prev) => [notif, ...prev]);
  };

  // Goals
  const updateGoals = async (data: Partial<Omit<StudyGoals, 'user_id'>>) => {
    if (!currentUser) return;
    await dbUpdateStudyGoals(currentUser.id, data);
    setGoals((prev) => (prev ? { ...prev, ...data } : null));
  };

  const [currentTimestamp] = useState(() => Date.now());

  // Computed properties
  const completedCount = useMemo(() => tasks.filter((t) => t.status === 'completed').length, [tasks]);
  const pendingCount = useMemo(() => tasks.filter((t) => t.status === 'pending').length, [tasks]);

  const urgentTasks = useMemo(() => {
    const dayAfterTomorrow = new Date(currentTimestamp + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return tasks.filter(
      (t) => t.status === 'pending' && t.due_date <= dayAfterTomorrow
    );
  }, [tasks, currentTimestamp]);

  const todaySchedules = useMemo(() => {
    const dayOfWeek = new Date(currentTimestamp).getDay(); // 0 is Sunday
    return schedules
      .filter((sc) => sc.day_of_week === dayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, currentTimestamp]);

  const weeklyHoursStudied = useMemo(() => {
    const oneWeekAgo = currentTimestamp - 7 * 24 * 60 * 60 * 1000;
    const totalSeconds = studySessions
      .filter((s) => s.created_at >= oneWeekAgo)
      .reduce((sum, s) => sum + s.duration_seconds, 0);
    return Math.round((totalSeconds / 3600) * 10) / 10;
  }, [studySessions, currentTimestamp]);

  const progressPercentage = useMemo(() => {
    const target = goals?.weekly_hours_target || 15.0;
    if (target <= 0) return 0;
    const pct = Math.min(100, Math.round((weeklyHoursStudied / target) * 100));
    return isNaN(pct) ? 0 : pct;
  }, [weeklyHoursStudied, goals]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => n.is_read === 0).length,
    [notifications]
  );

  // Overall Academic & Grade calculations
  const totalEnrolledCredits = useMemo(
    () => subjects.reduce((sum, s) => sum + (s.credits ?? 3.0), 0),
    [subjects]
  );

  const {
    semesterGPA,
    semesterGWA,
    semesterAveragePercentage,
    passingSubjectsCount,
    atRiskSubjectsCount,
    failingSubjects,
  } = useMemo(() => {
    if (subjects.length === 0 || totalEnrolledCredits === 0) {
      return {
        semesterGPA: 0,
        semesterGWA: 0,
        semesterAveragePercentage: 0,
        passingSubjectsCount: 0,
        atRiskSubjectsCount: 0,
        failingSubjects: [],
      };
    }

    let totalWeightedScore = 0;
    let totalWeightedGPA = 0;
    let totalWeightedGWA = 0;
    let gradedCredits = 0;
    let passingCount = 0;
    let atRiskCount = 0;
    const failingList: SubjectGradeStats[] = [];

    for (const sub of subjects) {
      const stats = getSubjectGradeStats(sub.id);
      const credits = sub.credits ?? 3.0;

      if (stats.earnedWeight > 0) {
        totalWeightedScore += stats.currentPercentage * credits;
        totalWeightedGPA += stats.gpaScale4 * credits;
        totalWeightedGWA += stats.phScale * credits;
        gradedCredits += credits;

        if (stats.isFailing) {
          failingList.push(stats);
          atRiskCount++;
        } else if (stats.status === 'at-risk') {
          atRiskCount++;
        } else {
          passingCount++;
        }
      }
    }

    if (gradedCredits === 0) {
      return {
        semesterGPA: 0,
        semesterGWA: 0,
        semesterAveragePercentage: 0,
        passingSubjectsCount: 0,
        atRiskSubjectsCount: 0,
        failingSubjects: [],
      };
    }

    const gpa = Math.round((totalWeightedGPA / gradedCredits) * 100) / 100;
    const gwa = Math.round((totalWeightedGWA / gradedCredits) * 100) / 100;
    const avgPct = Math.round((totalWeightedScore / gradedCredits) * 10) / 10;

    return {
      semesterGPA: isNaN(gpa) ? 0 : gpa,
      semesterGWA: isNaN(gwa) ? 0 : gwa,
      semesterAveragePercentage: isNaN(avgPct) ? 0 : avgPct,
      passingSubjectsCount: passingCount,
      atRiskSubjectsCount: atRiskCount,
      failingSubjects: failingList,
    };
  }, [subjects, totalEnrolledCredits, getSubjectGradeStats]);

  return (
    <StudyContext.Provider
      value={{
        subjects,
        tasks,
        schedules,
        studySessions,
        notifications,
        goals,
        academicPeriods,
        activePeriod,
        assessments,
        gradingMode,
        setGradingMode,
        isLoading,
        refreshData: loadAllData,
        switchAcademicPeriod,
        createPeriod,
        removePeriod,
        createSubject,
        editSubject,
        removeSubject,
        createTask,
        editTask,
        toggleTask,
        removeTask,
        createAssessment,
        editAssessment,
        removeAssessment,
        getSubjectAssessments,
        getSubjectGradeStats,
        createSchedule,
        editSchedule,
        removeSchedule,
        recordFocusSession,
        markNotificationRead,
        clearAllNotifications,
        sendReminderNotification,
        updateGoals,
        completedCount,
        pendingCount,
        urgentTasks,
        todaySchedules,
        weeklyHoursStudied,
        progressPercentage,
        unreadNotificationsCount,
        semesterGPA,
        semesterGWA,
        semesterAveragePercentage,
        totalEnrolledCredits,
        passingSubjectsCount,
        atRiskSubjectsCount,
        failingSubjects,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy(): StudyContextType {
  const context = useContext(StudyContext);
  if (!context) {
    throw new Error('useStudy must be used within a StudyProvider');
  }
  return context;
}
