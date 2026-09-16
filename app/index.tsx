import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BannerAdSlot } from '@/components/BannerAdSlot';
import { Button, Card, Text } from '@/components/ui';
import { t } from '@/i18n';
import {
  DELAY_PRESETS,
  canUseDelay,
  formatCountdown,
  initialsOf,
  isDue,
  msUntil,
  type Caller,
} from '@/logic/ring';
import { useCallStore } from '@/store/useCallStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { MIN_TOUCH_TARGET, useTheme, withAlpha } from '@/theme';
import { useTabletColumn } from '@/theme/useTabletColumn';

/**
 * The countdown redraws at this rate. Nothing is *counted* here — the remaining time is
 * derived from the stored absolute `at` on every tick — so a missed tick costs a frame and
 * never a second, and the app can be backgrounded and returned to without drifting.
 */
const TICK_MS = 250;

/** A delay's own label, and the label shown when it is locked. */
function delayLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  // `count` is what picks the singular sibling key; `n` is what is interpolated. One
  // preset is exactly a minute, and "1 minutes" is the kind of thing a reviewer screenshots.
  return seconds < 60
    ? t('delaySeconds', { n: seconds, count: seconds })
    : t('delayMinutes', { n: minutes, count: minutes });
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();
  const tabletColumn = useTabletColumn();

  const callers = useCallStore((s) => s.callers);
  const pending = useCallStore((s) => s.pending);
  const hydrate = useCallStore((s) => s.hydrate);
  const schedule = useCallStore((s) => s.schedule);
  const cancel = useCallStore((s) => s.cancel);

  const isPremium = usePremiumStore((s) => s.isPremium);

  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [delay, setDelay] = useState<number>(DELAY_PRESETS[0]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Selection follows the list: the first caller by default, and never one that has been
  // deleted — scheduling against a missing caller is the one way to get a blank call screen.
  const selected: Caller | undefined =
    callers.find((c) => c.id === selectedId) ?? callers[0] ?? undefined;

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [pending]);

  // Returning from the background resyncs at once rather than on the next tick, so the first
  // frame after a return is already right — including a call that came due while away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  // The call arriving is a navigation, not a render: it happens the moment the stored time
  // passes, including immediately on open if it passed while the app was closed.
  useEffect(() => {
    if (pending && isDue(pending.at, now)) router.replace('/call');
  }, [pending, now, router]);

  const pickDelay = useCallback(
    (seconds: number) => {
      if (!canUseDelay(seconds, isPremium)) {
        router.push('/paywall');
        return;
      }
      setDelay(seconds);
    },
    [isPremium, router],
  );

  const start = () => {
    if (!selected) return;
    // One timestamp for both the target and the display. Letting `schedule` take its own
    // `Date.now()` puts the ring a millisecond past this render's `now`, and the first
    // countdown frame then rounds up — a 15-second call that opens saying 0:16.
    const at = Date.now();
    setNow(at);
    if (schedule(selected.id, delay, isPremium, at) === 'locked-delay') router.push('/paywall');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.base,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.xl,
          gap: spacing.base,
        
          ...tabletColumn,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text variant="title" style={styles.grow}>
            {t('appName')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settingsTitle')}
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={styles.iconSlot}
          >
            <Feather name="settings" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text variant="caption" tone="muted">
          {t('silentNote')}
        </Text>

        <Text variant="heading">{t('callersTitle')}</Text>

        {callers.length === 0 ? (
          <Text variant="body" tone="muted">
            {t('noCallers')}
          </Text>
        ) : (
          callers.map((caller) => {
            const isSelected = caller.id === selected?.id;
            return (
              <Card
                key={caller.id}
                style={{
                  borderColor: isSelected ? colors.accent : colors.border,
                  borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedId(caller.id)}
                  onLongPress={() =>
                    router.push({ pathname: '/caller', params: { id: caller.id } })
                  }
                  style={styles.callerRow}
                >
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
                      <Text variant="heading">{initialsOf(caller.name)}</Text>
                    )}
                  </View>
                  <View style={styles.grow}>
                    <Text variant="body">{caller.name}</Text>
                    {caller.label ? (
                      <Text variant="caption" tone="muted">
                        {caller.label}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('editCaller', { name: caller.name })}
                    hitSlop={8}
                    onPress={() => router.push({ pathname: '/caller', params: { id: caller.id } })}
                    style={styles.iconSlot}
                  >
                    <Feather name="edit-2" size={18} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              </Card>
            );
          })
        )}

        <Button
          label={t('newCaller')}
          variant="secondary"
          icon="user-plus"
          onPress={() => router.push('/caller')}
        />

        <Text variant="heading" style={{ marginTop: spacing.base }}>
          {t('delayTitle')}
        </Text>
        <View style={[styles.chipRow, { gap: spacing.sm }]}>
          {DELAY_PRESETS.map((seconds) => {
            const allowed = canUseDelay(seconds, isPremium);
            const label = delayLabel(seconds);
            const isChosen = seconds === delay;
            return (
              <Pressable
                key={seconds}
                accessibilityRole="button"
                // A locked chip says it is locked in its own label: a screen reader user
                // must not have to press it to find out.
                accessibilityLabel={allowed ? label : t('delayLocked', { label })}
                accessibilityState={{ selected: isChosen, disabled: !allowed }}
                onPress={() => pickDelay(seconds)}
                style={[
                  styles.chip,
                  {
                    borderRadius: radius.full,
                    paddingHorizontal: spacing.base,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: isChosen ? colors.accent : colors.border,
                    backgroundColor: isChosen ? withAlpha(colors.accent, 0.16) : colors.surface,
                  },
                ]}
              >
                <Text variant="body" tone={allowed ? 'default' : 'muted'}>
                  {label}
                </Text>
                {allowed ? null : <Feather name="lock" size={14} color={colors.textMuted} />}
              </Pressable>
            );
          })}
        </View>

        {pending ? (
          <>
            <Text variant="display">
              {t('ringingIn', { time: formatCountdown(msUntil(pending.at, now)) })}
            </Text>
            <Button label={t('cancelCall')} variant="danger" onPress={cancel} />
          </>
        ) : (
          <Button
            label={t('scheduleCta')}
            icon="phone-incoming"
            onPress={start}
            disabled={!selected}
          />
        )}
      </ScrollView>
      <BannerAdSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  iconSlot: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 48, height: 48 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
  },
});
