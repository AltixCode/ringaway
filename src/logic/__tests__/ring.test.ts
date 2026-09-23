import {
  DELAY_PRESETS,
  FREE_DELAYS,
  FREE_PATTERN,
  RING_PATTERNS,
  canUseDelay,
  canUsePattern,
  formatCountdown,
  initialsOf,
  isDue,
  isMissed,
  isValidCaller,
  msUntil,
  patternById,
  patternMs,
  ringAt,
  RING_TIMEOUT_MS,
} from '../ring';

describe('ring patterns', () => {
  it('gives every pattern a unique id and a name key', () => {
    expect(new Set(RING_PATTERNS.map((p) => p.id)).size).toBe(RING_PATTERNS.length);
    for (const pattern of RING_PATTERNS) expect(pattern.nameKey.length).toBeGreaterThan(0);
  });

  it('starts every pattern with a zero wait, as the vibrate API expects', () => {
    // The array alternates wait/vibrate starting with a wait. A pattern that begins with a
    // non-zero value delays the first buzz, which reads as a dropped call.
    for (const pattern of RING_PATTERNS) expect(pattern.pattern[0]).toBe(0);
  });

  it('uses only non-negative durations', () => {
    for (const pattern of RING_PATTERNS) {
      for (const ms of pattern.pattern) expect(ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every pattern a real length', () => {
    for (const pattern of RING_PATTERNS) expect(patternMs(pattern)).toBeGreaterThan(0);
  });

  it('falls back to the first pattern for an id it does not know', () => {
    expect(patternById('invented')).toEqual(RING_PATTERNS[0]);
  });
});

describe('canUsePattern', () => {
  it('gives a free user one pattern', () => {
    expect(canUsePattern(FREE_PATTERN, false)).toBe(true);
    for (const pattern of RING_PATTERNS.filter((p) => p.id !== FREE_PATTERN)) {
      expect(canUsePattern(pattern.id, false)).toBe(false);
    }
  });

  it('gives a paying user all of them', () => {
    for (const pattern of RING_PATTERNS) expect(canUsePattern(pattern.id, true)).toBe(true);
  });

  it('refuses a pattern that does not exist', () => {
    expect(canUsePattern('invented', true)).toBe(false);
  });
});

describe('delays', () => {
  it('gives a free user one preset and a paying user all of them', () => {
    for (const seconds of FREE_DELAYS) expect(canUseDelay(seconds, false)).toBe(true);
    const locked = DELAY_PRESETS.filter((d) => !FREE_DELAYS.includes(d));
    expect(locked.length).toBeGreaterThan(0);
    for (const seconds of locked) {
      expect(canUseDelay(seconds, false)).toBe(false);
      expect(canUseDelay(seconds, true)).toBe(true);
    }
  });

  it('refuses a delay that is not a preset', () => {
    expect(canUseDelay(7, true)).toBe(false);
  });
});

describe('scheduling', () => {
  it('is an absolute moment, not a countdown', () => {
    // The app may be backgrounded or killed before the call lands; a counter would stop.
    expect(ringAt(1_000_000, 30)).toBe(1_000_000 + 30_000);
  });

  it('rings immediately for a nonsensical delay rather than never', () => {
    expect(ringAt(500, 0)).toBe(500);
    expect(ringAt(500, -10)).toBe(500);
    expect(ringAt(500, Number.NaN)).toBe(500);
  });

  it('counts down, and never below zero', () => {
    expect(msUntil(1000, 400)).toBe(600);
    expect(msUntil(1000, 5000)).toBe(0);
  });

  it('is due at the moment, not only after it', () => {
    expect(isDue(1000, 999)).toBe(false);
    expect(isDue(1000, 1000)).toBe(true);
    expect(isDue(1000, 1001)).toBe(true);
  });
});

describe('isMissed', () => {
  // A phone that rings forever is a phone whose screen dims and locks while it does, with no
  // way left to reach the buttons that would stop it — so ringing must end on its own.
  it('is not missed before the timeout elapses', () => {
    expect(isMissed(0, RING_TIMEOUT_MS - 1)).toBe(false);
  });

  it('is missed once the timeout elapses', () => {
    expect(isMissed(0, RING_TIMEOUT_MS)).toBe(true);
    expect(isMissed(0, RING_TIMEOUT_MS + 1)).toBe(true);
  });

  it('measures from the ring start, not from zero', () => {
    expect(isMissed(10_000, 10_000 + RING_TIMEOUT_MS - 1)).toBe(false);
    expect(isMissed(10_000, 10_000 + RING_TIMEOUT_MS)).toBe(true);
  });
});

describe('formatCountdown', () => {
  it('rounds up, so a call never shows 0:00 while still pending', () => {
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(1500)).toBe('0:02');
  });

  it('pads the seconds', () => {
    expect(formatCountdown(65_000)).toBe('1:05');
  });

  it('is zero at zero', () => {
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('initialsOf', () => {
  it('takes one letter from each of the first two words', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('Mum')).toBe('M');
  });

  it('ignores extra words and spacing', () => {
    expect(initialsOf('  jean  claude  van damme ')).toBe('JC');
  });

  it('is a question mark for nothing at all, rather than empty', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('isValidCaller', () => {
  it('needs a name and nothing else', () => {
    expect(isValidCaller({ name: 'Mum' })).toBe(true);
    expect(isValidCaller({ name: '   ' })).toBe(false);
    expect(isValidCaller({})).toBe(false);
  });
});
