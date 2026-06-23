import { Observation, ObservationDraft } from '../domain/types';

export type GroundingResult = {
  accepted: Observation[];
  rejected: Array<{
    draft: ObservationDraft & { quote?: string };
    reason: string;
  }>;
};

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function quoteExistsInSource(quote: string, nightLog: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  const normalizedLog = normalizeForMatch(nightLog);
  if (normalizedLog.includes(normalizedQuote)) {
    return true;
  }
  const compactQuote = normalizedQuote.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const compactLog = normalizedLog.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return compactLog.includes(compactQuote);
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
    const quote = draft.quote ?? '';
    if (!quote || !quoteExistsInSource(quote, nightLog)) {
      rejected.push({
        draft,
        reason: 'evidence_quote_not_found_in_source',
      });
      continue;
    }

    const lineRange = findLineRange(quote, nightLog);
    accepted.push({
      observationId: assignId(),
      hotelId: base.hotelId,
      shiftDate: base.shiftDate,
      occurredAt: draft.occurredAt,
      room: draft.room,
      category: draft.category,
      subjectKey: draft.subjectKey,
      issue: draft.issue,
      signal: draft.signal,
      evidence: [
        {
          sourceType: 'night_log',
          paragraphId: draft.paragraphId ?? 'night-log',
          quote,
          ...lineRange,
        },
      ],
      ambiguities: draft.ambiguities ?? [],
      incidentRef: draft.incidentRef,
    });
  }

  return { accepted, rejected };
}
