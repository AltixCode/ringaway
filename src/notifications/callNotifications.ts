import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { t } from "@/i18n";
import {
  CALL_NOTIFICATION_ID,
  CALL_NOTIFICATION_TYPE,
  callNotificationPlan,
} from "@/logic/callNotificationContent";

/**
 * The real "make it ring" half of an incoming call: a scheduled OS notification, so a call
 * still rings -- with sound, and with a shot at waking the screen -- when the app is
 * backgrounded or the phone is locked, not only while it is open in the foreground.
 *
 * **What this is not.** A true lock-screen call UI (full-screen, answered/declined without
 * unlocking) needs either Android's full-screen-intent notification category with a native
 * `Notification.Builder` (a custom native module -- `expo-notifications` does not expose it)
 * or, on iOS, CallKit backed by a VoIP push server. Neither is implemented here. What this
 * *does* give both platforms genuinely: a real, audible ring -- the device's own ringtone
 * sound on iOS (`defaultRingtone`), a channel that uses ringtone audio attributes on Android
 * -- and a notification that, tapped, opens straight to the call screen. On Android this
 * typically also lights up the screen as a heads-up notification when unlocked; on a locked
 * device it surfaces on the lock screen rather than replacing it outright.
 *
 * A thin, untested adapter over the native SDK by design -- see `jest.config.js`'s coverage
 * exclusions and `src/monetization/ads.ts` for the same pattern. `src/logic/
 * callNotificationContent.ts` holds the actual, tested content-building logic.
 */

const CALL_CHANNEL_ID = "incoming-calls";

let handlerConfigured = false;

/**
 * Even while the app is already open and showing the call screen, the notification is what
 * makes any *sound* at all -- the in-app screen is vibration and UI only, by design (see
 * `src/logic/ring.ts`). Without this handler, a notification delivered while the app is
 * foregrounded is suppressed by default and that sound never plays.
 */
export function configureCallNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

let channelReady: Promise<void> | null = null;

/**
 * A dedicated Android channel declared with ringtone audio attributes -- the same usage a
 * real phone dialer declares -- so this notification's sound genuinely follows the ringer /
 * silent switch and ring volume the way an incoming call does, rather than the generic
 * notification stream a default channel would use.
 */
function ensureCallChannel(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: "Incoming calls",
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      sound: "default",
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: false,
    }).then(() => undefined);
  }
  return channelReady;
}

/**
 * Asks for notification permission if it has not already been decided. Never re-prompts once
 * the user has said no -- a repeated OS prompt for something already declined is the kind of
 * thing that gets an app flagged in review, not just annoying.
 */
export async function requestCallNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain === false) return false;
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Schedules the one pending call's notification, replacing whatever was scheduled before it
 * (there is only ever one call pending at a time -- see `useCallStore`). Failure here is
 * silent and non-fatal: the in-app foreground countdown in `app/index.tsx` is the fallback,
 * so a user who has the app open when the call comes due is never depending on this having
 * worked.
 */
export async function scheduleCallNotification(params: {
  callerId: string;
  callerName: string;
  vibrationPattern: number[];
  at: number;
}): Promise<void> {
  try {
    const granted = await requestCallNotificationPermission();
    if (!granted) return;
    await ensureCallChannel();
    const plan = callNotificationPlan({
      callerId: params.callerId,
      callerName: params.callerName,
      incomingCallLabel: t("incomingCall"),
      vibrationPattern: params.vibrationPattern,
    });
    await cancelCallNotification();
    await Notifications.scheduleNotificationAsync({
      identifier: plan.identifier,
      content: {
        title: plan.title,
        body: plan.body,
        data: plan.data,
        sound: Platform.OS === "ios" ? "defaultRingtone" : "default",
        vibrate: plan.androidVibrationPattern,
        priority: "max",
        interruptionLevel: "timeSensitive",
        autoDismiss: false,
        sticky: Platform.OS === "android",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: params.at,
        channelId: CALL_CHANNEL_ID,
      },
    });
  } catch {
    // Scheduling can fail for reasons outside the app's control (OS quirk, permission
    // revoked mid-flight). The foreground fallback still applies.
  }
}

/** Cancels the pending call notification and dismisses it if it has already been delivered --
 * a cancelled or answered call must not go on ringing from the notification shade too. */
export async function cancelCallNotification(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(CALL_NOTIFICATION_ID);
  } catch {
    // Nothing was scheduled.
  }
  try {
    await Notifications.dismissNotificationAsync(CALL_NOTIFICATION_ID);
  } catch {
    // Nothing was presented.
  }
}

/**
 * Fires when the user taps the notification (including the OS bringing the app forward for
 * it). Returns an unsubscribe function, the same shape every other listener in this app uses.
 */
export function addCallNotificationResponseListener(
  onIncomingCall: (callerId: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        { type?: string; callerId?: string } | undefined;
      if (
        data?.type === CALL_NOTIFICATION_TYPE &&
        typeof data.callerId === "string"
      ) {
        onIncomingCall(data.callerId);
      }
    },
  );
  return () => sub.remove();
}
