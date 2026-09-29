/**
 * Turning a `Vibration.vibrate` pattern into a sequence of on/off phases a screen can drive
 * itself, instead of handing the pattern to React Native's own repeat logic.
 *
 * React Native's `Vibration.js` implements iOS pattern+repeat playback with module-level
 * singleton state (`_vibrating`, `_id`) shared by the whole app. A second `vibrate(pattern,
 * true)` call issued before a first one's `cancel()` has actually landed is silently dropped
 * by that guard, leaving the FIRST loop still running with nothing able to stop it -- a stuck,
 * wrong pattern, with no working cancel. That is what testers described: continuous vibration,
 * sometimes the wrong pattern, no way to stop it short of force-closing the app.
 *
 * `vibrationPhases` lets a screen own its own timer instead: a `setTimeout` it schedules,
 * tracks and always clears itself, calling single-shot `Vibration.vibrate()` for each "on"
 * phase. That sidesteps the singleton entirely, so a screen's own cleanup is always sufficient
 * to stop it. See `app/call.tsx`.
 */

export interface VibrationPhase {
  /** Whether the device should be vibrating for this phase. */
  on: boolean;
  /** How long this phase lasts, in milliseconds. Always greater than zero. */
  ms: number;
}

/**
 * Expands one alternating wait/vibrate pattern -- `[wait, vibrate, wait, vibrate, …]`, the
 * shape every `RingPattern` in `src/logic/ring.ts` uses -- into explicit phases for one full
 * cycle. Phase parity comes from position (even index waits, odd index vibrates), decided
 * before zero-length entries are dropped, so two real phases of the same kind can end up
 * adjacent when the phase separating them was zero-length -- that is correct: a zero-length
 * wait or buzz is not a phase a timer could ever land on.
 */
export function vibrationPhases(pattern: number[]): VibrationPhase[] {
  const phases: VibrationPhase[] = [];
  pattern.forEach((ms, index) => {
    if (ms <= 0) return;
    phases.push({ on: index % 2 === 1, ms });
  });
  return phases;
}
