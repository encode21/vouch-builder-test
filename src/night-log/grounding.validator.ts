import { Observation, ObservationDraft } from '../domain/types';
import { normalizeRoomField } from '../common/room.util';

export type GroundingResult = {
  accepted: Observation[];
  rejected: Array<{
    draft: ObservationDraft & { quote?: string };
    reason: string;
  }>;
};

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function longestContainedSubstring(needle: string, haystack: string): number {
  const n = normalizeForMatch(needle);
  const h = normalizeForMatch(haystack);
  if (n.length === 0) return 0;
  if (h.includes(n)) return n.length;

  let best = 0;
  for (let start = 0; start < n.length; start++) {
    for (let len = n.length - start; len > best; len--) {
      const slice = n.slice(start, start + len);
      if (slice.length < 12) continue;
      if (h.includes(slice) && slice.length > best) {
        best = slice.length;
      }
    }
  }
  return best;
}

function tokenizeForOverlap(text: string): string[] {
  return normalizeForMatch(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function tokenOverlapScore(attempt: string, line: string): number {
  const attemptTokens = tokenizeForOverlap(attempt);
  if (attemptTokens.length === 0) return 0;
  const lineTokens = new Set(tokenizeForOverlap(line));
  const matched = attemptTokens.filter((token) => lineTokens.has(token)).length;
  return matched / attemptTokens.length;
}

export function resolveGroundedQuote(
  attemptedQuote: string,
  nightLog: string,
  room?: string,
): string | undefined {
  const normalizedAttempt = normalizeForMatch(attemptedQuote);
  const normalizedLog = normalizeForMatch(nightLog);

  if (normalizedLog.includes(normalizedAttempt)) {
    return attemptedQuote;
  }

  const prefixCandidates: string[] = [attemptedQuote];
  if (room) {
    prefixCandidates.push(`${room} 房${attemptedQuote}`);
    prefixCandidates.push(`${room} 房的${attemptedQuote.replace(/^房/, '')}`);
    prefixCandidates.push(`Room ${room} ${attemptedQuote}`);
    prefixCandidates.push(`${room} ${attemptedQuote}`);
  }

  for (const candidate of prefixCandidates) {
    if (normalizedLog.includes(normalizeForMatch(candidate))) {
      return candidate;
    }
  }

  let bestLine: string | undefined;
  let bestScore = 0;

  for (const rawLine of nightLog.split('\n')) {
    const line = rawLine.replace(/^[-*]\s*/, '').trim();
    if (!line) continue;

    const normLine = normalizeForMatch(line);
    if (normLine.includes(normalizedAttempt)) {
      return line;
    }

    const overlap = longestContainedSubstring(attemptedQuote, line);
    const contiguousScore = overlap / Math.max(normalizedAttempt.length, 1);
    const tokenScore = tokenOverlapScore(attemptedQuote, line);
    const roomMatches = !room || new RegExp(`\\b${room}\\b`).test(line) || line.includes(`${room} 房`);
    const score = Math.max(contiguousScore, tokenScore);

    if (roomMatches && score > bestScore && score >= 0.5 && (overlap >= 15 || tokenScore >= 0.55)) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

export function quoteExistsInSource(quote: string, nightLog: string, room?: string): boolean {
  return resolveGroundedQuote(quote, nightLog, room) !== undefined;
}

export function findLineRange(
  quote: string,
  nightLog: string,
): { lineStart?: number; lineEnd?: number } {
  const lines = nightLog.split('\n');
  const normalizedQuote = normalizeForMatch(quote);
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).includes(normalizedQuote)) {
      return { lineStart: i + 1, lineEnd: i + 1 };
    }
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < lines.length; j++) {
      const chunk = normalizeForMatch(lines.slice(i, j + 1).join(' '));
      if (chunk.includes(normalizedQuote)) {
        return { lineStart: i + 1, lineEnd: j + 1 };
      }
    }
  }
  return {};
}

export function validateNightLogGrounding(
  drafts: Array<ObservationDraft & { quote?: string; paragraphId?: string }>,
  nightLog: string,
  base: Pick<Observation, 'hotelId' | 'shiftDate'>,
  assignId: () => string,
): GroundingResult {
  const accepted: Observation[] = [];
  const rejected: GroundingResult['rejected'] = [];

  for (const draft of drafts) {
    const attemptedQuote = draft.quote ?? '';
    const room = normalizeRoomField(draft.room, draft.subjectKey, attemptedQuote, draft.issue);
    const groundedQuote = resolveGroundedQuote(attemptedQuote, nightLog, room);

    if (!attemptedQuote || !groundedQuote) {
      rejected.push({
        draft,
        reason: 'evidence_quote_not_found_in_source',
      });
      continue;
    }

    const lineRange = findLineRange(groundedQuote, nightLog);
    accepted.push({
      observationId: assignId(),
      hotelId: base.hotelId,
      shiftDate: base.shiftDate,
      occurredAt: draft.occurredAt,
      room,
      category: draft.category,
      subjectKey: draft.subjectKey,
      issue: draft.issue,
      signal: draft.signal,
      evidence: [
        {
          sourceType: 'night_log',
          paragraphId: draft.paragraphId ?? 'night-log',
          quote: groundedQuote,
          ...lineRange,
        },
      ],
      ambiguities: draft.ambiguities ?? [],
      incidentRef: draft.incidentRef,
    });
  }

  return { accepted, rejected };
}
