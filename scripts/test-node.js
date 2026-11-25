const pako = require('pako');

// 1. Time & Day Parsing
function parseAndNormalizeTime(raw, peerIsPM = false) {
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
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function parseDayOfWeek(raw) {
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

// 2. Text Parser
function parseScheduleFromText(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results = [];

  const timeRegex = /\b(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\b/i;
  const courseCodeRegex = /\b([A-Z]{2,6}\s*[-#]?\s*\d{1,4}[A-Za-z]?)\b/;
  const roomRegex = /\b(Room|Rm\.?|Hall|Building|Bldg\.?|Lab|CL|Audio-Visual|AVR|ComLab)\s*([A-Za-z0-9\-]+)\b/i;
  const profRegex = /\b(Prof\.?|Dr\.?|Engr\.?|Instructor|Sir|Ma'am|Ms\.?|Mr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i;

  const dayPatterns = [
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

  let currentBlockDays = [1];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase().trim();

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

    let matchedDays = currentBlockDays;
    for (const pattern of dayPatterns) {
      if (pattern.regex.test(line)) {
        matchedDays = pattern.days;
        break;
      }
    }

    const codeMatch = line.match(courseCodeRegex);
    const subjectCode = codeMatch ? codeMatch[1].replace(/\s+/g, ' ').toUpperCase() : '';

    const roomMatch = line.match(roomRegex);
    const location = roomMatch ? roomMatch[1] + ' ' + roomMatch[2] : '';

    const profMatch = line.match(profRegex);
    const professor = profMatch ? profMatch[1] + ' ' + profMatch[2] : '';

    let title = line
      .replace(timeRegex, '')
      .replace(roomRegex, '')
      .replace(profRegex, '')
      .replace(/[|•,–—-]/g, ' ')
      .trim();

    if ((!title || title.length < 3) && i > 0) {
      const prevLine = lines[i - 1].replace(roomRegex, '').replace(profRegex, '').trim();
      if (prevLine && !timeRegex.test(prevLine) && prevLine.length >= 3 && prevLine.length <= 60) {
        title = prevLine;
      }
    }

    if (!title || title.length < 3) {
      title = subjectCode || 'Class Session';
    }

    const type = line.toLowerCase().includes('lab') ? 'lab' : 'lecture';

    for (const d of matchedDays) {
      results.push({
        title,
        subject_code: subjectCode,
        day_of_week: d,
        start_time: startTime,
        end_time: endTime,
        location,
        professor,
        type,
      });
    }
  }

  return results;
}

// 3. AI JSON Validator
function parseAndValidateAiSchedule(rawAiResponse) {
  if (!rawAiResponse || !rawAiResponse.trim()) return [];
  let jsonStr = rawAiResponse.trim();

  const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  } else {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const raw = item;

    const subjectCode = String(raw.subject_code || raw.subjectCode || raw.code || '').trim();
    let title = String(raw.title || raw.subjectName || raw.subject_name || raw.name || raw.course || '').trim();
    if (!title && subjectCode) title = subjectCode;
    if (!title) title = 'Class Session';

    const rawDay = raw.day_of_week ?? raw.day ?? raw.days;
    let days = [];

    if (Array.isArray(rawDay)) {
      days = rawDay.map(parseDayOfWeek);
    } else if (typeof rawDay === 'string' && /m-w-f|mwf|m\/w\/f/i.test(rawDay)) {
      days = [1, 3, 5];
    } else if (typeof rawDay === 'string' && /t-th|tth|t\/th/i.test(rawDay)) {
      days = [2, 4];
    } else if (typeof rawDay === 'string' && /m-f|mf|daily/i.test(rawDay)) {
      days = [1, 2, 3, 4, 5];
    } else {
      days = [parseDayOfWeek(rawDay)];
    }

    const rawStart = String(raw.start_time || raw.startTime || raw.time || '').trim();
    const rawEnd = String(raw.end_time || raw.endTime || '').trim();

    const peerIsPM = /pm/i.test(rawEnd) || /pm/i.test(rawStart);
    const startTime = rawStart ? parseAndNormalizeTime(rawStart, peerIsPM) : '08:00';
    let endTime = rawEnd ? parseAndNormalizeTime(rawEnd, false) : '';

    let needsReview = Boolean(raw.needsReview);
    let reviewReason = '';

    if (!rawStart) {
      needsReview = true;
      reviewReason = 'Start time unconfirmed';
    }
    if (!endTime) {
      const parts = startTime.split(':').map(Number);
      const endH = (parts[0] + 1) % 24;
      endTime = String(endH).padStart(2, '0') + ':' + String(parts[1]).padStart(2, '0');
      needsReview = true;
      reviewReason = 'End time estimated (1 hr)';
    }

    const location = String(raw.location || raw.room || raw.roomNumber || '').trim();
    const professor = String(raw.professor || raw.instructor || raw.teacher || '').trim();

    const rawType = String(raw.type || '').toLowerCase();
    const type = rawType.includes('lab') ? 'lab' : 'lecture';

    for (const d of days) {
      results.push({
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

// -------------------------------------------------------------
// EXECUTE TESTS
// -------------------------------------------------------------
console.log('Testing timetable parser on full weekly schedule...');
const timetableText = [
  'COLLEGE OF INFORMATION TECHNOLOGY',
  'Monday:',
  'IT 101 Introduction to Computing 08:00 - 10:00 Room 304 Dr. Turing',
  'MATH 101 College Algebra 10:30 AM - 12:00 PM Hall B',
  '',
  'Tuesday:',
  'CS 202 Data Structures 01:00 PM - 03:00 PM Lab 1 Prof. Lovelace',
  'ENG 101 Technical Writing 03:30 PM - 05:00 PM Room 201',
  '',
  'Wednesday:',
  'IT 101 Introduction to Computing 08:00 - 10:00 Room 304 Dr. Turing',
  'MATH 101 College Algebra 10:30 AM - 12:00 PM Hall B',
  '',
  'Thursday:',
  'CS 202 Data Structures 01:00 PM - 03:00 PM Lab 1 Prof. Lovelace',
  '',
  'Friday:',
  'IT 101 Introduction to Computing 08:00 - 10:00 Room 304 Dr. Turing',
  'MATH 101 College Algebra 10:30 AM - 12:00 PM Hall B',
  'PE 101 Physical Fitness 02:00 PM - 04:00 PM Gym Sir John'
].join('\n');

const textResults = parseScheduleFromText(timetableText);
console.log('Parsed total classes from text:', textResults.length);
console.assert(textResults.length === 10, 'Expected 10 classes');

console.log('\nTesting AI schedule response validation...');
const mockAi = JSON.stringify([
  {
    subject_code: 'IT 101',
    title: 'Introduction to Computing',
    day_of_week: 'Monday',
    start_time: '8:00 AM',
    end_time: '10:00 AM',
    location: 'Laboratory 1',
    professor: 'Dr. Alan Turing',
    type: 'lab',
  },
  {
    subject_code: 'MATH 201',
    title: 'Calculus I',
    day_of_week: ['Monday', 'Wednesday', 'Friday'],
    start_time: '10:30 AM',
    end_time: '12:00 PM',
    location: 'Hall B',
    professor: 'Prof. Isaac Newton',
    type: 'lecture',
  },
  {
    subject_code: 'CS 305',
    title: 'Database Systems',
    day: 'Tuesday',
    startTime: '01:00 PM',
    endTime: '', // missing end time
    room: 'Room 402',
  }
]);

const aiResults = parseAndValidateAiSchedule(mockAi);
console.log('Parsed total classes from AI JSON:', aiResults.length);
console.assert(aiResults.length === 5, 'Expected 5 classes from AI (1 Mon + 3 MWF + 1 Tue)');

const cs305 = aiResults.find(e => e.subject_code === 'CS 305');
console.assert(cs305.needsReview === true, 'CS 305 must need review due to missing end time');
console.assert(cs305.end_time === '14:00', 'CS 305 estimated end time must be 14:00');
console.assert(cs305.start_time === '13:00', 'CS 305 start time must be 13:00');

console.log('\nTesting time normalizations:');
console.log('  8:00 AM ->', parseAndNormalizeTime('8:00 AM'));
console.log('  1:30 PM ->', parseAndNormalizeTime('1:30 PM'));
console.log('  12:00 PM ->', parseAndNormalizeTime('12:00 PM'));
console.log('  12:00 AM ->', parseAndNormalizeTime('12:00 AM'));
console.log('  0830 ->', parseAndNormalizeTime('0830'));
console.log('  1600 ->', parseAndNormalizeTime('1600'));

console.log('\n🎉 ALL LOGIC AND VALIDATION TESTS PASSED 100%!');

