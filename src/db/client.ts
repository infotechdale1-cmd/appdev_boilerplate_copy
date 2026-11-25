import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Ordered migrations, applied by PRAGMA user_version. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'pending', 'error')),
    error TEXT,
    provider TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (conversation_id, created_at);
  `,
  `
  ALTER TABLE messages ADD COLUMN image_uri TEXT;
  `,
  `
  ALTER TABLE messages ADD COLUMN audio_uri TEXT;
  `,
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    major TEXT,
    institution TEXT,
    avatar_color TEXT DEFAULT '#4F46E5',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    color TEXT NOT NULL,
    professor TEXT,
    room TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects (user_id);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT NOT NULL,
    due_time TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    estimated_minutes INTEGER DEFAULT 30,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id, status, due_date);

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_id TEXT,
    title TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    type TEXT DEFAULT 'lecture',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_schedules_user_day ON schedules (user_id, day_of_week);

  CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_id TEXT,
    duration_seconds INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_study_sessions_user_date ON study_sessions (user_id, session_date);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'deadline',
    is_read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS study_goals (
    user_id TEXT PRIMARY KEY,
    weekly_hours_target REAL DEFAULT 15.0,
    daily_tasks_target INTEGER DEFAULT 4,
    notifications_enabled INTEGER DEFAULT 1,
    sound_enabled INTEGER DEFAULT 1
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS academic_periods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    semester TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_academic_periods_user ON academic_periods (user_id);

  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    period_id TEXT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    raw_score REAL NOT NULL,
    total_items REAL NOT NULL,
    weight_percent REAL NOT NULL,
    date TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assessments_subject ON assessments (subject_id);
  CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments (user_id);
  `,
  `
  ALTER TABLE subjects ADD COLUMN period_id TEXT;
  `,
  `
  ALTER TABLE subjects ADD COLUMN credits REAL DEFAULT 3.0;
  `,
  `
  ALTER TABLE subjects ADD COLUMN target_grade REAL DEFAULT 90.0;
  `,
  `
  ALTER TABLE subjects ADD COLUMN passing_grade REAL DEFAULT 75.0;
  `,
  `
  ALTER TABLE subjects ADD COLUMN quiz_weight REAL DEFAULT 25.0;
  `,
  `
  ALTER TABLE subjects ADD COLUMN exam_weight REAL DEFAULT 40.0;
  `,
  `
  ALTER TABLE subjects ADD COLUMN attendance_weight REAL DEFAULT 10.0;
  `,
  `
  ALTER TABLE subjects ADD COLUMN activity_weight REAL DEFAULT 25.0;
  `,
  `
  ALTER TABLE assessments ADD COLUMN evidence_uri TEXT;
  `,
  `
  ALTER TABLE assessments ADD COLUMN custom_category TEXT;
  `,
  `
  ALTER TABLE study_goals ADD COLUMN grading_mode TEXT DEFAULT 'college';
  `,
  `
  ALTER TABLE schedules ADD COLUMN period_id TEXT;
  `,
  `
  ALTER TABLE tasks ADD COLUMN period_id TEXT;
  `,
  `
  ALTER TABLE subjects ADD COLUMN grading_categories TEXT;
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_schedules_period ON schedules (period_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks (period_id);
  `,
  `
  ALTER TABLE users ADD COLUMN username TEXT;
  UPDATE users SET username = lower(substr(email, 1, instr(email, '@') - 1))
    WHERE username IS NULL OR username = '';
  CREATE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE);
  `,
  `
  ALTER TABLE users ADD COLUMN avatar_uri TEXT;
  `,
];

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const version = row?.user_version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    try {
      await database.execAsync(MIGRATIONS[i]);
    } catch (e) {
      console.warn(`Migration ${i + 1} warning:`, e);
    }
    await database.execAsync(`PRAGMA user_version = ${i + 1}`);
  }
}

/** Open (and migrate) the database. Safe to call from anywhere; runs once. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    // Delegate to wa-sqlite in-memory browser database, avoiding expo-sqlite OPFS web worker locks
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./client.web').getDb();
  }
  if (db) return Promise.resolve(db);
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const database = await SQLite.openDatabaseAsync('chat.db');
        await database.execAsync('PRAGMA foreign_keys = ON');
        await migrate(database);
        db = database;
        return database;
      } catch (primaryError) {
        initPromise = null;
        console.error('[Database] Failed to open and migrate database:', primaryError);
        throw primaryError;
      }
    })();
  }
  return initPromise;
}
