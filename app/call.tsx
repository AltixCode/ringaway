import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { formatCountdown, initialsOf, patternById } from '@/logic/ring';
import { shouldShowInterstitial } from '@/monetization/adPolicy';
import { shouldShowAds } from '@/monetization/entitlements';
import { showInterstitial } from '@/monetization/interstitial';
import { useCallStore } from '@/store/useCallStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { MIN_TOUCH_TARGET, readableTextOn, useTheme, withAlpha } from '@/theme';

/** How often the connected-call timer redraws. It is derived from a start time, never counted. */
const TICK_MS = 500;

/**
 * The call itself.
 *
 * **What this is.** A ring and a vibration pattern on a screen that looks like a call. There
 * is no audio and nobody speaks — `silentNote` says so on the screen, because a user who
 * expects a voice has been misled, and so has a reviewer.
 *
 * No banner here: the screen imitates a system call screen, and an ad on it is both
 * dishonest and an AdMob placement problem. The interstitial comes after the call ends,
 * on the way back to a screen that is plainly the app's own.
 */
export default function IncomingCall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const pending = useCallStore((s) => s.pending);
  const callerById = useCallStore((s) => s.callerById);
  const cancel = useCallStore((s) => s.cancel);

  const isPremium = usePremiumStore((s) => s.isPremium);
  const isReady = usePremiumStore((s) => s.isReady);

  const caller = pending ? callerById(pending.callerId) : undefined;

  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const calls = useRef(0);

  // Nothing pending means a stale deep link or a call cancelled elsewhere. Leaving is the
  // only honest option: the alternative is a call from nobody.
  useEffect(() => {
    if (!pending || !caller) router.replace('/');
  }, [pending, caller, router]);

  useEffect(() => {
    if (!caller || answeredAt !== null) return;
    Vibration.vibrate(patternById(caller.patternId).pattern, true);
    return () => Vibration.cancel();
  }, [caller, answeredAt]);

  useEffect(() => {
    if (answeredAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [answeredAt]);

  const leave = () => {
    Vibration.cancel();
    cancel();
    calls.current += 1;
    if (
      shouldShowAds({ isPremium, isReady }) &&
      shouldShowInterstitial({
        gamesPlayed: calls.current,
        lastInterstitialAt: 0,
        now: Date.now(),
        adsRemoved: isPremium,
      })
    ) {
      showInterstitial();
    }
    router.replace('/');
  };

  const answer = () => {
    Vibration.cancel();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAnsweredAt(Date.now());
    setNow(Date.now());
  };

  if (!caller) return null;

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.base,
        },
      ]}
    >
      <View style={[styles.header, { gap: spacing.sm }]}>
        <Text variant="caption" tone="muted">
          {answeredAt === null ? t('incomingCall') : t('inCall')}
        </Text>
        <View
          style={[
            styles.avatar,
            { borderRadius: radius.full, backgroundColor: withAlpha(colors.accent, 0.18) },
          ]}
        >
          {caller.photoUri ? (
            <Image
              source={{ uri: caller.photoUri }}
              style={[styles.avatarImage, { borderRadius: radius.full }]}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text variant="display">{initialsOf(caller.name)}</Text>
          )}
        </View>
        <Text variant="display">{caller.name}</Text>
        {caller.label ? (
          <Text variant="body" tone="muted">
            {caller.label}
          </Text>
        ) : null}
        {answeredAt === null ? null : (
          <Text variant="heading">{formatCountdown(Math.max(0, now - answeredAt))}</Text>
        )}
      </View>

      <View style={[styles.footer, { gap: spacing.base }]}>
        <Text variant="caption" tone="muted" style={styles.note}>
          {t('silentNote')}
        </Text>
        <View style={styles.actions}>
          {answeredAt === null ? (
            <>
              <CallAction
                label={t('declineCta')}
                icon="phone-off"
                background={colors.danger}
                radius={radius.full}
                onPress={leave}
              />
              <CallAction
                label={t('acceptCta')}
                icon="phone-call"
                background={colors.success}
                radius={radius.full}
                onPress={answer}
              />
            </>
          ) : (
            <CallAction
              label={t('endCta')}
              icon="phone-off"
              background={colors.danger}
              radius={radius.full}
              onPress={leave}
            />
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * One round call-screen button.
 *
 * A component rather than a function called during render: its `onPress` closes over a ref,
 * and a plain helper invoked from JSX counts as reading that ref while rendering.
 */
function CallAction({
  label,
  icon,
  background,
  radius,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  background: string;
  radius: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.action, { borderRadius: radius, backgroundColor: background }]}
    >
      <Feather name={icon} size={26} color={readableTextOn(background)} />
      <Text variant="caption" style={{ color: readableTextOn(background) }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between' },
  header: { alignItems: 'center' },
  avatar: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 132, height: 132 },
  footer: { alignItems: 'center' },
  note: { textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 48 },
  action: {
    minWidth: 76,
    minHeight: Math.max(76, MIN_TOUCH_TARGET),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
