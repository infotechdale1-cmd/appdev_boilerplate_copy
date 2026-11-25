import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStudy } from '@/context/StudyContext';
import { readTimetableFile, type FileReadResult } from '@/services/fileReader';
import { extractTextFromPdfBase64 } from '@/services/pdfExtractor';
import { extractTextFromImage } from '@/services/tesseract';
import { prepareImageForAi } from '@/services/prepareImageForAi';
import { confirmAction, showError, showMessage, showSuccess } from '@/utils/confirm';
import { useTheme } from '@/theme';

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_FULL_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export const SCHEDULE_TYPES = ['lecture', 'lab', 'tutorial', 'study_session', 'exam'] as const;

export type ScanStage =
  | 'idle'
  | 'selecting_file'
  | 'reading_file'
  | 'preparing_document'
  | 'extracting_text'
  | 'analyzing_ai'
  | 'identifying_schedules'
  | 'ready'
  | 'error';

export const SCAN_STAGE_LABELS: Record<ScanStage, string> = {
  idle: 'Ready to scan',
  selecting_file: '1. Selecting timetable file...',
  reading_file: '2. Reading uploaded file...',
  preparing_document: '3. Preparing image or document...',
  extracting_text: '4. Extracting timetable text...',
  analyzing_ai: '5. Analyzing timetable with AI...',
  identifying_schedules: '6. Identifying class schedules...',
  ready: '7. Preparing schedule preview...',
  error: 'Scan halted',
};

export interface ExtractedEntry {
  id: string;
  title: string;
  subject_code: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  professor: string;
  type: typeof SCHEDULE_TYPES[number];
  needsReview: boolean;
  reviewReason?: string;
  selected: boolean;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Converts any time format (8:00 AM, 08:00, 1:30 PM, 1-2:30pm, 0800, 1330) into 24-hr "HH:mm" */
export function parseAndNormalizeTime(raw: string, peerIsPM = false): string {
  if (!raw) return '08:00';
  const clean = raw.trim().toUpperCase();
  const hasPM = clean.includes('PM');
  const hasAM = clean.includes('AM');
  const numOnly = clean.replace(/[^0-9:]/g, '');

  let h = 0;
  let m = 0;
  if (numOnly.includes(':')) {
    const parts = numOnly.split(':');
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
  } else if (numOnly.length === 3) {
    h = parseInt(numOnly.slice(0, 1), 10) || 0;
    m = parseInt(numOnly.slice(1), 10) || 0;
  } else if (numOnly.length === 4) {
    h = parseInt(numOnly.slice(0, 2), 10) || 0;
    m = parseInt(numOnly.slice(2), 10) || 0;
  } else {
    h = parseInt(numOnly, 10) || 0;
    m = 0;
  }

  if (hasPM && h < 12) {
    h += 12;
  } else if (hasAM && h === 12) {
    h = 0;
  } else if (!hasAM && !hasPM) {
    if ((peerIsPM && h >= 1 && h <= 11) || (h >= 1 && h <= 6)) {
      h += 12;
    }
  }

  h = Math.max(0, Math.min(23, h));
  m = Math.max(0, Math.min(59, m));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parses string or number to 0=Sunday, ..., 6=Saturday */
export function parseDayOfWeek(raw: unknown): number {
  if (typeof raw === 'number' && raw >= 0 && raw <= 6) return raw;
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('sun')) return 0;
  if (s.includes('mon')) return 1;
  if (s.includes('tue')) return 2;
  if (s.includes('wed')) return 3;
  if (s.includes('thu') || s === 'th') return 4;
  if (s.includes('fri')) return 5;
  if (s.includes('sat')) return 6;
  return 1;
}

function parseDelimitedRows(text: string): string[][] {
  const delimiter = text.includes('\t') ? '\t' : text.includes(';') && !text.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function daysFromDelimitedValue(value: string, allowShortTokens = false): number[] {
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  const groupedDays: Record<string, number[]> = {
    mwf: [1, 3, 5],
    'm/w/f': [1, 3, 5],
    'm-w-f': [1, 3, 5],
    tth: [2, 4],
    't/th': [2, 4],
    't-th': [2, 4],
    tuth: [2, 4],
    mtwth: [1, 2, 3, 4],
    mtwtf: [1, 2, 3, 4, 5],
    daily: [1, 2, 3, 4, 5],
  };
  if (groupedDays[normalized]) return groupedDays[normalized];

  const matches: { pattern: RegExp; day: number }[] = [
    { pattern: /\b(?:sunday|sun)\b/i, day: 0 },
    { pattern: /\b(?:monday|mon)\b/i, day: 1 },
    { pattern: /\b(?:tuesday|tues|tue)\b/i, day: 2 },
    { pattern: /\b(?:wednesday|wed)\b/i, day: 3 },
    { pattern: /\b(?:thursday|thurs|thur|thu)\b/i, day: 4 },
    { pattern: /\b(?:friday|fri)\b/i, day: 5 },
    { pattern: /\b(?:saturday|sat)\b/i, day: 6 },
  ];
  const foundDays = matches.filter(({ pattern }) => pattern.test(value)).map(({ day }) => day);
  if (foundDays.length > 0 || !allowShortTokens) return foundDays;

  const shortDayTokens: Record<string, number> = {
    m: 1, mo: 1, tu: 2, t: 2, w: 3, we: 3, th: 4, r: 4, f: 5, fr: 5, sa: 6, s: 6, su: 0, u: 0,
  };
  const tokens = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => token in shortDayTokens)
    ? [...new Set(tokens.map((token) => shortDayTokens[token]))]
    : [];
}

function parseDelimitedSchedule(text: string): ExtractedEntry[] {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) return [];

  const dayColumns = new Map<number, number>();
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const headerCells = rows[i].map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ''));
    const columns = rows[i]
      .map((cell, index) => ({ index, days: daysFromDelimitedValue(cell) }))
      .filter(({ days }) => days.length === 1);
    const hasDayHeader = headerCells.some((cell) => /^(?:day|days|dayofweek|weekday|weekdays|scheduleday|classday)$/.test(cell));
    const hasScheduleHeader = headerCells.some((cell) => /^(?:time|timerange|classtime|start|starttime|from|course|coursetitle|coursename|subject|subjectname|title)$/.test(cell));
    if (
      columns.length >= 2 ||
      (columns.length === 1 && /time|period/i.test(rows[i][0] || '')) ||
      (hasDayHeader && hasScheduleHeader)
    ) {
      headerIndex = i;
      for (const column of columns) dayColumns.set(column.index, column.days[0]);
      break;
    }
  }

  const timeRangeRegex = /\b(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\b/i;
  const entries: ExtractedEntry[] = [];

  const addEntry = (
    titleValue: string,
    dayValues: number[],
    timeRange: string,
    subjectCode = '',
    location = '',
    professor = ''
  ) => {
    const match = timeRange.match(timeRangeRegex);
    if (!match || dayValues.length === 0) return;

    const peerIsPM = /p\.?m\.?/i.test(match[2]);
    const startTime = parseAndNormalizeTime(match[1], peerIsPM);
    const endTime = parseAndNormalizeTime(match[2]);
    const title = titleValue.trim() || subjectCode.trim() || 'Class Session';
    const type: ExtractedEntry['type'] = /lab/i.test(`${title} ${location}`) ? 'lab' : 'lecture';

    for (const day of dayValues) {
      entries.push({
        id: makeId(),
        title,
        subject_code: subjectCode.trim(),
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        location: location.trim(),
        professor: professor.trim(),
        type,
        needsReview: false,
        selected: true,
      });
    }
  };

  if (headerIndex >= 0) {
    const headers = rows[headerIndex].map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ''));
    const findColumn = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header));
    const dayColumn = findColumn(/^(?:day|days|dayofweek|weekday|weekdays|scheduleday|classday)$/);
    const startColumn = findColumn(/^(?:start|starttime|from|begins|beginning)$/);
    const endColumn = findColumn(/^(?:end|endtime|until|to|finishes)$/);
    const timeColumn = findColumn(/^(?:time|timerange|classtime|schedule|period)$/);
    const titleColumn = findColumn(/^(?:title|coursetitle|coursename|subjectname|classname|course|subject|class|description)$/);
    const codeColumn = findColumn(/^(?:coursecode|subjectcode|code)$/);
    const locationColumn = findColumn(/^(?:room|roomno|roomnumber|location|venue|building)$/);
    const professorColumn = findColumn(/^(?:professor|instructor|teacher|lecturer)$/);

    for (const row of rows.slice(headerIndex + 1)) {
      let timeRange = timeColumn >= 0 ? row[timeColumn] || '' : '';
      if (!timeRange && startColumn >= 0 && endColumn >= 0) {
        const start = row[startColumn] || '';
        const end = row[endColumn] || '';
        if (start && end) timeRange = `${start} - ${end}`;
      }
      if (!timeRange) timeRange = row.find((cell) => timeRangeRegex.test(cell)) || '';

      const dayValues = dayColumn >= 0
        ? daysFromDelimitedValue(row[dayColumn] || '', true)
        : [];
      const title = titleColumn >= 0 ? row[titleColumn] || '' : '';
      const code = codeColumn >= 0 ? row[codeColumn] || '' : '';
      const location = locationColumn >= 0 ? row[locationColumn] || '' : '';
      const professor = professorColumn >= 0 ? row[professorColumn] || '' : '';
      if (dayValues.length && timeRange) {
        addEntry(title, dayValues, timeRange, code, location, professor);
      }
    }

    if (dayColumns.size > 0) {
      const timeColumn = headers.findIndex((header, index) =>
        !dayColumns.has(index) && /^(?:time|timerange|classtime|schedule|period|hours?)$/.test(header)
      );
      for (const row of rows.slice(headerIndex + 1)) {
        const splitTimeRange = startColumn >= 0 && endColumn >= 0 && row[startColumn] && row[endColumn]
          ? `${row[startColumn]} - ${row[endColumn]}`
          : '';
        const timeRange = (timeColumn >= 0 ? row[timeColumn] : '') ||
          splitTimeRange ||
          row.find((cell) => timeRangeRegex.test(cell)) || '';
        if (!timeRange) continue;

        for (const [column, day] of dayColumns) {
          const course = row[column]?.trim();
          if (course) addEntry(course, [day], timeRange);
        }
      }
    }
  }

  return entries;
}

/** Offline heuristic parser that extracts class schedule entries from text, OCR, notes, or CSV */
export function parseScheduleFromText(text: string): ExtractedEntry[] {
  if (!text || !text.trim()) return [];
  const delimitedEntries = parseDelimitedSchedule(text);
  if (delimitedEntries.length > 0) return delimitedEntries;

  const tableFallbackEntries = parseTableLikeScheduleText(text);
  if (tableFallbackEntries.length > 0) return tableFallbackEntries;

  const clockLabelEntries = parseClockLabelScheduleText(text);
  if (clockLabelEntries.length > 0) return clockLabelEntries;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results: ExtractedEntry[] = [];

  const timeRegex = /\b(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\b/i;
  const courseCodeRegex = /\b([A-Z]{2,6}\s*[-#]?\s*\d{1,4}[A-Za-z]?)\b/;
  const roomRegex = /\b(Room|Rm\.?|Hall|Building|Bldg\.?|Lab|CL|Audio-Visual|AVR|ComLab)\s*([A-Za-z0-9\-]+)\b/i;
  const profRegex = /\b(Prof\.?|Dr\.?|Engr\.?|Instructor|Sir|Ma'am|Ms\.?|Mr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i;

  const dayPatterns: { regex: RegExp; days: number[] }[] = [
    { regex: /\b(m-w-f|mwf|m\/w\/f|m\s*w\s*f)\b/i, days: [1, 3, 5] },
    { regex: /\b(t-th|tth|t\/th|t\s*th|tuth)\b/i, days: [2, 4] },
    { regex: /\b(m-th|mth|mtwth)\b/i, days: [1, 2, 3, 4] },
    { regex: /\b(m-f|mf|mtwtf|daily)\b/i, days: [1, 2, 3, 4, 5] },
    { regex: /\b(w-f|wf)\b/i, days: [3, 5] },
    { regex: /\b(th-f-s|thfs)\b/i, days: [4, 5, 6] },
    { regex: /\b(f-s|fs)\b/i, days: [5, 6] },
    { regex: /\b(monday|mon)\b/i, days: [1] },
    { regex: /\b(tuesday|tues|tue)\b/i, days: [2] },
    { regex: /\b(wednesday|wed)\b/i, days: [3] },
    { regex: /\b(thursday|thurs|thur|thu|th)\b/i, days: [4] },
    { regex: /\b(friday|fri)\b/i, days: [5] },
    { regex: /\b(saturday|sat)\b/i, days: [6] },
    { regex: /\b(sunday|sun)\b/i, days: [0] },
  ];

  let currentBlockDays: number[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase().trim();

    // Check day block headers
    if (lower === 'monday' || lower === 'mon' || lower.startsWith('monday:') || lower.startsWith('mon:')) {
      currentBlockDays = [1];
      continue;
    }
    if (lower === 'tuesday' || lower === 'tue' || lower.startsWith('tuesday:') || lower.startsWith('tue:')) {
      currentBlockDays = [2];
      continue;
    }
    if (lower === 'wednesday' || lower === 'wed' || lower.startsWith('wednesday:') || lower.startsWith('wed:')) {
      currentBlockDays = [3];
      continue;
    }
    if (lower === 'thursday' || lower === 'thu' || lower.startsWith('thursday:') || lower.startsWith('thu:')) {
      currentBlockDays = [4];
      continue;
    }
    if (lower === 'friday' || lower === 'fri' || lower.startsWith('friday:') || lower.startsWith('fri:')) {
      currentBlockDays = [5];
      continue;
    }
    if (lower === 'saturday' || lower === 'sat' || lower.startsWith('saturday:') || lower.startsWith('sat:')) {
      currentBlockDays = [6];
      continue;
    }
    if (lower === 'sunday' || lower === 'sun' || lower.startsWith('sunday:') || lower.startsWith('sun:')) {
      currentBlockDays = [0];
      continue;
    }

    const timeMatch = line.match(timeRegex);
    if (!timeMatch) continue;

    const rawEnd = timeMatch[2];
    const peerHasPM = rawEnd.toUpperCase().includes('PM');
    const startTime = parseAndNormalizeTime(timeMatch[1], peerHasPM);
    const endTime = parseAndNormalizeTime(rawEnd, false);

    const explicitLineDays = daysFromDelimitedValue(line);
    let matchedDays: number[] = explicitLineDays.length > 0 ? explicitLineDays : currentBlockDays || [];
    if (explicitLineDays.length === 0) {
      for (const pattern of dayPatterns) {
        if (pattern.regex.test(line)) {
          matchedDays = pattern.days;
          break;
        }
      }
    }
    if (matchedDays.length === 0) continue;

    const codeMatch = line.match(courseCodeRegex);
    const subjectCode = codeMatch ? codeMatch[1].replace(/\s+/g, ' ').toUpperCase() : '';

    const roomMatch = line.match(roomRegex);
    const location = roomMatch ? `${roomMatch[1]} ${roomMatch[2]}` : '';

    const profMatch = line.match(profRegex);
    const professor = profMatch ? `${profMatch[1]} ${profMatch[2]}` : '';

    let title = line
      .replace(timeRegex, '')
      .replace(roomRegex, '')
      .replace(profRegex, '')
      .replace(/[|•,–—-]/g, ' ')
      .trim();

    // Check if title is on previous line
    if ((!title || title.length < 3) && i > 0) {
      const prevLine = lines[i - 1].replace(roomRegex, '').replace(profRegex, '').trim();
      if (prevLine && !timeRegex.test(prevLine) && prevLine.length >= 3 && prevLine.length <= 60) {
        title = prevLine;
      }
    }

    if (!title || title.length < 3 || title.length > 100 ||
      /\b(?:class schedule|academic year|first semester|second semester|university|college|accredited|email address|website)\b/i.test(title)) {
      continue;
    }

    const type = line.toLowerCase().includes('lab') ? 'lab' : 'lecture';

    for (const d of matchedDays) {
      results.push({
        id: makeId(),
        title,
        subject_code: subjectCode,
        day_of_week: d,
        start_time: startTime,
        end_time: endTime,
        location,
        professor,
        type,
        needsReview: false,
        selected: true,
      });
    }
  }

  return results;
}

function parseClockLabelScheduleText(text: string): ExtractedEntry[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const clockLine = /^((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?)(?:\s+(.+))?$/i;
  const professorPattern = /\b(?:prof\.?|dr\.?|engr\.?|mr\.?|mrs\.?|ms\.?|sir|ma['’]?am)\s*[\w.]+(?:\s+[\w.]+){0,2}/gi;
  const locationPattern = /\b(?:room|rm\.?|building|bldg\.?)\s*[:#-]?\s*[A-Za-z0-9.-]+|\b(?:com\.?lab|avr)\b|\blab(?:\s+[A-Za-z0-9.-]+)?\b/gi;
  const dayPatterns: { pattern: RegExp; day: number }[] = [
    { pattern: /\b(?:sunday|sun)\b/i, day: 0 },
    { pattern: /\b(?:monday|mon)\b/i, day: 1 },
    { pattern: /\b(?:tuesday|tues|tue)\b/i, day: 2 },
    { pattern: /\b(?:wednesday|wed)\b/i, day: 3 },
    { pattern: /\b(?:thursday|thurs|thur|thu)\b/i, day: 4 },
    { pattern: /\b(?:friday|fri)\b/i, day: 5 },
    { pattern: /\b(?:saturday|sat)\b/i, day: 6 },
  ];
  const slots: { time: string; details: string[]; day?: number }[] = [];
  let currentDay: number | undefined;

  for (const line of lines) {
    const dayMatch = dayPatterns.find(({ pattern }) => pattern.test(line));
    if (dayMatch) currentDay = dayMatch.day;

    const match = line.match(clockLine);
    if (!match || !match[1].includes(':')) {
      if (slots.length > 0) slots[slots.length - 1].details.push(line);
      continue;
    }

    slots.push({
      time: match[1],
      details: match[2] ? [match[2]] : [],
      day: currentDay,
    });
  }

  if (slots.length === 0 || !slots.some((slot) => slot.details.length > 0)) return [];

  const entries: ExtractedEntry[] = [];
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    const details = slot.details.join(' ').replace(/\s+/g, ' ').trim();
    const code = details.match(/\b[A-Z]{2,6}\s*[-#]?\s*\d{2,5}[A-Za-z]?\b/)?.[0]?.replace(/\s+/g, ' ').toUpperCase() || '';
    const professor = [...details.matchAll(professorPattern)].map(([name]) => name).join(', ');
    const location = [...details.matchAll(locationPattern)].map(([place]) => place).join(', ');
    const title = details
      .replace(professorPattern, ' ')
      .replace(locationPattern, ' ')
      .replace(/\b(?:lecture|tutorial|class|period|session)\b/gi, ' ')
      .replace(code, ' ')
      .replace(/[|,;:•_-]+/g, ' ')
      .replace(/[()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,;:]+$/, '');
    const entryTitle = [code, title].filter(Boolean).join(' ').trim();
    if (entryTitle.length < 3 || /\b(?:class schedule|academic year|semester|university|college)\b/i.test(entryTitle)) continue;

    const startTime = parseAndNormalizeTime(slot.time);
    const nextSlot = slots[index + 1];
    let endTime = nextSlot ? parseAndNormalizeTime(nextSlot.time) : '';
    const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
    let endMinutes = endTime ? Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5)) : 0;
    if (!endTime || endMinutes <= startMinutes) {
      endMinutes = startMinutes + 60;
      endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    }

    entries.push({
      id: makeId(),
      title: entryTitle,
      subject_code: code,
      day_of_week: slot.day ?? 1,
      start_time: startTime,
      end_time: endTime,
      location,
      professor,
      type: /lab/i.test(details) ? 'lab' : 'lecture',
      needsReview: true,
      reviewReason: slot.day === undefined
        ? 'Confirm the day and time; OCR did not identify a weekday'
        : 'Please verify details against the timetable photo',
      selected: false,
    });
  }

  return entries;
}

function parseTableLikeScheduleText(text: string): ExtractedEntry[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries: ExtractedEntry[] = [];
  const timeRangeRegex = /\b((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|to)\s*((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i;
  const courseCodeRegex = /\b[A-Z]{2,6}\s*[-#]?\s*\d{2,5}[A-Za-z]?\b/g;
  const dayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    tues: 2,
    wed: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    fri: 5,
    sat: 6,
  };

  let currentDay: number | null = null;

  const parseDaysFromValue = (value: string): number[] => {
    const valueLower = value.toLowerCase();
    const matches: number[] = [];
    for (const [word, day] of Object.entries(dayMap)) {
      if (valueLower.includes(word)) matches.push(day);
    }
    if (matches.length > 0) return [...new Set(matches)];
    return [];
  };

  for (const line of lines) {
    const rawDays = parseDaysFromValue(line);
    if (rawDays.length > 0) {
      currentDay = rawDays[0];
    }

    const timeMatch = line.match(timeRangeRegex);
    if (!timeMatch) continue;

    const candidateText = line.replace(timeRangeRegex, ' ').replace(/\s+/g, ' ').trim();
    const courseMatches = [...candidateText.matchAll(courseCodeRegex)].map((match) => match[0].replace(/\s+/g, ' ').trim());
    const subjectCode = courseMatches[0] || '';

    const titleCandidate = candidateText
      .replace(new RegExp(subjectCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
      .replace(/\b(?:room|rm|lab|lecture|tutorial|class|period|session)\b/gi, ' ')
      .replace(/[|,;:•_-]+/g, ' ')
      .replace(/[()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const title = titleCandidate && titleCandidate.length > 2 ? titleCandidate : (subjectCode || 'Class Session');
    const days = rawDays.length > 0 ? rawDays : (currentDay !== null ? [currentDay] : []);
    if (days.length === 0) continue;

    const peerIsPM = /p\.?m\.?/i.test(timeMatch[2]);
    const startTime = parseAndNormalizeTime(timeMatch[1], peerIsPM);
    const endTime = parseAndNormalizeTime(timeMatch[2]);
    const location = candidateText.match(/\b(?:room|rm|lab|building|hall|bldg|comlab|avr)\s*[:#-]?\s*[A-Za-z0-9.-]+/i)?.[0] || '';
    const type = /lab/i.test(`${title} ${location}`) ? 'lab' : 'lecture';

    for (const day of days) {
      entries.push({
        id: makeId(),
        title,
        subject_code: subjectCode,
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        location,
        professor: '',
        type,
        needsReview: true,
        reviewReason: 'Please verify details against the timetable photo',
        selected: true,
      });
    }
  }

  return entries;
}

function parseOcrScheduleFromText(text: string): ExtractedEntry[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const timeRangeRegex = /\b((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|to)\s*((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i;
  const entries: ExtractedEntry[] = [];
  let currentDay: number | null = null;

  const inferredDay = (value: string): number | null => {
    const patterns: { regex: RegExp; day: number }[] = [
      { regex: /\b(?:sunday|sun)\b/i, day: 0 },
      { regex: /\b(?:monday|mon)\b/i, day: 1 },
      { regex: /\b(?:tuesday|tues|tue)\b/i, day: 2 },
      { regex: /\b(?:wednesday|wed)\b/i, day: 3 },
      { regex: /\b(?:thursday|thurs|thur|thu)\b/i, day: 4 },
      { regex: /\b(?:friday|fri)\b/i, day: 5 },
      { regex: /\b(?:saturday|sat)\b/i, day: 6 },
    ];
    return patterns.find(({ regex }) => regex.test(value))?.day ?? null;
  };

  const cleanClassDetails = (value: string) => {
    const professor = value.match(/\b(?:prof\.?|dr\.?|engr\.?|mr\.?|mrs\.?|ms\.?|sir|ma['’]?am)\s*[\w.]+(?:\s+[\w.]+){0,2}/i)?.[0] || '';
    const location = value.match(/\b(?:room|rm\.?)\s*[\w.-]+|\b(?:com\.?lab|avr)\b|\blab\.?\b/i)?.[0] || '';
    const title = value
      .replace(/\b(?:prof\.?|dr\.?|engr\.?|mr\.?|mrs\.?|ms\.?|sir|ma['’]?am)\s*[\w.]+(?:\s+[\w.]+){0,2}/gi, ' ')
      .replace(/\b(?:room|rm\.?)\s*[\w.-]+|\b(?:com\.?lab|avr)\b|\blab\.?\b/gi, ' ')
      .replace(/\b(?:m-w-f|mwf|m\/w\/f|t-th|tth|t\/th|tuth|m-th|mtwth|m-f|mtwtf|daily)\b/gi, ' ')
      .replace(/\b(?:sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/gi, ' ')
      .replace(/[|,;:•_-]+/g, ' ')
      .replace(/[()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+\./g, '.')
      .replace(/\.+$/, '')
      .trim();
    return { title, professor, location };
  };

  for (const line of lines) {
    const dayHeader = line.match(/^(Sunday|Sun|Monday|Mon|Tuesday|Tue|Wednesday|Wed|Thursday|Thu|Friday|Fri|Saturday|Sat)\s*:?\s*$/i);
    if (dayHeader) {
      currentDay = inferredDay(dayHeader[1]);
      continue;
    }

    const range = line.match(timeRangeRegex);
    if (!range) continue;

    const day = inferredDay(line) ?? currentDay;
    if (day === null) continue;

    const details = cleanClassDetails(line.replace(timeRangeRegex, ' '));
    if (
      details.title.length < 3 ||
      details.title.length > 100 ||
      /\b(?:class schedule|academic year|first semester|second semester|university|college|accredited|email address|website)\b/i.test(details.title)
    ) continue;

    const code = details.title.match(/\b([A-Z]{2,6}\s*[-#]?\s*\d{1,4}[A-Za-z]?)\b/i)?.[1] || '';
    const peerIsPM = /p\.?m\.?/i.test(range[2]);
    entries.push({
      id: makeId(),
      title: details.title,
      subject_code: code,
      day_of_week: day,
      start_time: parseAndNormalizeTime(range[1], peerIsPM),
      end_time: parseAndNormalizeTime(range[2]),
      location: details.location,
      professor: details.professor,
      type: /lab/i.test(`${details.title} ${details.location}`) ? 'lab' : 'lecture',
      needsReview: true,
      reviewReason: 'Please verify details against the timetable photo',
      selected: false,
    });
  }

  return entries;
}

/** Parses and validates JSON responses from Gemini timetable extractor */
export function parseAndValidateAiSchedule(rawAiResponse: string): ExtractedEntry[] {
  if (!rawAiResponse || !rawAiResponse.trim()) return [];
  let jsonStr = rawAiResponse.trim();

  const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  } else {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.warn('[AI Schedule] JSON parse error:', err);
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results: ExtractedEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;

    const subjectCode = String(raw.subject_code || raw.subjectCode || raw.code || '').trim();
    let title = String(raw.title || raw.subjectName || raw.subject_name || raw.name || raw.course || '').trim();
    if (!title && subjectCode) {
      title = subjectCode;
    }
    if (!title) {
      title = 'Class Session';
    }

    const rawDay = raw.day_of_week ?? raw.day ?? raw.days;
    const parseAiDay = (value: unknown): number[] => {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) {
        return [value];
      }
      if (typeof value !== 'string') return [];
      const cleanValue = value.trim();
      if (/^[0-6]$/.test(cleanValue)) return [Number(cleanValue)];
      return daysFromDelimitedValue(cleanValue, true);
    };
    const days = Array.isArray(rawDay)
      ? [...new Set(rawDay.flatMap(parseAiDay))]
      : parseAiDay(rawDay);

    const rawStart = String(raw.start_time || raw.startTime || raw.time || '').trim();
    const rawEnd = String(raw.end_time || raw.endTime || '').trim();
    const timePattern = /^(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)?$/i;
    if (days.length === 0 || !timePattern.test(rawStart) || !timePattern.test(rawEnd)) continue;

    const peerIsPM = /p\.?m\.?/i.test(rawEnd);
    const startTime = parseAndNormalizeTime(rawStart, peerIsPM);
    const endTime = parseAndNormalizeTime(rawEnd);
    if (startTime === endTime) continue;

    const needsReview = Boolean(raw.needsReview);
    const reviewReason = needsReview ? 'Please verify details against the timetable photo' : '';

    const location = String(raw.location || raw.room || raw.roomNumber || '').trim();
    const professor = String(raw.professor || raw.instructor || raw.teacher || '').trim();

    const rawType = String(raw.type || '').toLowerCase();
    const type: typeof SCHEDULE_TYPES[number] = SCHEDULE_TYPES.includes(rawType as typeof SCHEDULE_TYPES[number])
      ? (rawType as typeof SCHEDULE_TYPES[number])
      : location.toLowerCase().includes('lab') || title.toLowerCase().includes('lab')
      ? 'lab'
      : 'lecture';

    for (const d of days) {
      results.push({
        id: makeId(),
        title,
        subject_code: subjectCode,
        day_of_week: d,
        start_time: startTime,
        end_time: endTime,
        location,
        professor,
        type,
        needsReview,
        reviewReason: reviewReason || undefined,
        selected: true,
      });
    }
  }

  return results;
}

/** Interprets timetable text using Gemini AI structure recognition */
async function interpretTimetableTextWithAI(
  timetableText: string,
  options?: { model?: string; timeoutMs?: number; imageBase64?: string; imageMimeType?: string }
): Promise<{ entries: ExtractedEntry[]; modelUsed?: string; error?: string }> {
  try {
    const geminiModule = await import('@/ai/gemini').catch(() => null);
    if (!geminiModule || typeof geminiModule.generateContent !== 'function') {
      return { entries: [], error: 'Gemini module unavailable.' };
    }

    const imageInstructions = options?.imageBase64
      ? `\nThe original timetable photo is attached. Inspect its row and column layout directly; use OCR text only as a reading aid. Map each course cell to the day and time shown by its row and column headers. Do not assign a course to a neighboring time or infer a weekday that is not visible. Exclude any session whose day or time cannot be read.\n`
      : '';
    const prompt = `You are an expert academic timetable and class schedule analyzer.
${options?.imageBase64
    ? 'Analyze the attached timetable image directly. The image is the source of truth; OCR text may be empty or inaccurate.'
    : 'Analyze the following timetable text extracted from a student schedule document.'}
Timetables often present days in columns or headers (Monday-Sunday), class time slots (e.g. "8:00 - 9:30 AM", "13:00 - 15:00", "08:00 to 10:00"), course titles, subject codes (e.g. "IT 101", "CS 202", "MATH 101"), room numbers/locations (e.g. "Lab 1", "Room 304", "AVR"), and instructor/professor names.
${imageInstructions}
For a grid, read the day from the column header and the time from the row label for each occupied course cell. Ignore institution headers, semester labels, empty cells, and non-class text. Only return entries whose course, day, start time, and end time can each be read from the image or text; never guess missing details.
If a class meets on multiple days (such as "MWF 08:00-09:30" or "TTH 1:00-2:30 PM"), generate a separate item for EACH individual day so the full weekly schedule is covered.
Convert all times into 24-hour "HH:mm" format (e.g. "08:00", "13:30").
Do not invent missing subject names or times. If an item is uncertain, flag "needsReview": true.
Map day of week to integer: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.

Extracted Timetable Text (may be empty when reading an image):
"""
${timetableText}
"""

Return ONLY a valid JSON array of objects with this schema:
[
  {
    "title": "Subject Name or Course Title",
    "subject_code": "Subject Code (e.g. IT 101)",
    "day_of_week": 1,
    "start_time": "08:00",
    "end_time": "09:30",
    "location": "Room, Lab, or Building if mentioned",
    "professor": "Instructor Name if mentioned",
    "type": "lecture",
    "needsReview": false
  }
]
Output strictly the JSON array without any markdown formatting, backticks, or explanation.`;

    const result = await geminiModule.generateContent({
      prompt,
      model: options?.model,
      timeoutMs: options?.timeoutMs,
      imageBase64: options?.imageBase64,
      imageMimeType: options?.imageMimeType,
    });
    const entries = parseAndValidateAiSchedule(result.text);
    return { entries, modelUsed: result.modelUsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[AI Schedule] interpretTimetableTextWithAI error:', msg);
    return { entries: [], error: msg };
  }
}

export default function ScanScheduleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const { createSchedule, createSubject, subjects, schedules, activePeriod, academicPeriods } = useStudy();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanStage, setScanStage] = useState<ScanStage>('idle');
  const [entries, setEntries] = useState<ExtractedEntry[]>([]);
  const [lastScanFile, setLastScanFile] = useState<FileReadResult | null>(null);
  const [editingEntry, setEditingEntry] = useState<ExtractedEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [targetPeriodId, setTargetPeriodId] = useState<string>(activePeriod?.id || '');
  const [autoCreateSubjects, setAutoCreateSubjects] = useState(true);
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    if (!academicPeriods.length) {
      if (targetPeriodId) setTargetPeriodId('');
      return;
    }

    const fallbackPeriodId = activePeriod?.id || academicPeriods[0]?.id || '';
    const currentSelectionIsValid = !!targetPeriodId && academicPeriods.some((period) => period.id === targetPeriodId);

    if (!currentSelectionIsValid || (activePeriod?.id && targetPeriodId !== activePeriod.id)) {
      setTargetPeriodId(fallbackPeriodId);
    }
  }, [academicPeriods, activePeriod, targetPeriodId]);

  // Manual text paste parsing
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const addBlankEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: makeId(),
        title: '',
        subject_code: '',
        day_of_week: 1,
        start_time: '08:00',
        end_time: '09:30',
        location: '',
        professor: '',
        type: 'lecture',
        needsReview: true,
        reviewReason: 'Manually added',
        selected: true,
      },
    ]);
  };

  const addWeekdayTemplate = () => {
    const batch: ExtractedEntry[] = [
      { id: makeId(), title: 'Class Mon', subject_code: '', day_of_week: 1, start_time: '08:00', end_time: '09:30', location: '', professor: '', type: 'lecture', needsReview: true, selected: true },
      { id: makeId(), title: 'Class Tue', subject_code: '', day_of_week: 2, start_time: '08:00', end_time: '09:30', location: '', professor: '', type: 'lecture', needsReview: true, selected: true },
      { id: makeId(), title: 'Class Wed', subject_code: '', day_of_week: 3, start_time: '08:00', end_time: '09:30', location: '', professor: '', type: 'lecture', needsReview: true, selected: true },
      { id: makeId(), title: 'Class Thu', subject_code: '', day_of_week: 4, start_time: '08:00', end_time: '09:30', location: '', professor: '', type: 'lecture', needsReview: true, selected: true },
      { id: makeId(), title: 'Class Fri', subject_code: '', day_of_week: 5, start_time: '08:00', end_time: '09:30', location: '', professor: '', type: 'lecture', needsReview: true, selected: true },
    ];
    setEntries((prev) => [...prev, ...batch]);
  };

  /**
   * Unified timetable analysis handler for any file (Image, PDF, or Text).
   * Executes the 7-stage processing workflow with granular progress and error feedback.
   */
  const processUploadedFile = async (readResult: FileReadResult) => {
    if (!readResult.success) {
      setIsAnalyzing(false);
      setScanStage('error');
      setScanStatusMessage(readResult.error || 'Failed to read the selected file.');
      Alert.alert('File Read Error', readResult.error || 'The file could not be accessed.');
      return;
    }

    setIsAnalyzing(true);
    setAiUnavailable(false);
    setEntries([]);

    const { fileType, name, mimeType, base64, textContent, localUri } = readResult;
    setLastScanFile(readResult);

    // STAGE 3: Preparing image or document
    setScanStage('preparing_document');
    setScanStatusMessage(`3. Preparing ${fileType.toUpperCase()} file (${name})...`);

    // -----------------------------------------------------------------
    // CASE 1: TEXT OR CSV FILES (TXT, CSV, TSV)
    // -----------------------------------------------------------------
    if (fileType === 'text' && textContent) {
      setScanStage('extracting_text');
      setScanStatusMessage('4. Reading timetable text content...');

      const offlineEntries = parseScheduleFromText(textContent);
      if (offlineEntries.length > 0) {
        setEntries(offlineEntries);
        setScanStage('ready');
        setScanStatusMessage(
          `📄 Extracted ${offlineEntries.length} class session${offlineEntries.length > 1 ? 's' : ''} from ${name} with the local schedule parser.`
        );
        setIsAnalyzing(false);
        return;
      }

      setScanStage('analyzing_ai');
      setScanStatusMessage('5. Analyzing timetable structure with Gemini AI...');
      const aiRes = await interpretTimetableTextWithAI(textContent);

      if (aiRes.entries.length > 0) {
        setScanStage('identifying_schedules');
        setScanStatusMessage('6. Identifying class schedules and time slots...');
        setEntries(aiRes.entries);
        setScanStage('ready');
        const modelTag = aiRes.modelUsed ? ` (${aiRes.modelUsed})` : '';
        setScanStatusMessage(
          `✨ Extracted ${aiRes.entries.length} class session${aiRes.entries.length > 1 ? 's' : ''} from ${name} via Gemini AI${modelTag}!`
        );
        setIsAnalyzing(false);
        return;
      }

      setScanStage('error');
      setIsAnalyzing(false);
      setScanStatusMessage(`Could not detect class times from ${name}. You can add entries below or paste timetable text.`);
      return;
    }

    // -----------------------------------------------------------------
    // CASE 2: PDF FILES (PDF Document)
    // -----------------------------------------------------------------
    if (fileType === 'pdf') {
      let combinedPdfText = '';

      // Step 2A: Extract embedded text from PDF streams
      if (base64) {
        setScanStage('extracting_text');
        setScanStatusMessage('4. Extracting text streams from PDF document...');
        combinedPdfText = extractTextFromPdfBase64(base64);
      }

      // If embedded text found, run Gemini AI structure interpretation
      if (combinedPdfText && combinedPdfText.length >= 15) {
        const offlinePdfEntries = parseScheduleFromText(combinedPdfText);
        if (offlinePdfEntries.length > 0) {
          setEntries(offlinePdfEntries);
          setScanStage('ready');
          setScanStatusMessage(
            `📄 Extracted ${offlinePdfEntries.length} class session${offlinePdfEntries.length > 1 ? 's' : ''} from PDF with the local schedule parser.`
          );
          setIsAnalyzing(false);
          return;
        }

        setScanStage('analyzing_ai');
        setScanStatusMessage('5. Analyzing PDF timetable with Gemini AI...');
        const aiPdfTextRes = await interpretTimetableTextWithAI(combinedPdfText);

        if (aiPdfTextRes.entries.length > 0) {
          setScanStage('identifying_schedules');
          setScanStatusMessage('6. Identifying class schedules from PDF...');
          setEntries(aiPdfTextRes.entries);
          setScanStage('ready');
          const modelTag = aiPdfTextRes.modelUsed ? ` (${aiPdfTextRes.modelUsed})` : '';
          setScanStatusMessage(
            `✨ Extracted ${aiPdfTextRes.entries.length} class session${aiPdfTextRes.entries.length > 1 ? 's' : ''} from PDF via Gemini AI${modelTag}!`
          );
          setIsAnalyzing(false);
          return;
        }

      }

      // Step 2B: On-device Tesseract OCR on rendered PDF pages (handles scanned PDFs)
      if (base64 || localUri) {
        setScanStage('extracting_text');
        setScanStatusMessage('4. Rendering PDF pages with on-device OCR engine...');
        try {
          const pdfData = Platform.OS === 'android' && localUri
            ? localUri
            : base64
              ? `data:application/pdf;base64,${base64}`
              : localUri;
          const ocrPdfResult = await extractTextFromImage(pdfData, 'application/pdf');
          if (ocrPdfResult.text && ocrPdfResult.text.length >= 15) {
            const ocrParsed = parseScheduleFromText(ocrPdfResult.text);
            if (ocrParsed.length > 0) {
              setEntries(ocrParsed);
              setScanStage('ready');
              setScanStatusMessage(
                `📄 Detected ${ocrParsed.length} class session${ocrParsed.length > 1 ? 's' : ''} via PDF OCR and local parsing.`
              );
              setIsAnalyzing(false);
              return;
            }

            setScanStage('analyzing_ai');
            setScanStatusMessage('5. Interpreting OCR PDF schedule with Gemini AI...');
            const aiOcrRes = await interpretTimetableTextWithAI(ocrPdfResult.text);

            if (aiOcrRes.entries.length > 0) {
              setEntries(aiOcrRes.entries);
              setScanStage('ready');
              const modelTag = aiOcrRes.modelUsed ? ` (${aiOcrRes.modelUsed})` : '';
              setScanStatusMessage(
                `✨ Extracted ${aiOcrRes.entries.length} class session${aiOcrRes.entries.length > 1 ? 's' : ''} from PDF OCR + Gemini AI${modelTag}!`
              );
              setIsAnalyzing(false);
              return;
            }

          }
        } catch (ocrErr) {
          console.warn('[Scan] PDF OCR render warning:', ocrErr);
        }
      }

      setScanStage('error');
      setIsAnalyzing(false);
      setAiUnavailable(true);
      setScanStatusMessage(
        'Could not automatically detect class times from PDF. You can add entries below or paste timetable text.'
      );
      return;
    }

    // -----------------------------------------------------------------
    // CASE 3: IMAGE FILES (JPG, PNG, WEBP)
    // -----------------------------------------------------------------
    let ocrText = '';
    let ocrSource: 'tesseract' | 'ocr_space' | 'fallback' = 'tesseract';
    let aiTextError: string | undefined;
    let ocrError: string | undefined;

    // Step 3A: On-device Tesseract OCR (with native logs & orientation handling)
    setScanStage('extracting_text');
    setScanStatusMessage('4. Extracting timetable text with on-device Tesseract OCR...');
    try {
      const imageData = Platform.OS === 'android' && localUri
        ? localUri
        : base64
          ? `data:${mimeType};base64,${base64}`
          : localUri;
      const ocrResult = await extractTextFromImage(imageData || '', mimeType);
      ocrText = ocrResult.text.trim();
      ocrSource = ocrResult.source;
      ocrError = ocrResult.error;
    } catch (ocrErr) {
      console.warn('[Scan] Image OCR step exception:', ocrErr);
      ocrError = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
    }

    // Analyze the actual photo before falling back to OCR text heuristics.
    if (base64) {
      setScanStage('analyzing_ai');
      setScanStatusMessage(Platform.OS === 'web'
        ? '5. Preparing timetable image for Gemini AI...'
        : '5. Reading timetable rows and columns from the photo with Gemini AI...');
      let aiImage: { base64: string; mimeType: string };
      try {
        aiImage = await prepareImageForAi(base64, mimeType);
      } catch (error) {
        aiTextError = error instanceof Error ? error.message : String(error);
        aiImage = { base64: '', mimeType };
      }
      const aiTextResult = aiImage.base64
        ? await interpretTimetableTextWithAI(ocrText, {
            model: 'auto',
            timeoutMs: 60_000,
            imageBase64: aiImage.base64,
            imageMimeType: aiImage.mimeType,
          })
        : { entries: [], error: aiTextError };
      aiTextError = aiTextResult.error;

      if (aiTextResult.entries.length > 0) {
        setScanStage('identifying_schedules');
        setScanStatusMessage('6. Identifying class schedules and rooms...');
        setEntries(aiTextResult.entries);
        setScanStage('ready');
        const modelTag = aiTextResult.modelUsed ? ` (${aiTextResult.modelUsed})` : '';
        const sourceTag = ocrSource === 'tesseract' ? 'Tesseract OCR' : 'OCR';
        setScanStatusMessage(
          `✨ Extracted ${aiTextResult.entries.length} class session${aiTextResult.entries.length > 1 ? 's' : ''} using ${sourceTag} + Gemini AI${modelTag}!`
        );
        setIsAnalyzing(false);
        return;
      }
    }

    const scheduleParsed = ocrText ? parseScheduleFromText(ocrText) : [];
    const fallbackEntries = scheduleParsed.length > 0
      ? scheduleParsed
      : ocrText
        ? parseOcrScheduleFromText(ocrText)
        : [];
    if (fallbackEntries.length > 0) {
      const reviewEntries = fallbackEntries.map((entry) => ({
        ...entry,
        needsReview: true,
        reviewReason: entry.reviewReason || 'Please verify details against the timetable photo',
        selected: false,
      }));
      setEntries(reviewEntries);
      setScanStage('ready');
      setAiUnavailable(Boolean(aiTextError));
      setScanStatusMessage(
        aiTextError
          ? `📷 AI photo analysis failed; OCR found ${reviewEntries.length} possible class session${reviewEntries.length > 1 ? 's' : ''} with explicit times. Verify each detail and select entries to import.`
          : `📷 Photo OCR found ${reviewEntries.length} possible class session${reviewEntries.length > 1 ? 's' : ''}. Please verify every detail.`
      );
      setIsAnalyzing(false);
      return;

    }

    // All automatic detection methods failed
    setIsAnalyzing(false);
    setAiUnavailable(true);

    if (!ocrText) {
      setScanStage('error');
      setScanStatusMessage(aiTextError
        ? `Could not analyze the timetable image: ${aiTextError} ${ocrError ? `Photo OCR also failed: ${ocrError}` : ''}`
        : 'No class sessions could be read from this image. Try a closer, higher-resolution photo focused on the timetable grid, or paste the timetable text below.');
    } else {
      if (ocrText && aiTextError) {
        setScanStage('ready');
        setPastedText(ocrText);
        setShowPasteModal(true);
        setScanStatusMessage(
          `Photo OCR succeeded, but schedule interpretation could not connect to Gemini: ${aiTextError} The extracted text is open for you to review or correct.`
        );
      } else {
        setScanStage('error');
        setScanStatusMessage(
          'Could not automatically detect class times. You can add entries below or paste timetable text.'
        );
      }
    }
  };

  const handlePickImage = async () => {
    setScanStage('selecting_file');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) {
      setScanStage('idle');
      return;
    }
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setScanStage('reading_file');
    setScanStatusMessage('2. Reading selected photo...');

    const readResult = await readTimetableFile({
      uri: asset.uri,
      name: asset.fileName || 'gallery_schedule.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
      fileSize: asset.fileSize,
      includeBase64: true,
    });
    await processUploadedFile(readResult);
  };

  const handleTakePhoto = async () => {
    setScanStage('selecting_file');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setScanStage('idle');
      Alert.alert('Camera Permission', 'Camera access is required to photograph your schedule.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled || !result.assets[0]) {
      setScanStage('idle');
      return;
    }
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setScanStage('reading_file');
    setScanStatusMessage('2. Reading captured photo...');

    const readResult = await readTimetableFile({
      uri: asset.uri,
      name: asset.fileName || 'camera_schedule.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
      fileSize: asset.fileSize,
      includeBase64: true,
    });
    await processUploadedFile(readResult);
  };

  const handlePickDocument = async () => {
    try {
      setScanStage('selecting_file');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'text/*', 'application/json'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setScanStage('idle');
        return;
      }

      const asset = result.assets[0];
      setImageUri(asset.mimeType?.startsWith('image/') ? asset.uri : null);
      setScanStage('reading_file');
      setScanStatusMessage(`2. Reading file: ${asset.name || 'document'}...`);

      const readResult = await readTimetableFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        file: (asset as { file?: unknown }).file,
        includeBase64: Platform.OS === 'web' || !asset.mimeType?.startsWith('image/'),
      });

      await processUploadedFile(readResult);
    } catch (err) {
      setScanStage('error');
      const msg = err instanceof Error ? err.message : String(err);
      setScanStatusMessage(`File selection failed: ${msg}`);
      addBlankEntry();
    }
  };

  // Auto trigger based on route parameter
  useEffect(() => {
    const timer = setTimeout(() => {
      if (params.source === 'camera') {
        void handleTakePhoto();
      } else if (params.source === 'file') {
        void handlePickDocument();
      } else if (params.source === 'gallery') {
        void handlePickImage();
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.source]);

  const handleApplyPastedText = () => {
    if (!pastedText.trim()) return;
    const parsed = parseScheduleFromText(pastedText);
    if (parsed.length > 0) {
      setEntries((prev) => [...prev, ...parsed]);
      setShowPasteModal(false);
      setPastedText('');
      Alert.alert('Extracted!', `Found ${parsed.length} class session${parsed.length > 1 ? 's' : ''} from text.`);
    } else {
      Alert.alert(
        'No Schedule Found',
        'Could not detect day and time ranges (e.g. "Mon 08:00 - 09:30 CS101 Room 304"). You can add entries manually below.'
      );
    }
  };

  const updateEntry = (id: string, changes: Partial<ExtractedEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes, needsReview: false } : e)));
  };

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));
  const toggleEntry = (id: string) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e)));

  // Overlap and Duplicate Detection
  const getConflictWarning = (entry: ExtractedEntry) => {
    if (!entry.start_time || !entry.end_time || entry.day_of_week < 0) return null;

    // Check duplicate in database
    const isDuplicate = schedules.some(
      (s) =>
        s.day_of_week === entry.day_of_week &&
        s.start_time === entry.start_time &&
        (s.title.toLowerCase() === entry.title.toLowerCase() ||
          (entry.subject_code && s.title.toLowerCase().includes(entry.subject_code.toLowerCase())))
    );
    if (isDuplicate) {
      return { type: 'duplicate', message: 'Already exists in your timetable' };
    }

    const toMinutes = (timeStr: string) => {
      const parts = (timeStr || '00:00').split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };
    const eStart = toMinutes(entry.start_time);
    const eEnd = toMinutes(entry.end_time);

    const overlapping = schedules.find((s) => {
      if (s.day_of_week !== entry.day_of_week) return false;
      const sStart = toMinutes(s.start_time);
      const sEnd = toMinutes(s.end_time);
      return eStart < sEnd && eEnd > sStart;
    });

    if (overlapping) {
      return {
        type: 'overlap',
        message: `Overlaps with ${overlapping.title} (${overlapping.start_time}–${overlapping.end_time})`,
      };
    }

    return null;
  };

  const executeSave = async (toSave: ExtractedEntry[]) => {
    setIsSaving(true);
    let importedCount = 0;
    let subjectCreationFailures = 0;
    try {
      const periodId = targetPeriodId || activePeriod?.id || academicPeriods[0]?.id;
      if (!periodId) {
        showError('No academic period selected', 'Create or select an academic period before importing your timetable.');
        return;
      }

      let createdSubjectsCount = 0;

      for (const e of toSave) {
        let matchedSub = subjects.find(
          (s) =>
            (e.subject_code && s.code.toLowerCase() === e.subject_code.toLowerCase()) ||
            s.name.toLowerCase() === e.title.toLowerCase()
        );

        if (!matchedSub && autoCreateSubjects) {
          try {
            matchedSub = await createSubject({
              name: e.title.trim(),
              code: e.subject_code.trim() || e.title.slice(0, 8).toUpperCase(),
              color: '#4F46E5',
              professor: e.professor,
              room: e.location,
              period_id: periodId,
            });
            createdSubjectsCount++;
          } catch (error) {
            subjectCreationFailures++;
            console.warn('[Schedule Import] Could not create subject:', error);
          }
        }

        await createSchedule({
          subject_id: matchedSub?.id,
          period_id: periodId,
          title: e.title.trim(),
          day_of_week: e.day_of_week >= 0 && e.day_of_week <= 6 ? e.day_of_week : 1,
          start_time: e.start_time || '08:00',
          end_time: e.end_time || '09:30',
          location: e.location.trim(),
          type: e.type,
        });
        importedCount++;
      }

      const extraMsg = createdSubjectsCount > 0 ? ` and created ${createdSubjectsCount} new subject(s)` : '';
      const subjectWarning = subjectCreationFailures > 0
        ? ` ${subjectCreationFailures} subject(s) could not be created and may need to be linked manually.`
        : '';
      showSuccess(
        'Schedule Imported!',
        `Successfully added ${importedCount} class session${importedCount !== 1 ? 's' : ''}${extraMsg} to your timetable.${subjectWarning}`
      );
      router.push('/schedule');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showError(
        'Import Failed',
        importedCount > 0
          ? `Added ${importedCount} of ${toSave.length} class sessions before the import stopped. ${reason}`
          : `Could not save the selected class sessions. ${reason}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = () => {
    const toSave = entries.filter((e) => e.selected && e.title.trim());
    if (toSave.length === 0) {
      showMessage('Nothing to Import', 'Select at least one schedule entry with a title.');
      return;
    }

    const duplicates = toSave.filter((e) => getConflictWarning(e)?.type === 'duplicate');
    const overlaps = toSave.filter((e) => getConflictWarning(e)?.type === 'overlap');
    const needsReview = toSave.filter((e) => e.needsReview);

    if (duplicates.length > 0 || overlaps.length > 0 || needsReview.length > 0) {
      let warningText = `You are importing ${toSave.length} class session(s).\n\n`;
      if (duplicates.length > 0) warningText += `• ${duplicates.length} duplicate(s) already exist in your timetable.\n`;
      if (overlaps.length > 0) warningText += `• ${overlaps.length} session(s) overlap with current class times.\n`;
      if (needsReview.length > 0) warningText += `• ${needsReview.length} session(s) have unverified details.\n`;
      warningText += '\nDo you want to confirm and import?';

      confirmAction(
        'Confirm Schedule Import',
        warningText,
        'Import Anyway',
        () => executeSave(toSave)
      );
    } else {
      confirmAction(
        'Confirm Import',
        `Save ${toSave.length} class session${toSave.length > 1 ? 's' : ''} to your StudyTrac timetable?`,
        'Confirm & Import',
        () => executeSave(toSave)
      );
    }
  };

  const th = theme;

  const filteredEntries =
    selectedDayFilter === 'all' ? entries : entries.filter((e) => e.day_of_week === selectedDayFilter);

  const daysPresent = Array.from(new Set(entries.map((e) => e.day_of_week))).sort((a, b) => a - b);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: th.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={th.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: th.text, textAlign: 'center' }}>
          Scan Class Schedule
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={{ color: th.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
        Upload or photograph your timetable (PDF, image, or CSV/TXT). Uses local OCR and schedule parsing first; Gemini is used only when needed.
      </Text>

      {/* Primary Input Actions */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={handlePickImage}
          style={{ flex: 1, backgroundColor: '#0EA5E9', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="images-outline" size={22} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>Photo Gallery</Text>
        </TouchableOpacity>

        {Platform.OS !== 'web' && (
          <TouchableOpacity
            onPress={handleTakePhoto}
            style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="camera-outline" size={22} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>Camera</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handlePickDocument}
          style={{ flex: 1, backgroundColor: '#8B5CF6', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="document-outline" size={22} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>Upload File</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowPasteModal(true)}
          style={{ flex: 1, backgroundColor: '#6366F1', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="clipboard-outline" size={22} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>Paste Text</Text>
        </TouchableOpacity>
      </View>

      {/* Target Academic Period Selector */}
      <View style={{ backgroundColor: th.card, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: th.border, marginBottom: 16 }}>
        <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
          Target Academic Period:
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {academicPeriods.map((p) => {
            const isSelected = (targetPeriodId || activePeriod?.id) === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setTargetPeriodId(p.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: isSelected ? th.primary : th.cardAlt,
                  borderWidth: 1,
                  borderColor: isSelected ? th.primary : th.border,
                }}
              >
                <Text style={{ color: isSelected ? '#FFF' : th.text, fontSize: 12, fontWeight: isSelected ? '700' : '500' }}>
                  {p.semester} · {p.academic_year}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Image Preview (for images) */}
      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 16, backgroundColor: th.card }}
          resizeMode="contain"
        />
      )}

      {/* Structured Progress Stages Indicator (Phase 7) */}
      {isAnalyzing && (
        <View style={{ backgroundColor: th.card, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: th.primary, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <ActivityIndicator color={th.primary} size="small" />
            <Text style={{ color: th.text, fontSize: 14, fontWeight: '700' }}>
              {SCAN_STAGE_LABELS[scanStage] || 'Processing timetable...'}
            </Text>
          </View>
          <Text style={{ color: th.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {scanStatusMessage}
          </Text>
        </View>
      )}

      {/* Status banner */}
      {scanStatusMessage && !isAnalyzing && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            backgroundColor: entries.length > 0 ? '#10B98118' : scanStage === 'error' ? '#EF444418' : th.card,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: entries.length > 0 ? '#10B98166' : scanStage === 'error' ? '#EF444466' : th.border,
            marginBottom: 14,
          }}
        >
          <Ionicons
            name={entries.length > 0 ? 'checkmark-circle' : scanStage === 'error' ? 'alert-circle' : 'information-circle-outline'}
            size={20}
            color={entries.length > 0 ? '#10B981' : scanStage === 'error' ? '#EF4444' : th.primary}
          />
          <Text style={{ flex: 1, color: th.text, fontSize: 13, fontWeight: '500' }}>
            {scanStatusMessage}
          </Text>
        </View>
      )}

      {scanStage === 'error' && lastScanFile && (
        <TouchableOpacity
          onPress={() => void processUploadedFile(lastScanFile)}
          style={{
            alignSelf: 'flex-start',
            paddingVertical: 9,
            paddingHorizontal: 14,
            marginTop: -4,
            marginBottom: 14,
            borderRadius: 8,
            backgroundColor: th.primary,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Retry scan</Text>
        </TouchableOpacity>
      )}

      {/* AI guidance message */}
      {aiUnavailable && !isAnalyzing && (
        <View style={{ gap: 8, padding: 12, backgroundColor: th.card, borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={{ flex: 1, color: th.textSecondary, fontSize: 12, lineHeight: 17 }}>
              Tip: For high-accuracy AI scan of complex timetable grids, ensure your Gemini API key is configured in AI Settings.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/chat-settings' as Href)}
            style={{ alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, backgroundColor: th.cardAlt }}
          >
            <Text style={{ color: th.primary, fontSize: 12, fontWeight: '600' }}>Open AI Settings →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-create subjects toggle */}
      {entries.length > 0 && (
        <TouchableOpacity
          onPress={() => setAutoCreateSubjects(!autoCreateSubjects)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}
        >
          <Ionicons
            name={autoCreateSubjects ? 'checkbox' : 'square-outline'}
            size={20}
            color={autoCreateSubjects ? th.primary : th.textSecondary}
          />
          <Text style={{ color: th.text, fontSize: 13, fontWeight: '500' }}>
            Automatically create new subjects in this semester if not found
          </Text>
        </TouchableOpacity>
      )}

      {/* REVIEW & CONFIRMATION SECTION (Phase 8) */}
      {entries.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: th.text, fontWeight: '700', fontSize: 16 }}>
              Review Detected Classes ({entries.filter((e) => e.selected).length}/{entries.length})
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setEntries((prev) => prev.map((e) => ({ ...e, selected: true })))}>
                <Text style={{ color: th.primary, fontSize: 13, fontWeight: '600' }}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEntries((prev) => prev.map((e) => ({ ...e, selected: false })))}>
                <Text style={{ color: th.textSecondary, fontSize: 13, fontWeight: '600' }}>None</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setEntries((prev) =>
                    prev.map((e) => (getConflictWarning(e)?.type === 'duplicate' ? { ...e, selected: false } : e))
                  );
                }}
              >
                <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600' }}>Skip Dups</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEntries([])}>
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Day Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setSelectedDayFilter('all')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: selectedDayFilter === 'all' ? th.primary : th.cardAlt,
                borderWidth: 1,
                borderColor: selectedDayFilter === 'all' ? th.primary : th.border,
              }}
            >
              <Text
                style={{
                  color: selectedDayFilter === 'all' ? '#FFF' : th.text,
                  fontSize: 12,
                  fontWeight: selectedDayFilter === 'all' ? '700' : '500',
                }}
              >
                All Days ({entries.length})
              </Text>
            </TouchableOpacity>

            {daysPresent.map((dayNum) => {
              const dayCount = entries.filter((e) => e.day_of_week === dayNum).length;
              const isSelected = selectedDayFilter === dayNum;
              return (
                <TouchableOpacity
                  key={dayNum}
                  onPress={() => setSelectedDayFilter(dayNum)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: isSelected ? th.primary : th.cardAlt,
                    borderWidth: 1,
                    borderColor: isSelected ? th.primary : th.border,
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? '#FFF' : th.text,
                      fontSize: 12,
                      fontWeight: isSelected ? '700' : '500',
                    }}
                  >
                    {WEEKDAY_LABELS[dayNum]} ({dayCount})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Grouped Classes List */}
          {filteredEntries.map((entry) => {
            const conflict = getConflictWarning(entry);
            return (
              <View
                key={entry.id}
                style={{
                  backgroundColor: th.card,
                  borderWidth: 1,
                  borderColor: conflict
                    ? conflict.type === 'duplicate'
                      ? '#EF4444'
                      : '#F59E0B'
                    : entry.needsReview
                    ? '#F59E0B'
                    : th.border,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                  opacity: entry.selected ? 1 : 0.55,
                }}
              >
                {/* Conflict / Review Warning Badges */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {conflict && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: conflict.type === 'duplicate' ? '#EF444418' : '#F59E0B18',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}
                    >
                      <Ionicons
                        name={conflict.type === 'duplicate' ? 'alert-circle-outline' : 'warning-outline'}
                        size={13}
                        color={conflict.type === 'duplicate' ? '#EF4444' : '#F59E0B'}
                      />
                      <Text
                        style={{
                          color: conflict.type === 'duplicate' ? '#EF4444' : '#F59E0B',
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {conflict.message}
                      </Text>
                    </View>
                  )}

                  {entry.needsReview && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: '#F59E0B18',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}
                    >
                      <Ionicons name="help-circle-outline" size={13} color="#F59E0B" />
                      <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>
                        {entry.reviewReason || 'Needs manual verification'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Entry Row Content */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity onPress={() => toggleEntry(entry.id)}>
                    <Ionicons
                      name={entry.selected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={entry.selected ? th.primary : th.textSecondary}
                    />
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ color: th.text, fontWeight: '700', fontSize: 15 }}>
                        {entry.title || '(Untitled Class)'}
                      </Text>
                      {entry.subject_code ? (
                        <View style={{ backgroundColor: th.cardAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: th.primary, fontSize: 11, fontWeight: '700' }}>{entry.subject_code}</Text>
                        </View>
                      ) : null}
                      <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>
                          {entry.type.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: th.textSecondary, fontSize: 12, marginTop: 4 }}>
                      📅 {WEEKDAY_FULL_NAMES[entry.day_of_week]} · ⏰ {entry.start_time || '--:--'} – {entry.end_time || '--:--'}
                      {entry.location ? ` · 📍 ${entry.location}` : ''}
                      {entry.professor ? ` · 👤 ${entry.professor}` : ''}
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => setEditingEntry({ ...entry })} style={{ padding: 6 }}>
                    <Ionicons name="pencil-outline" size={18} color={th.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeEntry(entry.id)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Batch and Manual Add Buttons */}
      {!isAnalyzing && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={addBlankEntry}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: 13,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: th.primary,
              borderStyle: 'dashed',
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color={th.primary} />
            <Text style={{ color: th.primary, fontWeight: '600', fontSize: 13 }}>+ Single Class</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={addWeekdayTemplate}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: 13,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: '#10B981',
              borderStyle: 'dashed',
            }}
          >
            <Ionicons name="calendar-outline" size={18} color="#10B981" />
            <Text style={{ color: '#10B981', fontWeight: '600', fontSize: 13 }}>+ 5 Days Batch</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Save / Import Confirmation Button */}
      {entries.length > 0 && (
        <TouchableOpacity
          onPress={handleSaveAll}
          disabled={isSaving}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 16,
            borderRadius: 14,
            backgroundColor: th.primary,
          }}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
                Confirm & Import {entries.filter((e) => e.selected).length} Schedule{entries.filter((e) => e.selected).length !== 1 ? 's' : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Edit Entry Modal */}
      <Modal visible={!!editingEntry} transparent animationType="slide" onRequestClose={() => setEditingEntry(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <ScrollView
            style={{ backgroundColor: th.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: th.text, marginBottom: 16 }}>Edit Schedule Item</Text>
            {editingEntry && (
              <>
                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Subject Name *</Text>
                <TextInput
                  style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border, marginBottom: 10 }}
                  value={editingEntry.title}
                  onChangeText={(v) => setEditingEntry((e) => (e ? { ...e, title: v } : e))}
                  placeholder="e.g. Data Structures & Algorithms"
                  placeholderTextColor={th.textSecondary}
                />

                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Subject Code</Text>
                <TextInput
                  style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border, marginBottom: 10 }}
                  value={editingEntry.subject_code}
                  onChangeText={(v) => setEditingEntry((e) => (e ? { ...e, subject_code: v } : e))}
                  placeholder="e.g. CS 210"
                  placeholderTextColor={th.textSecondary}
                />

                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Day of Week</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setEditingEntry((e) => (e ? { ...e, day_of_week: idx } : e))}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: editingEntry.day_of_week === idx ? th.primary : th.cardAlt }}
                    >
                      <Text style={{ color: editingEntry.day_of_week === idx ? '#FFF' : th.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Start Time (HH:mm)</Text>
                    <TextInput
                      style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border }}
                      value={editingEntry.start_time}
                      onChangeText={(v) => setEditingEntry((e) => (e ? { ...e, start_time: v } : e))}
                      placeholder="08:00"
                      placeholderTextColor={th.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>End Time (HH:mm)</Text>
                    <TextInput
                      style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border }}
                      value={editingEntry.end_time}
                      onChangeText={(v) => setEditingEntry((e) => (e ? { ...e, end_time: v } : e))}
                      placeholder="09:30"
                      placeholderTextColor={th.textSecondary}
                    />
                  </View>
                </View>

                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Room / Location</Text>
                <TextInput
                  style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border, marginBottom: 10 }}
                  value={editingEntry.location}
                  onChangeText={(v) => setEditingEntry((e) => (e ? { ...e, location: v } : e))}
                  placeholder="e.g. Science Complex Rm 401"
                  placeholderTextColor={th.textSecondary}
                />

                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Professor</Text>
                <TextInput
                  style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border, marginBottom: 10 }}
                  value={editingEntry.professor}
                  onChangeText={(v) => setEditingEntry((e) => (e ? { ...e, professor: v } : e))}
                  placeholder="e.g. Prof. Alan Turing"
                  placeholderTextColor={th.textSecondary}
                />

                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Schedule Type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                  {SCHEDULE_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setEditingEntry((e) => (e ? { ...e, type: t } : e))}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: editingEntry.type === t ? th.primary : th.cardAlt }}
                    >
                      <Text style={{ color: editingEntry.type === t ? '#FFF' : th.text, fontSize: 12, fontWeight: '600' }}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setEditingEntry(null)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: th.border }}
              >
                <Text style={{ color: th.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (editingEntry) updateEntry(editingEntry.id, editingEntry);
                  setEditingEntry(null);
                }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: th.primary }}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Paste Text Modal */}
      <Modal visible={showPasteModal} transparent animationType="slide" onRequestClose={() => setShowPasteModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: th.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: th.border }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: th.text, marginBottom: 8 }}>Paste Schedule Text</Text>
            <Text style={{ color: th.textSecondary, fontSize: 12, marginBottom: 12 }}>
              Paste your timetable text from your student portal or syllabus. The offline parser will detect times, days, and courses.
            </Text>
            <TextInput
              multiline
              numberOfLines={6}
              style={{
                borderWidth: 1,
                borderColor: th.border,
                borderRadius: 10,
                padding: 12,
                color: th.text,
                backgroundColor: th.inputBackground,
                textAlignVertical: 'top',
                minHeight: 120,
                marginBottom: 16,
                fontSize: 13,
              }}
              placeholder={`Example:\nCS101 Mon 08:00 - 09:30 Room 304\nMATH201 Wed 10:00 - 11:30 Lab B`}
              placeholderTextColor={th.textSecondary}
              value={pastedText}
              onChangeText={setPastedText}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowPasteModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: th.border }}
              >
                <Text style={{ color: th.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApplyPastedText}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: th.primary }}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Parse Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
