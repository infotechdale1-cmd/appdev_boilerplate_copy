import { getDb, newId } from './client';

export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  password_hash: string;
  major: string;
  institution: string;
  avatar_color: string;
  created_at: number;
}

export interface GradingCategory {
  id: string;
  name: string;
  weight: number; // e.g. 25 for 25%
}

export interface Subject {
  id: string;
  user_id: string;
  name: string;
  code: string;
  color: string;
  professor?: string;
  room?: string;
  notes?: string;
  period_id?: string;
  credits?: number; // credit units (e.g., 3.0)
  target_grade?: number; // target percentage (e.g., 90.0)
  passing_grade?: number; // minimum passing percentage (e.g., 75.0)
  quiz_weight?: number; // percentage (e.g. 20)
  exam_weight?: number; // percentage (e.g. 40)
  attendance_weight?: number; // percentage (e.g. 10)
  activity_weight?: number; // percentage (e.g. 30)
  grading_categories?: string; // JSON array of GradingCategory[]
  created_at: number;
}

export interface AcademicPeriod {
  id: string;
  user_id: string;
  semester: string; // e.g., 'First Semester', 'Second Semester', 'Summer / Midyear'
  academic_year: string; // e.g., 'AY 2026–2027'
  is_active: number; // 1 for active, 0 for inactive
  created_at: number;
}

export interface Assessment {
  id: string;
  user_id: string;
  subject_id: string;
  period_id?: string;
  title: string;
  category: 'exam' | 'quiz' | 'assignment' | 'project' | 'recitation' | 'attendance' | 'activity' | 'other';
  custom_category?: string; // user-defined label, overrides category display when set
  raw_score: number;
  total_items: number;
  weight_percent: number; // e.g. 20.0 for 20%
  date?: string; // YYYY-MM-DD
  notes?: string;
  evidence_uri?: string; // local file URI or data URL for score proof image
  created_at: number;
}

export interface Task {
  id: string;
  user_id: string;
  subject_id?: string;
  period_id?: string;
  title: string;
  description?: string;
  due_date: string; // YYYY-MM-DD
  due_time?: string; // HH:mm
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
  estimated_minutes: number;
  completed_at?: number | null;
  created_at: number;
}

export interface ScheduleItem {
  id: string;
  user_id: string;
  subject_id?: string;
  period_id?: string;
  title: string;
  day_of_week: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  location?: string;
  type: 'lecture' | 'lab' | 'tutorial' | 'study_session' | 'exam';
  created_at: number;
}

export interface StudySession {
  id: string;
  user_id: string;
  subject_id?: string;
  duration_seconds: number;
  session_date: string; // YYYY-MM-DD
  notes?: string;
  created_at: number;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'deadline' | 'schedule' | 'achievement' | 'system';
  is_read: number;
  created_at: number;
}

export interface StudyGoals {
  user_id: string;
  weekly_hours_target: number;
  daily_tasks_target: number;
  notifications_enabled: number;
  sound_enabled: number;
  grading_mode: 'college' | 'percentage'; // 'college' = Philippine 1.0-5.0, 'percentage' = % based
}

// -------------------------------------------------------------
// USER OPERATIONS
// -------------------------------------------------------------
export async function createUser(data: {
  email: string;
  username?: string;
  name: string;
  password: string;
  major?: string;
  institution?: string;
  avatar_color?: string;
}): Promise<User> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const avatarColor = data.avatar_color || '#4F46E5';
  const username = (data.username || data.email.split('@')[0]).toLowerCase().trim();

  if (!username || !/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('Username must be 3–30 characters and use only letters, numbers, dots, underscores, or hyphens.');
  }
  if (await getUserByUsername(username)) {
    throw new Error('An account with this username already exists.');
  }

  await db.runAsync(
    `INSERT INTO users (id, email, username, name, password_hash, major, institution, avatar_color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.email.toLowerCase().trim(),
      username,
      data.name.trim(),
      data.password, // In production offline starter, stored securely in local db
      data.major || 'Computer Science',
      data.institution || 'University',
      avatarColor,
      now,
    ]
  );

  // Initialize default study goals
  await db.runAsync(
    `INSERT OR IGNORE INTO study_goals (user_id, weekly_hours_target, daily_tasks_target, notifications_enabled, sound_enabled)
     VALUES (?, 15.0, 4, 1, 1)`,
    [id]
  );

  return {
    id,
    email: data.email.toLowerCase().trim(),
    username,
    name: data.name.trim(),
    password_hash: data.password,
    major: data.major || 'Computer Science',
    institution: data.institution || 'University',
    avatar_color: avatarColor,
    created_at: now,
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<User>(
    `SELECT * FROM users WHERE email = ?`,
    [email.toLowerCase().trim()]
  );
  return row ?? null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<User>(
    `SELECT * FROM users WHERE username = ? COLLATE NOCASE ORDER BY created_at ASC LIMIT 1`,
    [username.trim()]
  );
  return row ?? null;
}

export async function getUserByLoginIdentifier(identifier: string): Promise<User | null> {
  const normalized = identifier.trim();
  return normalized.includes('@')
    ? getUserByEmail(normalized)
    : getUserByUsername(normalized);
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<User>(
    `SELECT * FROM users WHERE id = ?`,
    [id]
  );
  return row ?? null;
}

export async function updateUserProfile(
  userId: string,
  data: Partial<Pick<User, 'name' | 'major' | 'institution' | 'avatar_color'>>
): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.major !== undefined) {
    updates.push('major = ?');
    params.push(data.major);
  }
  if (data.institution !== undefined) {
    updates.push('institution = ?');
    params.push(data.institution);
  }
  if (data.avatar_color !== undefined) {
    updates.push('avatar_color = ?');
    params.push(data.avatar_color);
  }

  if (updates.length > 0) {
    params.push(userId);
    await db.runAsync(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params as (string | number)[]
    );
  }
}

// -------------------------------------------------------------
// SUBJECT OPERATIONS
// -------------------------------------------------------------
export async function getSubjects(userId: string, periodId?: string): Promise<Subject[]> {
  const db = await getDb();
  if (periodId) {
    return db.getAllAsync<Subject>(
      `SELECT * FROM subjects WHERE user_id = ? AND period_id = ? ORDER BY name ASC`,
      [userId, periodId]
    );
  }
  return db.getAllAsync<Subject>(
    `SELECT * FROM subjects WHERE user_id = ? ORDER BY name ASC`,
    [userId]
  );
}

export async function addSubject(data: {
  user_id: string;
  name: string;
  code: string;
  color: string;
  professor?: string;
  room?: string;
  notes?: string;
  period_id?: string;
  credits?: number;
  target_grade?: number;
  passing_grade?: number;
  quiz_weight?: number;
  exam_weight?: number;
  attendance_weight?: number;
  activity_weight?: number;
  grading_categories?: string;
}): Promise<Subject> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const credits = data.credits !== undefined ? data.credits : 3.0;
  const targetGrade = data.target_grade !== undefined ? data.target_grade : 90.0;
  const passingGrade = data.passing_grade !== undefined ? data.passing_grade : 75.0;
  const quizWeight = data.quiz_weight !== undefined ? data.quiz_weight : 25.0;
  const examWeight = data.exam_weight !== undefined ? data.exam_weight : 40.0;
  const attendanceWeight = data.attendance_weight !== undefined ? data.attendance_weight : 10.0;
  const activityWeight = data.activity_weight !== undefined ? data.activity_weight : 25.0;
  const periodId = data.period_id || '';
  const gradingCategories = data.grading_categories || null;

  await db.runAsync(
    `INSERT INTO subjects (id, user_id, name, code, color, professor, room, notes, period_id, credits, target_grade, passing_grade, quiz_weight, exam_weight, attendance_weight, activity_weight, grading_categories, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.user_id,
      data.name.trim(),
      data.code.trim().toUpperCase(),
      data.color,
      data.professor || '',
      data.room || '',
      data.notes || '',
      periodId,
      credits,
      targetGrade,
      passingGrade,
      quizWeight,
      examWeight,
      attendanceWeight,
      activityWeight,
      gradingCategories,
      now,
    ]
  );

  return {
    id,
    user_id: data.user_id,
    name: data.name.trim(),
    code: data.code.trim().toUpperCase(),
    color: data.color,
    professor: data.professor,
    room: data.room,
    notes: data.notes,
    period_id: periodId,
    credits,
    target_grade: targetGrade,
    passing_grade: passingGrade,
    quiz_weight: quizWeight,
    exam_weight: examWeight,
    attendance_weight: attendanceWeight,
    activity_weight: activityWeight,
    grading_categories: gradingCategories || undefined,
    created_at: now,
  };
}

export async function updateSubject(
  id: string,
  userId: string,
  data: Partial<Omit<Subject, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.code !== undefined) {
    updates.push('code = ?');
    params.push(data.code.trim().toUpperCase());
  }
  if (data.color !== undefined) {
    updates.push('color = ?');
    params.push(data.color);
  }
  if (data.professor !== undefined) {
    updates.push('professor = ?');
    params.push(data.professor);
  }
  if (data.room !== undefined) {
    updates.push('room = ?');
    params.push(data.room);
  }
  if (data.notes !== undefined) {
    updates.push('notes = ?');
    params.push(data.notes);
  }
  if (data.period_id !== undefined) {
    updates.push('period_id = ?');
    params.push(data.period_id);
  }
  if (data.credits !== undefined) {
    updates.push('credits = ?');
    params.push(data.credits);
  }
  if (data.target_grade !== undefined) {
    updates.push('target_grade = ?');
    params.push(data.target_grade);
  }
  if (data.passing_grade !== undefined) {
    updates.push('passing_grade = ?');
    params.push(data.passing_grade);
  }
  if (data.quiz_weight !== undefined) {
    updates.push('quiz_weight = ?');
    params.push(data.quiz_weight);
  }
  if (data.exam_weight !== undefined) {
    updates.push('exam_weight = ?');
    params.push(data.exam_weight);
  }
  if (data.attendance_weight !== undefined) {
    updates.push('attendance_weight = ?');
    params.push(data.attendance_weight);
  }
  if (data.activity_weight !== undefined) {
    updates.push('activity_weight = ?');
    params.push(data.activity_weight);
  }
  if (data.grading_categories !== undefined) {
    updates.push('grading_categories = ?');
    params.push(data.grading_categories);
  }

  if (updates.length > 0) {
    params.push(id, userId);
    await db.runAsync(
      `UPDATE subjects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params as (string | number)[]
    );
  }
}

export async function deleteSubject(id: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM assessments WHERE subject_id = ? AND user_id = ?`, [id, userId]);
  await db.runAsync(`DELETE FROM tasks WHERE subject_id = ? AND user_id = ?`, [id, userId]);
  await db.runAsync(`DELETE FROM schedules WHERE subject_id = ? AND user_id = ?`, [id, userId]);
  await db.runAsync(`DELETE FROM subjects WHERE id = ? AND user_id = ?`, [id, userId]);
}

// -------------------------------------------------------------
// ACADEMIC PERIOD OPERATIONS
// -------------------------------------------------------------
export async function getAcademicPeriods(userId: string): Promise<AcademicPeriod[]> {
  const db = await getDb();
  return db.getAllAsync<AcademicPeriod>(
    `SELECT * FROM academic_periods WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
}

export async function getActiveAcademicPeriod(userId: string): Promise<AcademicPeriod | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AcademicPeriod>(
    `SELECT * FROM academic_periods WHERE user_id = ? AND is_active = 1 LIMIT 1`,
    [userId]
  );
  return row ?? null;
}

export async function createAcademicPeriod(data: {
  user_id: string;
  semester: string;
  academic_year: string;
  is_active?: boolean;
}): Promise<AcademicPeriod> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const isActive = data.is_active ? 1 : 0;

  if (isActive === 1) {
    // Unset other active periods
    await db.runAsync(`UPDATE academic_periods SET is_active = 0 WHERE user_id = ?`, [data.user_id]);
  }

  await db.runAsync(
    `INSERT INTO academic_periods (id, user_id, semester, academic_year, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.user_id, data.semester.trim(), data.academic_year.trim(), isActive, now]
  );

  return {
    id,
    user_id: data.user_id,
    semester: data.semester.trim(),
    academic_year: data.academic_year.trim(),
    is_active: isActive,
    created_at: now,
  };
}

export async function setActiveAcademicPeriod(userId: string, periodId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE academic_periods SET is_active = 0 WHERE user_id = ?`, [userId]);
  await db.runAsync(`UPDATE academic_periods SET is_active = 1 WHERE id = ? AND user_id = ?`, [periodId, userId]);
}

export async function deleteAcademicPeriod(userId: string, periodId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM academic_periods WHERE id = ? AND user_id = ?`, [periodId, userId]);
}

// -------------------------------------------------------------
// ASSESSMENT & GRADE OPERATIONS
// -------------------------------------------------------------
export async function getAssessments(userId: string, subjectId?: string, periodId?: string): Promise<Assessment[]> {
  const db = await getDb();
  const conditions = ['user_id = ?'];
  const params: unknown[] = [userId];

  if (subjectId) {
    conditions.push('subject_id = ?');
    params.push(subjectId);
  }
  if (periodId) {
    conditions.push('period_id = ?');
    params.push(periodId);
  }

  return db.getAllAsync<Assessment>(
    `SELECT * FROM assessments WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`,
    params as (string | number)[]
  );
}

export async function addAssessment(data: {
  user_id: string;
  subject_id: string;
  period_id?: string;
  title: string;
  category: Assessment['category'];
  custom_category?: string;
  raw_score: number;
  total_items: number;
  weight_percent: number;
  date?: string;
  notes?: string;
  evidence_uri?: string;
}): Promise<Assessment> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO assessments (id, user_id, subject_id, period_id, title, category, custom_category, raw_score, total_items, weight_percent, date, notes, evidence_uri, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.user_id,
      data.subject_id,
      data.period_id || '',
      data.title.trim(),
      data.category,
      data.custom_category || null,
      Number(data.raw_score),
      Number(data.total_items),
      Number(data.weight_percent),
      data.date || '',
      data.notes || '',
      data.evidence_uri || null,
      now,
    ]
  );

  return {
    id,
    user_id: data.user_id,
    subject_id: data.subject_id,
    period_id: data.period_id,
    title: data.title.trim(),
    category: data.category,
    custom_category: data.custom_category,
    raw_score: Number(data.raw_score),
    total_items: Number(data.total_items),
    weight_percent: Number(data.weight_percent),
    date: data.date,
    notes: data.notes,
    evidence_uri: data.evidence_uri,
    created_at: now,
  };
}

export async function updateAssessment(
  id: string,
  userId: string,
  data: Partial<Omit<Assessment, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title.trim());
  }
  if (data.category !== undefined) {
    updates.push('category = ?');
    params.push(data.category);
  }
  if (data.custom_category !== undefined) {
    updates.push('custom_category = ?');
    params.push(data.custom_category || null);
  }
  if (data.raw_score !== undefined) {
    updates.push('raw_score = ?');
    params.push(Number(data.raw_score));
  }
  if (data.total_items !== undefined) {
    updates.push('total_items = ?');
    params.push(Number(data.total_items));
  }
  if (data.weight_percent !== undefined) {
    updates.push('weight_percent = ?');
    params.push(Number(data.weight_percent));
  }
  if (data.date !== undefined) {
    updates.push('date = ?');
    params.push(data.date);
  }
  if (data.notes !== undefined) {
    updates.push('notes = ?');
    params.push(data.notes);
  }
  if (data.evidence_uri !== undefined) {
    updates.push('evidence_uri = ?');
    params.push(data.evidence_uri || null);
  }

  if (updates.length > 0) {
    params.push(id, userId);
    await db.runAsync(
      `UPDATE assessments SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params as (string | number)[]
    );
  }
}

export async function deleteAssessment(id: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM assessments WHERE id = ? AND user_id = ?`, [id, userId]);
}

// -------------------------------------------------------------
// TASK OPERATIONS
// -------------------------------------------------------------
export async function getTasks(userId: string, periodId?: string): Promise<Task[]> {
  const db = await getDb();
  if (periodId) {
    return db.getAllAsync<Task>(
      `SELECT * FROM tasks WHERE user_id = ? AND period_id = ? ORDER BY status ASC, due_date ASC, priority DESC`,
      [userId, periodId]
    );
  }
  return db.getAllAsync<Task>(
    `SELECT * FROM tasks WHERE user_id = ? ORDER BY status ASC, due_date ASC, priority DESC`,
    [userId]
  );
}

export async function addTask(data: {
  user_id: string;
  subject_id?: string;
  period_id?: string;
  title: string;
  description?: string;
  due_date: string;
  due_time?: string;
  priority?: 'low' | 'medium' | 'high';
  estimated_minutes?: number;
}): Promise<Task> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const priority = data.priority || 'medium';
  const estimated = data.estimated_minutes || 30;

  await db.runAsync(
    `INSERT INTO tasks (id, user_id, subject_id, period_id, title, description, due_date, due_time, priority, status, estimated_minutes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id,
      data.user_id,
      data.subject_id || null,
      data.period_id || null,
      data.title.trim(),
      data.description || '',
      data.due_date,
      data.due_time || '23:59',
      priority,
      estimated,
      now,
    ]
  );

  return {
    id,
    user_id: data.user_id,
    subject_id: data.subject_id,
    period_id: data.period_id,
    title: data.title.trim(),
    description: data.description,
    due_date: data.due_date,
    due_time: data.due_time || '23:59',
    priority,
    status: 'pending',
    estimated_minutes: estimated,
    created_at: now,
  };
}

export async function updateTask(
  id: string,
  userId: string,
  data: Partial<Omit<Task, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title.trim());
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.subject_id !== undefined) {
    updates.push('subject_id = ?');
    params.push(data.subject_id || null);
  }
  if (data.period_id !== undefined) {
    updates.push('period_id = ?');
    params.push(data.period_id || null);
  }
  if (data.due_date !== undefined) {
    updates.push('due_date = ?');
    params.push(data.due_date);
  }
  if (data.due_time !== undefined) {
    updates.push('due_time = ?');
    params.push(data.due_time);
  }
  if (data.priority !== undefined) {
    updates.push('priority = ?');
    params.push(data.priority);
  }
  if (data.status !== undefined) {
    updates.push('status = ?');
    params.push(data.status);
    if (data.status === 'completed') {
      updates.push('completed_at = ?');
      params.push(Date.now());
    } else {
      updates.push('completed_at = NULL');
    }
  }
  if (data.estimated_minutes !== undefined) {
    updates.push('estimated_minutes = ?');
    params.push(data.estimated_minutes);
  }

  if (updates.length > 0) {
    params.push(id, userId);
    await db.runAsync(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params as (string | number | null)[]
    );
  }
}

export async function toggleTaskStatus(id: string, userId: string, currentStatus: 'pending' | 'completed'): Promise<'pending' | 'completed'> {
  const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
  const completedAt = nextStatus === 'completed' ? Date.now() : null;
  const db = await getDb();

  await db.runAsync(
    `UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?`,
    [nextStatus, completedAt, id, userId]
  );
  return nextStatus;
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, [id, userId]);
}

// -------------------------------------------------------------
// SCHEDULE OPERATIONS
// -------------------------------------------------------------
export async function getSchedules(userId: string, periodId?: string): Promise<ScheduleItem[]> {
  const db = await getDb();
  if (periodId) {
    return db.getAllAsync<ScheduleItem>(
      `SELECT * FROM schedules WHERE user_id = ? AND period_id = ? ORDER BY day_of_week ASC, start_time ASC`,
      [userId, periodId]
    );
  }
  return db.getAllAsync<ScheduleItem>(
    `SELECT * FROM schedules WHERE user_id = ? ORDER BY day_of_week ASC, start_time ASC`,
    [userId]
  );
}

export async function addSchedule(data: {
  user_id: string;
  subject_id?: string;
  period_id?: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string;
  type?: ScheduleItem['type'];
}): Promise<ScheduleItem> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const type = data.type || 'lecture';

  await db.runAsync(
    `INSERT INTO schedules (id, user_id, subject_id, period_id, title, day_of_week, start_time, end_time, location, type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.user_id,
      data.subject_id || null,
      data.period_id || null,
      data.title.trim(),
      data.day_of_week,
      data.start_time,
      data.end_time,
      data.location || '',
      type,
      now,
    ]
  );

  return {
    id,
    user_id: data.user_id,
    subject_id: data.subject_id,
    period_id: data.period_id,
    title: data.title.trim(),
    day_of_week: data.day_of_week,
    start_time: data.start_time,
    end_time: data.end_time,
    location: data.location,
    type,
    created_at: now,
  };
}

export async function updateSchedule(
  id: string,
  userId: string,
  data: Partial<Omit<ScheduleItem, 'id' | 'user_id' | 'created_at'>>
): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title.trim());
  }
  if (data.subject_id !== undefined) {
    updates.push('subject_id = ?');
    params.push(data.subject_id || null);
  }
  if (data.period_id !== undefined) {
    updates.push('period_id = ?');
    params.push(data.period_id || null);
  }
  if (data.day_of_week !== undefined) {
    updates.push('day_of_week = ?');
    params.push(data.day_of_week);
  }
  if (data.start_time !== undefined) {
    updates.push('start_time = ?');
    params.push(data.start_time);
  }
  if (data.end_time !== undefined) {
    updates.push('end_time = ?');
    params.push(data.end_time);
  }
  if (data.location !== undefined) {
    updates.push('location = ?');
    params.push(data.location);
  }
  if (data.type !== undefined) {
    updates.push('type = ?');
    params.push(data.type);
  }

  if (updates.length > 0) {
    params.push(id, userId);
    await db.runAsync(
      `UPDATE schedules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params as (string | number | null)[]
    );
  }
}

export async function deleteSchedule(id: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM schedules WHERE id = ? AND user_id = ?`, [id, userId]);
}

// -------------------------------------------------------------
// STUDY SESSIONS & FOCUS TIMER
// -------------------------------------------------------------
export async function logStudySession(data: {
  user_id: string;
  subject_id?: string;
  duration_seconds: number;
  session_date?: string;
  notes?: string;
}): Promise<StudySession> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const sessionDate = data.session_date || new Date().toISOString().split('T')[0];

  await db.runAsync(
    `INSERT INTO study_sessions (id, user_id, subject_id, duration_seconds, session_date, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.user_id,
      data.subject_id || null,
      data.duration_seconds,
      sessionDate,
      data.notes || '',
      now,
    ]
  );

  return {
    id,
    user_id: data.user_id,
    subject_id: data.subject_id,
    duration_seconds: data.duration_seconds,
    session_date: sessionDate,
    notes: data.notes,
    created_at: now,
  };
}

export async function getStudySessions(userId: string): Promise<StudySession[]> {
  const db = await getDb();
  return db.getAllAsync<StudySession>(
    `SELECT * FROM study_sessions WHERE user_id = ? ORDER BY session_date DESC, created_at DESC`,
    [userId]
  );
}

// -------------------------------------------------------------
// NOTIFICATIONS
// -------------------------------------------------------------
export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const db = await getDb();
  return db.getAllAsync<AppNotification>(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
}

export async function addNotification(data: {
  user_id: string;
  title: string;
  message: string;
  type?: AppNotification['type'];
}): Promise<AppNotification> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const type = data.type || 'system';

  await db.runAsync(
    `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, data.user_id, data.title, data.message, type, now]
  );

  return {
    id,
    user_id: data.user_id,
    title: data.title,
    message: data.message,
    type,
    is_read: 0,
    created_at: now,
  };
}

export async function markNotificationAsRead(id: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
}

export async function clearNotifications(userId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM notifications WHERE user_id = ?`, [userId]);
}

// -------------------------------------------------------------
// STUDY GOALS
// -------------------------------------------------------------
export async function getStudyGoals(userId: string): Promise<StudyGoals> {
  const db = await getDb();
  const row = await db.getFirstAsync<StudyGoals>(
    `SELECT * FROM study_goals WHERE user_id = ?`,
    [userId]
  );
  if (row) {
    return {
      ...row,
      grading_mode: (row.grading_mode === 'percentage' ? 'percentage' : 'college'),
    };
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO study_goals (user_id, weekly_hours_target, daily_tasks_target, notifications_enabled, sound_enabled, grading_mode)
     VALUES (?, 15.0, 4, 1, 1, 'college')`,
    [userId]
  );

  return {
    user_id: userId,
    weekly_hours_target: 15.0,
    daily_tasks_target: 4,
    notifications_enabled: 1,
    sound_enabled: 1,
    grading_mode: 'college',
  };
}

export async function updateStudyGoals(
  userId: string,
  data: Partial<Omit<StudyGoals, 'user_id'>>
): Promise<void> {
  const db = await getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.weekly_hours_target !== undefined) {
    updates.push('weekly_hours_target = ?');
    params.push(data.weekly_hours_target);
  }
  if (data.daily_tasks_target !== undefined) {
    updates.push('daily_tasks_target = ?');
    params.push(data.daily_tasks_target);
  }
  if (data.notifications_enabled !== undefined) {
    updates.push('notifications_enabled = ?');
    params.push(data.notifications_enabled);
  }
  if (data.sound_enabled !== undefined) {
    updates.push('sound_enabled = ?');
    params.push(data.sound_enabled);
  }
  if (data.grading_mode !== undefined) {
    updates.push('grading_mode = ?');
    params.push(data.grading_mode);
  }

  if (updates.length > 0) {
    params.push(userId);
    await db.runAsync(
      `UPDATE study_goals SET ${updates.join(', ')} WHERE user_id = ?`,
      params as (number | string)[]
    );
  }
}

// -------------------------------------------------------------
// LEGACY DEMO DATA CLEANUP
// -------------------------------------------------------------
export async function cleanupLegacyDemoRecords(userId?: string): Promise<void> {
  const db = await getDb();
  try {
    const userClause = userId ? 'AND user_id = ?' : '';
    const params = userId ? [userId] : [];

    // 1. Identify and delete legacy demo subjects matching known demo profiles
    const demoSubjects = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM subjects WHERE (
        (code = 'MATH 201' AND (professor = 'Dr. Katherine Miller' OR name = 'Advanced Calculus')) OR
        (code = 'CS 210' AND (professor = 'Prof. David Vance' OR name = 'Data Structures & Algorithms')) OR
        (code = 'PHYS 150' AND (professor = 'Dr. Sarah Connor' OR name = 'Quantum Physics')) OR
        (code = 'LIT 105' AND (professor = 'Prof. Marcus Brody' OR name = 'Modern World Literature'))
      ) ${userClause}`,
      params
    );

    for (const sub of demoSubjects) {
      await db.runAsync(`DELETE FROM assessments WHERE subject_id = ?`, [sub.id]);
      await db.runAsync(`DELETE FROM tasks WHERE subject_id = ?`, [sub.id]);
      await db.runAsync(`DELETE FROM schedules WHERE subject_id = ?`, [sub.id]);
      await db.runAsync(`DELETE FROM subjects WHERE id = ?`, [sub.id]);
    }

    // 2. Clean up any remaining legacy demo tasks by known titles
    await db.runAsync(
      `DELETE FROM tasks WHERE title IN (
        'Complete Problem Set #4 (Multivariable Integrals)',
        'Implement Red-Black Tree in C++',
        'Lab Report: Photoelectric Effect',
        'Draft 500-word essay outline on Postmodern Fiction'
      ) ${userClause}`,
      params
    );

    // 3. Clean up all remaining legacy demo schedules by known titles
    await db.runAsync(
      `DELETE FROM schedules WHERE title IN (
        'Calculus Lecture',
        'DSA Lab Session',
        'Physics Theory',
        'Literature Discussion',
        'Algorithms Seminar',
        'Quantum Physics Lab'
      ) ${userClause}`,
      params
    );

    // 4. Clean up any remaining legacy demo assessments by known titles
    await db.runAsync(
      `DELETE FROM assessments WHERE title IN (
        'Quiz 1: Partial Derivatives',
        'Problem Set #1',
        'Midterm Exam',
        'Machine Problem 1: Linked Lists',
        'Coding Quiz 1: Recursion & Trees',
        'Midterm Practical Exam',
        'Lab Report: Photoelectric Effect',
        'Quiz 1: Wave Mechanics',
        'Midterm Examination',
        'Critical Essay: Postmodern Fiction',
        'Midterm Paper'
      ) ${userClause}`,
      params
    );

    // 5. Clean up any demo deadline notifications
    await db.runAsync(
      `DELETE FROM notifications WHERE title = 'Upcoming Deadline ⏰' AND message LIKE '%Problem Set #4%' ${userClause}`,
      params
    );

    // 6. Delete orphaned items where subject_id is set but the subject no longer exists
    await db.runAsync(
      `DELETE FROM tasks WHERE subject_id IS NOT NULL AND subject_id != '' AND subject_id NOT IN (SELECT id FROM subjects) ${userClause}`,
      params
    );
    await db.runAsync(
      `DELETE FROM schedules WHERE subject_id IS NOT NULL AND subject_id != '' AND subject_id NOT IN (SELECT id FROM subjects) ${userClause}`,
      params
    );
    await db.runAsync(
      `DELETE FROM assessments WHERE subject_id IS NOT NULL AND subject_id != '' AND subject_id NOT IN (SELECT id FROM subjects) ${userClause}`,
      params
    );
  } catch (err) {
    console.warn('[cleanupLegacyDemoRecords] Warning during demo data cleanup:', err);
  }
}

// -------------------------------------------------------------
// INIT FRESH ACCOUNT (no fake demo data)
// -------------------------------------------------------------
export async function seedDemoDataIfEmpty(userId: string): Promise<void> {
  const db = await getDb();

  // Run cleanup to ensure no orphaned demo records exist
  await cleanupLegacyDemoRecords(userId);

  // Check if user already has an academic period — skip period creation if they do
  const existingPeriod = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM academic_periods WHERE user_id = ?`,
    [userId]
  );
  if ((existingPeriod?.count ?? 0) > 0) return;

  // Create the first academic period so the app has an active term to work with
  await createAcademicPeriod({
    user_id: userId,
    semester: 'First Semester',
    academic_year: 'AY 2026–2027',
    is_active: true,
  });

  // Add a single welcome notification — strictly no fake subjects, schedules, tasks, or assessments
  await addNotification({
    user_id: userId,
    title: 'Welcome to StudyTrack! 🎓',
    message:
      'Your personal academic organizer is ready. Add your subjects, track deadlines, and use the + button to scan your class schedule.',
    type: 'achievement',
  });
}
