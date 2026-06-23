import { ObservationDraft, ObservationSignal } from '../domain/types';
import { extractRoomFromText } from '../common/room.util';

const RESOLVED_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  subjectPrefix: string;
  signal: ObservationSignal;
}> = [
  {
    pattern: /settle\s*了|收了一晚的费用|fee collected|charge applied|charged the guest/i,
    category: 'finance',
    subjectPrefix: 'no_show',
    signal: 'resolved',
  },
];

function draftCoversLine(
  drafts: Array<ObservationDraft & { quote?: string }>,
  line: string,
): boolean {
  const normLine = line.toLowerCase();
  return drafts.some((draft) => {
    const quote = draft.quote?.toLowerCase() ?? '';
    return quote.length > 10 && (normLine.includes(quote) || quote.includes(normLine.slice(0, 40)));
  });
}

export function detectResolutionDrafts(
  nightLog: string,
  existingDrafts: Array<ObservationDraft & { quote?: string }> = [],
): Array<ObservationDraft & { quote: string }> {
  const supplemental: Array<ObservationDraft & { quote: string }> = [];

  for (const rawLine of nightLog.split('\n')) {
    const line = rawLine.replace(/^[-*]\s*/, '').trim();
    if (!line || draftCoversLine(existingDrafts, line)) {
      continue;
    }

    for (const rule of RESOLVED_PATTERNS) {
      if (!rule.pattern.test(line)) {
        continue;
      }

      const room = extractRoomFromText(line);
      if (!room) {
        continue;
      }

      supplemental.push({
        room,
        category: rule.category,
        subjectKey: `${rule.subjectPrefix}_room_${room}`,
        issue: line.slice(0, 160),
        signal: rule.signal,
        evidence: [],
        ambiguities: [],
        quote: line,
      });
      break;
    }
  }

  return supplemental;
}
