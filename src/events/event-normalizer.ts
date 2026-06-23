import { newId } from '../common/id';
import { Observation, ObservationSignal, StructuredEvent } from '../domain/types';
import { assignShiftDate } from '../shift/shift-date.util';

const SKIP_TYPES = new Set(['check_in', 'walk_in', 'lost_keycard', 'guest_message', 'note']);

const PROGRESS_KEYWORDS = [
  'update on',
  'arrived',
  'scheduled',
  'attended',
  'progress',
  'part has',
  'vendor',
  'mopped',
  'stopped',
];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function extractRoomFromDescription(description: string): string | undefined {
  const patterns = [
    /\bnear room (\d{3})\b/i,
    /\broom (\d{3})\b/i,
    /\b(\d{3}) 房\b/,
    /\brooms? (\d{3}(?:, \d{3})*)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1].split(',')[0].trim();
    }
  }
  return undefined;
}

function buildSubjectKey(event: StructuredEvent, room?: string): string {
  const typePart = slug(event.type);
  if (room) {
    return `${typePart}_room_${room}`;
  }
  const descSlug = slug(event.description.slice(0, 60));
  return `${typePart}_${descSlug}`;
}

function mapCategory(eventType: string): string {
  const map: Record<string, string> = {
    maintenance: 'maintenance',
    compliance: 'compliance',
    complaint: 'guest_complaint',
    deposit_issue: 'finance',
    facilities: 'facilities',
    finance_note: 'finance',
    check_in_issue: 'front_desk',
    no_show: 'finance',
    incident: 'guest_welfare',
    early_checkout_request: 'front_desk',
    damage_report: 'damage',
  };
  return map[eventType] ?? slug(eventType);
}

function mapSignal(event: StructuredEvent): ObservationSignal {
  const status = event.status.toLowerCase();
  const desc = event.description.toLowerCase();

  if (status === 'resolved' || /\bresolved\b/.test(desc)) {
    return 'resolved';
  }

  if (status === 'pending') {
    if (PROGRESS_KEYWORDS.some((k) => desc.includes(k))) {
      return 'progress_update';
    }
    return 'still_open';
  }

  if (PROGRESS_KEYWORDS.some((k) => desc.includes(k))) {
    return 'progress_update';
  }

  if (status === 'unresolved') {
    return 'opened';
  }

  return 'unknown';
}

export function shouldIncludeEvent(event: StructuredEvent): boolean {
  if (SKIP_TYPES.has(event.type)) {
    const status = event.status.toLowerCase();
    if (status === 'resolved' && !event.description.toLowerCase().includes('unresolved')) {
      return false;
    }
  }

  if (event.type === 'complaint' && event.status.toLowerCase() === 'resolved') {
    return false;
  }

  if (event.type === 'check_in' && event.status.toLowerCase() === 'resolved') {
    return false;
  }

  return true;
}

export function normalizeStructuredEvent(
  event: StructuredEvent,
  hotelId: string,
  timezone: string,
): Observation | null {
  if (!shouldIncludeEvent(event)) {
    return null;
  }

  const room = event.room ?? extractRoomFromDescription(event.description);
  const shiftDate = assignShiftDate(event.timestamp, timezone);
  const signal = mapSignal(event);

  return {
    observationId: newId(),
    hotelId,
    shiftDate,
    occurredAt: event.timestamp,
    room,
    category: mapCategory(event.type),
    subjectKey: buildSubjectKey(event, room),
    issue: event.description,
    signal,
    evidence: [{ sourceType: 'event', eventId: event.id }],
    ambiguities: room ? [] : ['room_unknown_from_structured_event'],
    incidentRef: undefined,
  };
}

export function normalizeStructuredEvents(
  events: StructuredEvent[],
  hotelId: string,
  timezone: string,
): Observation[] {
  return events
    .map((event) => normalizeStructuredEvent(event, hotelId, timezone))
    .filter((obs): obs is Observation => obs !== null)
    .sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''));
}

export function observationTitleFromObservation(observation: Observation): string {
  const roomPart = observation.room ? `Room ${observation.room}` : 'Hotel-wide';
  return `${roomPart}: ${observation.issue.slice(0, 80)}`;
}
