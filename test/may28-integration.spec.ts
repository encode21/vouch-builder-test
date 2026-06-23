import * as fs from 'fs';
import * as path from 'path';
import { newId } from '../src/common/id';
import { normalizeStructuredEvents } from '../src/events/event-normalizer';
import { buildHandover } from '../src/handover/handover.builder';
import { validateNightLogGrounding } from '../src/night-log/grounding.validator';
import { reconcileObservations } from '../src/reconciliation/reconciler';

const samplePath = path.join(__dirname, '..', 'samples', 'handover-request-2026-05-28.json');

function buildMay28NightLogDrafts() {
  return [
    {
      room: '208',
      category: 'guest_welfare',
      subjectKey: 'safe_room_208',
      issue: 'Guest safe locked with passport and cash inside before early checkout flight',
      signal: 'opened' as const,
      quote:
        '208 房的客人刚才下来说房间的保险箱打不开了，他的护照和一些现金锁在里面，明天一早要退房赶飞机。试过重设密码也不行，要尽快找维修或保险箱公司来开，不然他走不了。',
      ambiguities: [] as string[],
      evidence: [] as [],
    },
    {
      room: '112',
      category: 'maintenance',
      subjectKey: 'aircon_room_112',
      issue: 'Compressor part needs ordering; room 112 remains out of order',
      signal: 'progress_update' as const,
      quote:
        "Bad news, he says it's the compressor and the part needs to be ordered in, will take a few days. So 112 stays out of order for now.",
      ambiguities: [] as string[],
      evidence: [] as [],
    },
    {
      room: '215',
      category: 'facilities',
      subjectKey: 'leak_room_215',
      issue: 'Corridor leak worsened; bucket placed; building management did not attend',
      signal: 'progress_update' as const,
      quote:
        'The leak in the 2nd floor corridor (near 215) got worse tonight — there was a steady drip and the carpet was getting soaked, so I put a bucket down and moved the wet floor sign.',
      ambiguities: [] as string[],
      evidence: [] as [],
    },
    {
      room: '215',
      category: 'facilities',
      subjectKey: 'leak_followup_room_215',
      issue: 'Building management did not attend; chase leak first thing',
      signal: 'still_open' as const,
      quote: "Please chase this first thing, it's right outside a guest room.",
      ambiguities: [] as string[],
      evidence: [] as [],
    },
    {
      room: '312',
      category: 'finance',
      subjectKey: 'no_show_room_312',
      issue: 'No-show fee collected per booking terms',
      signal: 'resolved' as const,
      quote:
        '312 那个 no-show（昨晚的 guaranteed booking）— 我已经按 booking terms 帮他收了一晚的费用了，这件事 settle 了。',
      ambiguities: [] as string[],
      evidence: [] as [],
    },
    {
      room: '309',
      category: 'finance',
      subjectKey: 'deposit_room_309',
      issue: 'Deposit still not collected',
      signal: 'still_open' as const,
      quote:
        "the guy with the deposit issue from Tuesday is still not settled, he came in very late and I didn't want to chase him at 2am.",
      ambiguities: [] as string[],
      evidence: [] as [],
    },
    {
      room: '205',
      category: 'front_desk',
      subjectKey: 'checkout_room_205',
      issue: 'Room appears unoccupied but system still shows guest in-house',
      signal: 'unknown' as const,
      quote:
        "The system still shows Mr Chen in 205 as in-house, but it looks like nobody's been in there for a day or two.",
      ambiguities: ['billing_system_mismatch'] as string[],
      evidence: [] as [],
    },
    {
      category: 'guest_complaint',
      subjectKey: 'wifi_unknown_room',
      issue: 'Wifi dropping complaint from unknown upper-floor room',
      signal: 'unknown' as const,
      quote:
        "Someone called down from one of the upper floor rooms around 3am complaining the wifi kept dropping. I couldn't catch which room it was",
      ambiguities: ['room_unknown'] as string[],
      evidence: [] as [],
    },
  ];
}

describe('May 28 integration', () => {
  it('threads structured history with night-log updates without duplicate incidents', () => {
    const request = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    const structured = normalizeStructuredEvents(request.events, request.hotelId, request.timezone);

    const grounding = validateNightLogGrounding(
      buildMay28NightLogDrafts(),
      request.nightLog,
      { hotelId: request.hotelId, shiftDate: request.morningDate },
      () => newId(),
    );

    expect(grounding.rejected).toHaveLength(0);

    const { incidents } = reconcileObservations([...structured, ...grounding.accepted]);
    const result = buildHandover({
      runId: 'may28',
      hotelId: request.hotelId,
      morningDate: request.morningDate,
      timezone: request.timezone,
      incidents,
      rejectedObservations: [],
    });

    const stillOpenRooms = result.stillOpen.map((i) => i.title.match(/Room (\d+)/)?.[1]);
    expect(stillOpenRooms.filter((r) => r === '112')).toHaveLength(1);
    expect(stillOpenRooms.filter((r) => r === '215')).toHaveLength(1);
    expect(stillOpenRooms.filter((r) => r === '309')).toHaveLength(2);
    expect(result.newTonight.some((i) => i.title.includes('208'))).toBe(true);
    expect(result.newTonight.find((i) => i.title.includes('112'))).toBeUndefined();
    expect(result.newlyResolved.some((i) => i.title.includes('312'))).toBe(true);
    expect(result.stillOpen.find((i) => i.title.includes('312'))).toBeUndefined();
    expect(result.warnings.some((i) => i.warnings.some((w) => w.includes('room_unknown')))).toBe(
      true,
    );
    expect(
      result.warnings.some((i) => i.warnings.some((w) => w.includes('billing_system_mismatch'))),
    ).toBe(true);

    const leak = result.stillOpen.find((i) => i.title.includes('215'));
    expect(leak?.recommendedAction.toLowerCase()).toContain('chase');
    expect(
      leak?.evidence.some(
        (e) => e.sourceType === 'night_log' && e.quote.toLowerCase().includes('worse'),
      ),
    ).toBe(true);
  });
});
