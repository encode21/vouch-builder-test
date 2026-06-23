import { newId } from '../common/id';
import { Incident, Observation, ObservationSignal } from '../domain/types';
import { observationTitleFromObservation } from '../events/event-normalizer';

export type ReconciliationDecision =
  | 'matched_incident_ref'
  | 'matched_room_category_subject'
  | 'matched_room_compatible_subject'
  | 'matched_room_category_unique'
  | 'matched_room_related_category_unique'
  | 'created_new_incident'
  | 'ambiguous_multiple_matches';

const RELATED_CATEGORIES: Record<string, ReadonlySet<string>> = {
  maintenance: new Set(['maintenance', 'facilities']),
  facilities: new Set(['maintenance', 'facilities']),
};

function roomFromSubjectKey(subjectKey: string): string | undefined {
  const parts = subjectKey.split('_');
  const roomIdx = parts.indexOf('room');
  if (roomIdx >= 0 && roomIdx + 1 < parts.length) {
    return parts[roomIdx + 1];
  }
  return undefined;
}

function categoriesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const related = RELATED_CATEGORIES[a];
  return related?.has(b) ?? false;
}

function subjectsCompatible(a: string, b: string): boolean {
  if (a === b) return true;

  const aRoom = roomFromSubjectKey(a);
  const bRoom = roomFromSubjectKey(b);
  if (aRoom && bRoom && aRoom === bRoom) {
    return true;
  }

  const aParts = a.split('_');
  const bParts = b.split('_');
  const aStem = aParts.slice(0, 2).join('_');
  const bStem = bParts.slice(0, 2).join('_');
  return aStem === bStem;
}

function findMatches(observation: Observation, incidents: Incident[]): Incident[] {
  if (observation.incidentRef) {
    const refMatch = incidents.filter((i) => i.incidentId === observation.incidentRef);
    if (refMatch.length > 0) return refMatch;
  }

  const roomCategorySubject = incidents.filter(
    (i) =>
      i.room === observation.room &&
      observation.room !== undefined &&
      i.category === observation.category &&
      i.subjectKey === observation.subjectKey,
  );
  if (roomCategorySubject.length > 0) return roomCategorySubject;

  const roomCompatible = incidents.filter(
    (i) =>
      i.room === observation.room &&
      observation.room !== undefined &&
      i.category === observation.category &&
      subjectsCompatible(i.subjectKey, observation.subjectKey),
  );
  if (roomCompatible.length > 0) return roomCompatible;

  if (observation.room) {
    const sameRoomAndCategory = incidents.filter(
      (i) =>
        i.room === observation.room &&
        i.category === observation.category &&
        categoriesCompatible(i.category, observation.category),
    );
    if (sameRoomAndCategory.length === 1) {
      return sameRoomAndCategory;
    }

    const sameRoomRelatedCategory = incidents.filter(
      (i) => i.room === observation.room && categoriesCompatible(i.category, observation.category),
    );
    if (sameRoomRelatedCategory.length === 1) {
      return sameRoomRelatedCategory;
    }
  }

  if (!observation.room) {
    const subjectOnly = incidents.filter(
      (i) =>
        !i.room &&
        !observation.room &&
        i.category === observation.category &&
        i.subjectKey === observation.subjectKey,
    );
    if (subjectOnly.length > 0) return subjectOnly;

    const categoryOnly = incidents.filter(
      (i) =>
        !i.room &&
        !observation.room &&
        i.category === observation.category &&
        subjectsCompatible(i.subjectKey, observation.subjectKey),
    );
    if (categoryOnly.length === 1) {
      return categoryOnly;
    }
  }

  return [];
}

export function applySignalToStatus(
  current: Incident['status'],
  signal: ObservationSignal,
): Incident['status'] {
  switch (signal) {
    case 'opened':
    case 'still_open':
      return 'open';
    case 'progress_update':
      return current === 'unknown' ? 'unknown' : current;
    case 'resolved':
      return 'resolved';
    case 'unknown':
    default:
      return current === 'unknown' ? 'unknown' : current;
  }
}

export type ReduceResult = {
  incident: Incident;
  decision: ReconciliationDecision;
  stateTransition?: string;
};

export function reduceObservationOntoIncident(
  incident: Incident,
  observation: Observation,
): { incident: Incident; stateTransition?: string } {
  const previousStatus = incident.status;
  const nextStatus = applySignalToStatus(previousStatus, observation.signal);
  let reopened = incident.reopened;

  if (
    previousStatus === 'resolved' &&
    (observation.signal === 'opened' || observation.signal === 'still_open')
  ) {
    reopened = true;
    incident.warnings.push('incident_reopened_after_resolution');
  }

  if (observation.ambiguities.length > 0) {
    incident.warnings.push(...observation.ambiguities.map((a) => `observation_ambiguity:${a}`));
  }

  incident.status = nextStatus;
  incident.lastUpdatedAt = observation.occurredAt ?? incident.lastUpdatedAt;
  incident.observations.push(observation);

  if (nextStatus === 'resolved' && observation.signal === 'resolved') {
    incident.resolvedAt = observation.occurredAt ?? incident.lastUpdatedAt;
    incident.resolvedOnShiftDate = observation.shiftDate;
  }

  if (!incident.room && observation.room) {
    incident.room = observation.room;
  }

  const transition =
    previousStatus !== nextStatus ? `${previousStatus}_to_${nextStatus}` : undefined;

  return { incident: { ...incident, reopened }, stateTransition: transition };
}

export function createIncidentFromObservation(observation: Observation): Incident {
  const status = applySignalToStatus('unknown', observation.signal);
  return {
    incidentId: newId(),
    hotelId: observation.hotelId,
    room: observation.room,
    category: observation.category,
    subjectKey: observation.subjectKey,
    title: observationTitleFromObservation(observation),
    status,
    openedAt: observation.occurredAt ?? observation.shiftDate,
    resolvedAt: status === 'resolved' ? observation.occurredAt : undefined,
    lastUpdatedAt: observation.occurredAt ?? observation.shiftDate,
    observations: [observation],
    warnings: [...observation.ambiguities.map((a) => `observation_ambiguity:${a}`)],
    openedOnShiftDate: observation.shiftDate,
    resolvedOnShiftDate: status === 'resolved' ? observation.shiftDate : undefined,
  };
}

export function reconcileObservations(observations: Observation[]): {
  incidents: Incident[];
  decisions: Array<{
    observationId: string;
    incidentId: string;
    decision: ReconciliationDecision;
    stateTransition?: string;
  }>;
} {
  const incidents: Incident[] = [];
  const decisions: Array<{
    observationId: string;
    incidentId: string;
    decision: ReconciliationDecision;
    stateTransition?: string;
  }> = [];

  const sorted = [...observations]
    .filter((o) => !o.rejected)
    .sort((a, b) => (a.occurredAt ?? a.shiftDate).localeCompare(b.occurredAt ?? b.shiftDate));

  for (const observation of sorted) {
    const matches = findMatches(observation, incidents);

    if (matches.length > 1) {
      const incident = createIncidentFromObservation(observation);
      incident.warnings.push('ambiguous_multiple_incident_matches');
      incidents.push(incident);
      decisions.push({
        observationId: observation.observationId,
        incidentId: incident.incidentId,
        decision: 'ambiguous_multiple_matches',
      });
      continue;
    }

    if (matches.length === 1) {
      const match = matches[0];
      let decision: ReconciliationDecision = 'matched_room_category_subject';
      if (observation.incidentRef) {
        decision = 'matched_incident_ref';
      } else if (
        observation.room &&
        match.room === observation.room &&
        match.category !== observation.category &&
        categoriesCompatible(match.category, observation.category)
      ) {
        decision = 'matched_room_related_category_unique';
      } else if (
        observation.room &&
        match.room === observation.room &&
        match.category === observation.category &&
        match.subjectKey !== observation.subjectKey
      ) {
        decision =
          subjectsCompatible(match.subjectKey, observation.subjectKey) &&
          match.subjectKey !== observation.subjectKey
            ? 'matched_room_compatible_subject'
            : 'matched_room_category_unique';
      } else if (match.subjectKey !== observation.subjectKey) {
        decision = 'matched_room_compatible_subject';
      }

      const { incident, stateTransition } = reduceObservationOntoIncident(match, observation);
      const idx = incidents.findIndex((i) => i.incidentId === match.incidentId);
      incidents[idx] = incident;
      decisions.push({
        observationId: observation.observationId,
        incidentId: incident.incidentId,
        decision,
        stateTransition,
      });
      continue;
    }

    const incident = createIncidentFromObservation(observation);
    incidents.push(incident);
    decisions.push({
      observationId: observation.observationId,
      incidentId: incident.incidentId,
      decision: 'created_new_incident',
      stateTransition: `unknown_to_${incident.status}`,
    });
  }

  return { incidents, decisions };
}
