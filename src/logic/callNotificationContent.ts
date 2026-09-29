/**
 * What the scheduled "incoming call" notification says, independent of the native SDK that
 * presents it. Kept pure and testable; `src/notifications/callNotifications.ts` is the thin,
 * untested wrapper that hands this to `expo-notifications`.
 */

/** One fixed identifier for the single call a user can have pending at a time -- scheduling
 * a new one always replaces rather than stacks alongside an old one. */
export const CALL_NOTIFICATION_ID = "ringaway-incoming-call";

/** The data payload's `type`, read back in the notification-response listener. */
export const CALL_NOTIFICATION_TYPE = "ringaway-incoming-call";

/** A plain, single buzz -- what Android's notification `vibrate` field takes when there is no
 * usable caller pattern to fall back to. The leading `0` is a no-op initial delay. */
const FALLBACK_VIBRATION: number[] = [0, 400];

export interface CallNotificationPlan {
  identifier: string;
  title: string;
  body: string;
  data: { type: typeof CALL_NOTIFICATION_TYPE; callerId: string };
  /** Android's `Notification#vibrate`: this field, unlike `Vibration.vibrate`, does not treat
   * a leading `0` specially -- it is a real initial delay -- so a leading zero from the app's
   * own pattern format is dropped rather than passed through. */
  androidVibrationPattern: number[];
}

export function callNotificationPlan(params: {
  callerId: string;
  callerName: string;
  incomingCallLabel: string;
  vibrationPattern: number[];
}): CallNotificationPlan {
  const [first, ...rest] = params.vibrationPattern;
  const androidVibrationPattern =
    first === 0 && rest.length > 0 ? rest : FALLBACK_VIBRATION;

  return {
    identifier: CALL_NOTIFICATION_ID,
    title:
      params.callerName.trim().length > 0
        ? params.callerName
        : params.incomingCallLabel,
    body: params.incomingCallLabel,
    data: { type: CALL_NOTIFICATION_TYPE, callerId: params.callerId },
    androidVibrationPattern,
  };
}
