import { vibrationPhases } from "../vibrationLoop";

describe("vibrationPhases", () => {
  // React Native's own Vibration module keeps its iOS pattern+repeat playback in JS-module-
  // level singleton state (`_vibrating` / `_id` in Vibration.js). If a second call starts
  // before a first one's cleanup has landed, the guard silently drops the new pattern and
  // leaves the OLD loop running with nothing able to stop it -- which is what testers hit as
  // a stuck, wrong-sounding, uncancellable vibration. `vibrationPhases` is what a screen uses
  // instead to drive its own single-shot `Vibration.vibrate()` calls off a timer it owns, so
  // cancellation is always under the caller's control.

  it("turns a wait/vibrate pattern into explicit on/off phases, in order", () => {
    // [wait 0, vibrate 400, wait 200, vibrate 400, wait 2000]
    expect(vibrationPhases([0, 400, 200, 400, 2000])).toEqual([
      { on: true, ms: 400 },
      { on: false, ms: 200 },
      { on: true, ms: 400 },
      { on: false, ms: 2000 },
    ]);
  });

  it("drops a leading zero-length wait entirely, per the pattern format", () => {
    const phases = vibrationPhases([0, 1000, 3000]);
    expect(phases[0]).toEqual({ on: true, ms: 1000 });
  });

  it("drops any zero-length phase, not only a leading one", () => {
    // A zero-length step can never itself be reached by a timer.
    expect(vibrationPhases([0, 500, 0, 300])).toEqual([
      { on: true, ms: 500 },
      { on: true, ms: 300 },
    ]);
  });

  it("produces nothing for an empty or all-zero pattern", () => {
    expect(vibrationPhases([])).toEqual([]);
    expect(vibrationPhases([0, 0, 0])).toEqual([]);
  });

  it("alternates on/off strictly by position, starting on", () => {
    const phases = vibrationPhases([0, 200, 150, 200, 150, 200, 700]);
    expect(phases.map((p) => p.on)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});
