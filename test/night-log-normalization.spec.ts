import { normalizeRoomField } from '../src/common/room.util';
import { normalizeNightLogDraft } from '../src/night-log/draft-normalizer';
import { resolveGroundedQuote } from '../src/night-log/grounding.validator';
import { detectResolutionDrafts } from '../src/night-log/resolution-detector';

describe('night log draft normalization', () => {
  it('converts room_309 style values to three-digit room numbers', () => {
    expect(normalizeRoomField('room_309')).toBe('309');
    expect(normalizeRoomField('room_unknown')).toBeUndefined();
  });

  it('extracts room 215 from corridor leak quote text', () => {
    const room = normalizeRoomField(
      'room_unknown',
      'facilities_room_unknown',
      'the leak in the 2nd floor corridor (near 215) got worse tonight',
    );
    expect(room).toBe('215');
  });

  it('rewrites malformed draft room and subjectKey fields', () => {
    const normalized = normalizeNightLogDraft({
      room: 'room_309',
      category: 'finance',
      subjectKey: 'deposit_room_309',
      issue: 'Deposit still not settled',
      signal: 'still_open',
      evidence: [],
      ambiguities: [],
      quote: '309 deposit still not settled',
    });

    expect(normalized.room).toBe('309');
    expect(normalized.subjectKey).toContain('309');
  });
});

describe('grounded quote resolution', () => {
  const nightLog =
    '208 房的客人刚才下来说房间的保险箱打不开了，他的护照和一些现金锁在里面，明天一早要退房赶飞机。试过重设密码也不行，要尽快找维修或保险箱公司来开，不然他走不了。';

  it('accepts truncated quotes by grounding to the full source line', () => {
    const attempted =
      '房的客人刚才下来说房间的保险箱打不开了，他的护照和一些现金锁在里面，试过重设密码也不行，要尽快找维修或保险箱公司来开，不然他走不了。';
    const grounded = resolveGroundedQuote(attempted, nightLog, '208');
    expect(grounded).toBe(nightLog);
  });
});

describe('resolution detector', () => {
  it('adds a resolved no-show draft when the night log confirms settlement', () => {
    const nightLog =
      '- 312 那个 no-show（昨晚的 guaranteed booking）— 我已经按 booking terms 帮他收了一晚的费用了，这件事 settle 了。';
    const drafts = detectResolutionDrafts(nightLog, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].room).toBe('312');
    expect(drafts[0].signal).toBe('resolved');
  });
});
