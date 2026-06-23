import { ObservationDraft } from '../domain/types';
import { normalizeRoomField } from '../common/room.util';

export function normalizeNightLogDraft(
  draft: ObservationDraft & { quote?: string },
): ObservationDraft & { quote?: string } {
  const room = normalizeRoomField(draft.room, draft.subjectKey, draft.quote, draft.issue);
  const ambiguities = [...(draft.ambiguities ?? [])];

  if (!room && (draft.issue?.toLowerCase().includes('room') || draft.quote?.includes('room'))) {
    if (!ambiguities.includes('room_unknown')) {
      ambiguities.push('room_unknown');
    }
  }

  let subjectKey = draft.subjectKey;
  if (room && subjectKey.includes('room_unknown')) {
    subjectKey = subjectKey.replace(/room_unknown/g, room);
  }
  if (room && !/_room_\d{3}$/.test(subjectKey)) {
    const categoryStem = draft.category.replace(/[^a-z0-9]+/g, '_');
    if (!subjectKey.includes(room)) {
      subjectKey = `${categoryStem}_room_${room}`;
    }
  }

  return {
    ...draft,
    room,
    subjectKey,
    ambiguities,
  };
}

export function normalizeNightLogDrafts(
  drafts: Array<ObservationDraft & { quote?: string }>,
): Array<ObservationDraft & { quote?: string }> {
  return drafts.map((draft) => normalizeNightLogDraft(draft));
}
