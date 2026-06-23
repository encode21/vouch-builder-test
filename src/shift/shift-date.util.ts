/**
 * Night-shift date assignment.
 *
 * Assumption: a night shift runs 23:00–07:00 local hotel time and is labelled by
 * the calendar morning date when the shift ends (the handover morning).
 *
 * Example: morningDate 2026-05-28 covers timestamps from 2026-05-27T23:00 through
 * 2026-05-28T06:59:59.999 in the hotel timezone.
 */
const SHIFT_START_HOUR = 23;
const SHIFT_END_HOUR = 7;

export function parseTimezoneOffset(timezone: string): string {
  if (/^[+-]\d{2}:\d{2}$/.test(timezone)) {
    return timezone;
  }
  const match = timezone.match(/UTC([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (match) {
    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const minutes = (match[3] ?? '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }
  return '+00:00';
}

function localParts(
  isoTimestamp: string,
  offset: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const date = new Date(isoTimestamp);
  const utcMs = date.getTime();
  const sign = offset.startsWith('-') ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number);
  const offsetMinutes = sign * (oh * 60 + om);
  const local = new Date(utcMs + offsetMinutes * 60_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(year: number, month: number, day: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function assignShiftDate(isoTimestamp: string, timezone: string): string {
  const offset = parseTimezoneOffset(timezone);
  const { year, month, day, hour } = localParts(isoTimestamp, offset);

  if (hour >= SHIFT_START_HOUR) {
    return addDays(year, month, day, 1);
  }
  if (hour < SHIFT_END_HOUR) {
    return formatDate(year, month, day);
  }
  return formatDate(year, month, day);
}

export function isTimestampInShift(
  isoTimestamp: string,
  morningDate: string,
  timezone: string,
): boolean {
  return assignShiftDate(isoTimestamp, timezone) === morningDate;
}

export function shiftWindow(morningDate: string): { start: string; end: string } {
  const [y, m, d] = morningDate.split('-').map(Number);
  const prev = addDays(y, m, d, -1);
  return {
    start: `${prev}T23:00:00`,
    end: `${morningDate}T06:59:59`,
  };
}
