/**
 * Ring patterns, and when a fake call should arrive.
 *
 * **On what this app does and does not have.** There are no bundled ringtones or voice packs:
 * those are audio assets, none ship with the app, and a claim with nothing behind it is the
 * same failure as inventing data. What *is* here is a vibration pattern — an array of
 * millisecond durations — which is computable, testable and real by construction. The paywall
 * says "every ring and vibration pattern" because that is what the app has.
 *
 * Pure and dependency-free: the current time is always passed in, so every scheduling rule is
 * testable without waiting for one.
 */

export interface RingPattern {
  id: string;
  nameKey: string;
  /**
   * Alternating wait/vibrate durations in milliseconds, starting with a wait — the shape
   * React Native's `Vibration.vibrate` takes on Android, and the one iOS approximates.
   */
  pattern: number[];
}

/** The one pattern a free user gets. */
export const FREE_PATTERN = "standard";

export const RING_PATTERNS: RingPattern[] = [
  // A UK-style double ring: two short pulses, then a long gap.
  {
    id: "standard",
    nameKey: "ringStandard",
    pattern: [0, 400, 200, 400, 2000],
  },
  // One long pulse, the North American cadence.
  { id: "single", nameKey: "ringSingle", pattern: [0, 1000, 3000] },
  // Insistent: short, fast, no long gap to hide behind.
  {
    id: "urgent",
    nameKey: "ringUrgent",
    pattern: [0, 200, 150, 200, 150, 200, 700],
  },
  // Barely there, for getting out of something quietly.
  { id: "gentle", nameKey: "ringGentle", pattern: [0, 150, 2500] },
  // A single tap, then silence — reads as a message rather than a call.
  { id: "onceOnly", nameKey: "ringOnceOnly", pattern: [0, 300] },
];

export const patternById = (id: string): RingPattern =>
  RING_PATTERNS.find((p) => p.id === id) ?? RING_PATTERNS[0]!;

export function canUsePattern(id: string, isPremium: boolean): boolean {
  if (!RING_PATTERNS.some((p) => p.id === id)) return false;
  return isPremium || id === FREE_PATTERN;
}

/** How long one full cycle of a pattern lasts. */
export function patternMs(pattern: RingPattern): number {
  return pattern.pattern.reduce((total, ms) => total + ms, 0);
}

/** The delays offered on the setup screen, in seconds. */
export const DELAY_PRESETS = [5, 15, 30, 60, 300, 900] as const;
export type DelayPreset = (typeof DELAY_PRESETS)[number];

/** Delays a free user may pick. The purchase opens the rest. */
export const FREE_DELAYS: number[] = [15];

export function canUseDelay(seconds: number, isPremium: boolean): boolean {
  if (!DELAY_PRESETS.includes(seconds as DelayPreset)) return false;
  return isPremium || FREE_DELAYS.includes(seconds);
}

/**
 * When a call scheduled now should arrive.
 *
 * An absolute timestamp, not a countdown: the app may be backgrounded or killed between
 * scheduling and ringing, and a counter would simply stop. This is the same reason Multitick
 * stores an end time rather than a remaining duration.
 */
export function ringAt(now: number, delaySeconds: number): number {
  if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) return now;
  return now + delaySeconds * 1000;
}

export function msUntil(ringAtMs: number, now: number): number {
  return Math.max(0, ringAtMs - now);
}

export function isDue(ringAtMs: number, now: number): boolean {
  return now >= ringAtMs;
}

/** `m:ss`, for the countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, "0")}`;
}

export interface Caller {
  id: string;
  name: string;
  /** Free text — "Mum", "Work", a job title. Shown under the name on the call screen. */
  label: string;
  /** A local file URI from the photo library, or null for initials. */
  photoUri: string | null;
  patternId: string;
}

/** Initials for a caller with no photo. At most two letters, uppercased. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((w) => w.charAt(0));
  return letters.join("").toUpperCase();
}

/** A caller is usable when it has a name; everything else has a sensible default. */
export function isValidCaller(caller: Partial<Caller>): boolean {
  return typeof caller.name === "string" && caller.name.trim().length > 0;
}
