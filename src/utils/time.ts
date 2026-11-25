export function formatTime12Hour(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm])\.?)?$/);
  if (!match) return time;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem) {
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59) return time;

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function normalizeTime24Hour(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm])\.?)?$/);
  if (!match) return time;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem) {
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59) return time;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
