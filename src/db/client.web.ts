// Browser stand-in for client.ts: runs SQLite in-memory via wa-sqlite directly,
// avoiding expo-sqlite's web worker OPFS locks and cross-origin header issues.
import type * as SQLite from 'expo-sqlite';
// @ts-expect-error wa-sqlite factory untyped
import WaSQLiteFactory from 'expo-sqlite/web/wa-sqlite/wa-sqlite';
// @ts-expect-error wasm asset untyped
import wasmModule from 'expo-sqlite/web/wa-sqlite/wa-sqlite.wasm';
// @ts-expect-error wa-sqlite api untyped
import * as SQLiteAPI from 'expo-sqlite/web/wa-sqlite/sqlite-api';
// @ts-expect-error MemoryVFS untyped
import { MemoryVFS } from 'expo-sqlite/web/wa-sqlite/MemoryVFS';

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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
];

class WebSQLiteDatabase {
  private sqlite3: any;
  private db: number;

  constructor(sqlite3: any, db: number) {
    this.sqlite3 = sqlite3;
    this.db = db;
  }

  async execAsync(source: string): Promise<void> {
    await this.sqlite3.exec(this.db, source);
  }

  async runAsync(source: string, ...params: any[]): Promise<SQLite.SQLiteRunResult> {
    const bindParams = this.normalizeParams(params);
    for await (const stmt of this.sqlite3.statements(this.db, source)) {
      // DO NOT call finalize here — the statements() generator finalizes in its finally block.
      // Calling finalize twice causes WASM "memory access out of bounds".
      if (bindParams !== null) {
        this.sqlite3.bind_collection(stmt, bindParams);
      }
      await this.sqlite3.step(stmt);
    }
    return {
      lastInsertRowId: Number(this.sqlite3.last_insert_rowid(this.db)),
      changes: this.sqlite3.changes(this.db),
    };
  }

  async getFirstAsync<T>(source: string, ...params: any[]): Promise<T | null> {
    const rows = await this.getAllAsync<T>(source, ...params);
    return rows.length > 0 ? rows[0] : null;
  }

  async getAllAsync<T>(source: string, ...params: any[]): Promise<T[]> {
    const bindParams = this.normalizeParams(params);
    const results: T[] = [];
    for await (const stmt of this.sqlite3.statements(this.db, source)) {
      // DO NOT call finalize here — the statements() generator finalizes in its finally block.
      // Calling finalize twice causes WASM "memory access out of bounds".
      if (bindParams !== null) {
        this.sqlite3.bind_collection(stmt, bindParams);
      }
      const colNames: string[] = this.sqlite3.column_names(stmt);
      while ((await this.sqlite3.step(stmt)) === SQLiteAPI.SQLITE_ROW) {
        const rowValues = this.sqlite3.row(stmt);
        const obj: any = {};
        for (let i = 0; i < colNames.length; i++) {
          obj[colNames[i]] = rowValues[i];
        }
        results.push(obj as T);
      }
      // Generator's finally block handles finalize automatically
    }
    return results;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    await this.execAsync('BEGIN TRANSACTION');
    try {
      await task();
      await this.execAsync('COMMIT');
    } catch (e) {
      await this.execAsync('ROLLBACK');
      throw e;
    }
  }

  async closeAsync(): Promise<void> {
    await this.sqlite3.close(this.db);
  }

  private normalizeParams(params: any[]): any[] | Record<string, unknown> | null {
    if (!params || params.length === 0) return null;
    // Single array argument: db.runAsync(sql, [v1, v2])
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    // Single object argument: db.runAsync(sql, {$name: val}) — keep keys for named binding
    if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
      return params[0] as Record<string, unknown>;
    }
    // Variadic positional: db.runAsync(sql, v1, v2)
    return params;
  }
}

let webDbInstance: SQLite.SQLiteDatabase | null = null;
let webInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (webDbInstance) return Promise.resolve(webDbInstance);
  if (!webInitPromise) {
    webInitPromise = (async () => {
      try {
        const module = await WaSQLiteFactory({
          locateFile: () => wasmModule,
        });
        const sqlite3 = SQLiteAPI.Factory(module);
        const vfs = await MemoryVFS.create('studytrack-web-vfs', module);
        sqlite3.vfs_register(vfs, true);
        const dbPtr = await sqlite3.open_v2('studytrack.db', 6, 'studytrack-web-vfs');
        const database = new WebSQLiteDatabase(sqlite3, dbPtr) as unknown as SQLite.SQLiteDatabase;

        await database.execAsync('PRAGMA foreign_keys = ON');
        await migrate(database);
        webDbInstance = database;
        return database;
      } catch (err) {
        webInitPromise = null;
        console.error('[WebDatabase] Failed to initialize wa-sqlite in-memory:', err);
        throw err;
      }
    })();
  }
  return webInitPromise;
}
