const ROOM_PATTERNS = [
  /\bnear room (\d{3})\b/i,
  /\bnear (\d{3})\b/i,
  /\broom (\d{3})\b/i,
  /\b(\d{3}) 房\b/,
  /\brooms? (\d{3}(?:, \d{3})*)/i,
  /^(\d{3})\b/,
];

const INVALID_ROOM_TOKENS = new Set(['unknown', 'room_unknown', 'none', 'n/a']);

export function isValidRoomNumber(room: string): boolean {
  return /^\d{3}$/.test(room);
}

export function extractRoomFromText(text: string): string | undefined {
  for (const pattern of ROOM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const room = match[1].split(',')[0].trim();
      if (isValidRoomNumber(room)) {
        return room;
      }
    }
  }
  return undefined;
}

export function normalizeRoomField(
  room: string | undefined,
  subjectKey?: string,
  quote?: string,
  issue?: string,
): string | undefined {
  if (room) {
    const trimmed = room.trim();
    if (INVALID_ROOM_TOKENS.has(trimmed.toLowerCase())) {
      room = undefined;
    } else {
      const roomPrefix = trimmed.match(/^room_(\d{3})$/i);
      if (roomPrefix) {
        return roomPrefix[1];
      }
      if (isValidRoomNumber(trimmed)) {
        return trimmed;
      }
    }
  }

  if (subjectKey) {
    const fromSubject = subjectKey.match(/_room_(\d{3})$/i);
    if (fromSubject) {
      return fromSubject[1];
    }
  }

  for (const text of [quote, issue]) {
    if (!text) continue;
    const fromText = extractRoomFromText(text);
    if (fromText) {
      return fromText;
    }
  }

  return undefined;
}
