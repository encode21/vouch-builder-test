import { newId } from '../src/common/id';
import { Observation, ObservationDraft } from '../src/domain/types';
import { normalizeStructuredEvent } from '../src/events/event-normalizer';
import { validateNightLogGrounding } from '../src/night-log/grounding.validator';
import { buildHandover, assertAllItemsGrounded } from '../src/handover/handover.builder';
import { reconcileObservations, applySignalToStatus } from '../src/reconciliation/reconciler';
import { assignShiftDate } from '../src/shift/shift-date.util';

function obs(
  partial: Partial<Observation> & Pick<Observation, 'signal' | 'subjectKey' | 'issue'>,
): Observation {
  return {
    observationId: newId(),
    hotelId: 'test-hotel',
    shiftDate: partial.shiftDate ?? '2026-05-28',
    occurredAt: partial.occurredAt ?? `${partial.shiftDate ?? '2026-05-28'}T01:00:00+08:00`,
    room: partial.room,
    category: partial.category ?? 'maintenance',
    subjectKey: partial.subjectKey,
    issue: partial.issue,
    signal: partial.signal,
    evidence: partial.evidence ?? [{ sourceType: 'event', eventId: 'evt_test' }],
    ambiguities: partial.ambiguities ?? [],
  };
}

describe('shift date utility', () => {
  it('assigns timestamps in 23:00-07:00 window to morning date', () => {
    expect(assignShiftDate('2026-05-27T23:30:00+08:00', '+08:00')).toBe('2026-05-28');
    expect(assignShiftDate('2026-05-28T03:00:00+08:00', '+08:00')).toBe('2026-05-28');
    expect(assignShiftDate('2026-05-28T12:00:00+08:00', '+08:00')).toBe('2026-05-28');
  });
});

describe('handover classification', () => {
  const morningDate = '2026-05-30';

  it('keeps incident opened on previous night in stillOpen', () => {
    const observations = [
      obs({
        shiftDate: '2026-05-26',
        occurredAt: '2026-05-26T00:20:00+08:00',
        room: '112',
        subjectKey: 'maintenance_room_112',
        issue: 'Aircon not cooling',
        signal: 'opened',
      }),
      obs({
        shiftDate: '2026-05-29',
        occurredAt: '2026-05-29T23:40:00+08:00',
        room: '112',
        subjectKey: 'maintenance_room_112',
        issue: 'Compressor part arrived, room still out of order',
        signal: 'progress_update',
      }),
    ];

    const { incidents } = reconcileObservations(observations);
    const result = buildHandover({
      runId: 'run-1',
      hotelId: 'test-hotel',
      morningDate,
      timezone: '+08:00',
      incidents,
      rejectedObservations: [],
    });

    expect(result.stillOpen.some((i) => i.incidentId === incidents[0].incidentId)).toBe(true);
    expect(result.newTonight.find((i) => i.incidentId === incidents[0].incidentId)).toBeUndefined();
  });

  it('puts previously open incident resolved on target shift in newlyResolved', () => {
    const observations = [
      obs({
        shiftDate: '2026-05-27',
        occurredAt: '2026-05-27T01:40:00+08:00',
        room: '215',
        category: 'facilities',
        subjectKey: 'facilities_corridor_leak',
        issue: 'Corridor leak near 215',
        signal: 'opened',
      }),
      obs({
        shiftDate: '2026-05-29',
        occurredAt: '2026-05-29T00:10:00+08:00',
        room: '215',
        category: 'facilities',
        subjectKey: 'facilities_corridor_leak',
        issue: 'Leak stopped and area dry',
        signal: 'resolved',
      }),
    ];

    const { incidents } = reconcileObservations(observations);
    const result = buildHandover({
      runId: 'run-2',
      hotelId: 'test-hotel',
      morningDate: '2026-05-29',
      timezone: '+08:00',
      incidents,
      rejectedObservations: [],
    });

    expect(result.newlyResolved).toHaveLength(1);
    expect(result.stillOpen).toHaveLength(0);
  });

  it('classifies new unresolved incident as newTonight', () => {
    const observations = [
      obs({
        shiftDate: '2026-05-30',
        occurredAt: '2026-05-30T03:50:00+08:00',
        room: '226',
        category: 'damage',
        subjectKey: 'damage_room_226',
        issue: 'Cracked basin found',
        signal: 'opened',
      }),
    ];

    const { incidents } = reconcileObservations(observations);
    const result = buildHandover({
      runId: 'run-3',
      hotelId: 'test-hotel',
      morningDate: '2026-05-30',
      timezone: '+08:00',
      incidents,
      rejectedObservations: [],
    });

    expect(result.newTonight).toHaveLength(1);
    expect(result.stillOpen).toHaveLength(0);
  });
});

describe('signal semantics', () => {
  it('does not treat maintenance attendance as resolution', () => {
    expect(applySignalToStatus('open', 'progress_update')).toBe('open');
    const event = normalizeStructuredEvent(
      {
        id: 'evt_maint',
        timestamp: '2026-05-29T23:40:00+08:00',
        type: 'maintenance',
        room: '112',
        guest: null,
        description: 'Vendor repair scheduled. Room remains OUT OF ORDER.',
        status: 'unresolved',
      },
      'lumen-sg',
      '+08:00',
    );
    expect(event?.signal).toBe('progress_update');
  });
});

describe('reconciliation', () => {
  it('keeps unknown room unknown', () => {
    const observations = [
      obs({
        room: undefined,
        category: 'guest_complaint',
        subjectKey: 'guest_complaint_wifi_unknown_room',
        issue: 'Wifi dropping, room unknown',
        signal: 'unknown',
        ambiguities: ['room_unknown'],
      }),
    ];

    const { incidents } = reconcileObservations(observations);
    expect(incidents[0].room).toBeUndefined();
    expect(incidents[0].warnings.some((w) => w.includes('room_unknown'))).toBe(true);
  });

  it('does not merge two different issue types in the same room', () => {
    const observations = [
      obs({
        room: '309',
        category: 'finance',
        subjectKey: 'deposit_issue_room_309',
        issue: 'Deposit not collected',
        signal: 'opened',
      }),
      obs({
        room: '309',
        category: 'front_desk',
        subjectKey: 'check_in_issue_room_309',
        issue: 'Booking name mismatch',
        signal: 'opened',
      }),
    ];

    const { incidents } = reconcileObservations(observations);
    expect(incidents).toHaveLength(2);
  });
});

describe('grounding enforcement', () => {
  it('rejects free-text observations whose quote is absent from source', () => {
    const nightLog = 'Room 112 aircon still broken.';
    const drafts: Array<ObservationDraft & { quote: string }> = [
      {
        category: 'maintenance',
        subjectKey: 'maintenance_room_999',
        issue: 'Invented issue',
        signal: 'opened',
        evidence: [],
        ambiguities: [],
        quote: 'Room 999 flooded',
      },
      {
        category: 'maintenance',
        subjectKey: 'maintenance_room_112',
        issue: 'Aircon still broken',
        signal: 'still_open',
        evidence: [],
        ambiguities: [],
        quote: 'Room 112 aircon still broken',
      },
    ];

    const result = validateNightLogGrounding(
      drafts,
      nightLog,
      { hotelId: 'test', shiftDate: '2026-05-28' },
      () => newId(),
    );

    expect(result.rejected).toHaveLength(1);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].evidence[0]).toMatchObject({
      sourceType: 'night_log',
      quote: 'Room 112 aircon still broken',
    });
  });

  it('ensures every final handover item has evidence', () => {
    const observations = [
      obs({
        shiftDate: '2026-05-30',
        room: '117',
        category: 'front_desk',
        subjectKey: 'parcel_room_117',
        issue: 'Parcel held at desk',
        signal: 'opened',
        evidence: [{ sourceType: 'event', eventId: 'evt_0022' }],
      }),
    ];

    const { incidents } = reconcileObservations(observations);
    const result = buildHandover({
      runId: 'run-evidence',
      hotelId: 'test-hotel',
      morningDate: '2026-05-30',
      timezone: '+08:00',
      incidents,
      rejectedObservations: [],
    });

    expect(() => assertAllItemsGrounded(result)).not.toThrow();
    const allItems = [
      ...result.stillOpen,
      ...result.newTonight,
      ...result.newlyResolved,
      ...result.warnings,
    ];
    for (const item of allItems) {
      expect(item.evidence.length).toBeGreaterThan(0);
    }
  });
});
