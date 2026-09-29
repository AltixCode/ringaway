import {
  CALL_NOTIFICATION_ID,
  callNotificationPlan,
} from "../callNotificationContent";

describe("callNotificationPlan", () => {
  const base = {
    callerId: "c1",
    callerName: "Mum",
    incomingCallLabel: "Incoming call",
    vibrationPattern: [0, 400, 200, 400, 2000],
  };

  it("always uses the one fixed identifier, so a re-schedule replaces rather than doubles up", () => {
    expect(callNotificationPlan(base).identifier).toBe(CALL_NOTIFICATION_ID);
    expect(callNotificationPlan({ ...base, callerId: "c2" }).identifier).toBe(
      CALL_NOTIFICATION_ID,
    );
  });

  it("titles the notification with the caller, and bodies it with the incoming-call label", () => {
    const plan = callNotificationPlan(base);
    expect(plan.title).toBe("Mum");
    expect(plan.body).toBe("Incoming call");
  });

  it("carries the caller id and a recognisable type in its data, for the response handler", () => {
    const plan = callNotificationPlan(base);
    expect(plan.data).toEqual({
      type: "ringaway-incoming-call",
      callerId: "c1",
    });
  });

  it("drops the leading zero from the vibration pattern, which Android does not vibrate on", () => {
    expect(callNotificationPlan(base).androidVibrationPattern).toEqual([
      400, 200, 400, 2000,
    ]);
  });

  it("falls back to a plain single buzz when the pattern is empty or starts non-zero", () => {
    expect(
      callNotificationPlan({ ...base, vibrationPattern: [] })
        .androidVibrationPattern,
    ).toEqual([0, 400]);
    expect(
      callNotificationPlan({ ...base, vibrationPattern: [500, 200] })
        .androidVibrationPattern,
    ).toEqual([0, 400]);
  });

  it("falls back to the incoming-call label when the caller has no name", () => {
    expect(callNotificationPlan({ ...base, callerName: "" }).title).toBe(
      "Incoming call",
    );
  });
});
