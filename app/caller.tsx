import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { t } from '@/i18n';
import { FREE_PATTERN, RING_PATTERNS, canUsePattern, initialsOf } from '@/logic/ring';
import { useCallStore } from '@/store/useCallStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { MIN_TOUCH_TARGET, useTheme, withAlpha } from '@/theme';

import type { TranslationKey } from '@/i18n';

/**
 * Add or edit one caller.
 *
 * Two of the four paid claims are enforced on this screen — every ring pattern, and a photo
 * from the library. Both are checked here *and* in the store: the screen decides what to
 * offer, the store decides what may be saved, and neither trusts the other.
 */
export default function CallerEditor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();

  const callerById = useCallStore((s) => s.callerById);
  const saveCaller = useCallStore((s) => s.saveCaller);
  const removeCaller = useCallStore((s) => s.removeCaller);
  const isPremium = usePremiumStore((s) => s.isPremium);

  const existing = params.id ? callerById(params.id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(existing?.photoUri ?? null);
  const [patternId, setPatternId] = useState(existing?.patternId ?? FREE_PATTERN);
  const [invalid, setInvalid] = useState(false);

  const offerUnlock = (titleKey: TranslationKey) => {
    Alert.alert(t(titleKey), t('unlockBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('removeAdsCta'), onPress: () => router.push('/paywall') },
    ]);
  };

  const pickPhoto = async () => {
    // Deliberately before the picker opens. Asking for photo-library permission to serve a
    // feature the user has not bought is a prompt they cannot act on.
    if (!isPremium) {
      offerUnlock('photoLockedTitle');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (uri) setPhotoUri(uri);
  };

  const pickPattern = (id: string) => {
    if (!canUsePattern(id, isPremium)) {
      router.push('/paywall');
      return;
    }
    setPatternId(id);
  };

  const save = () => {
    if (name.trim().length === 0) {
      setInvalid(true);
      return;
    }
    const outcome = saveCaller(
      { id: existing?.id, name, label, photoUri, patternId },
      isPremium,
    );
    if (outcome === 'limit-reached') {
      offerUnlock('callerLimitTitle');
      return;
    }
    if (outcome === 'locked-photo' || outcome === 'locked-pattern') {
      router.push('/paywall');
      return;
    }
    if (outcome === 'invalid') {
      setInvalid(true);
      return;
    }
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    removeCaller(existing.id);
    router.back();
  };

  const field = {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.base,
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: spacing.base,
        paddingHorizontal: spacing.base,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.base,
      }}
    >
      <View style={styles.photoRow}>
        <View
          style={[
            styles.avatar,
            { borderRadius: radius.full, backgroundColor: withAlpha(colors.accent, 0.18) },
          ]}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={[styles.avatarImage, { borderRadius: radius.full }]}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text variant="display">{initialsOf(name)}</Text>
          )}
        </View>
        <View style={[styles.grow, { gap: spacing.sm }]}>
          <Button
            label={t('photoCta')}
            variant="secondary"
            icon="image"
            onPress={() => void pickPhoto()}
          />
          {photoUri ? (
            <Button label={t('photoRemove')} variant="ghost" onPress={() => setPhotoUri(null)} />
          ) : null}
        </View>
      </View>

      <Text variant="caption" tone="muted">
        {t('nameLabel')}
      </Text>
      <TextInput
        accessibilityLabel={t('nameLabel')}
        value={name}
        onChangeText={(next) => {
          setName(next);
          setInvalid(false);
        }}
        placeholder={t('nameLabel')}
        placeholderTextColor={colors.textMuted}
        style={[field, invalid ? { borderColor: colors.danger, borderWidth: 2 } : null]}
      />

      <Text variant="caption" tone="muted">
        {t('labelLabel')}
      </Text>
      <TextInput
        accessibilityLabel={t('labelLabel')}
        value={label}
        onChangeText={setLabel}
        placeholder={t('labelLabel')}
        placeholderTextColor={colors.textMuted}
        style={field}
      />

      <Text variant="heading">{t('patternTitle')}</Text>
      {RING_PATTERNS.map((pattern) => {
        const allowed = canUsePattern(pattern.id, isPremium);
        const patternName = t(pattern.nameKey as TranslationKey);
        const isChosen = pattern.id === patternId;
        return (
          <Card
            key={pattern.id}
            style={{
              borderColor: isChosen ? colors.accent : colors.border,
              borderWidth: isChosen ? 2 : StyleSheet.hairlineWidth,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                allowed ? patternName : t('patternLocked', { name: patternName })
              }
              accessibilityState={{ selected: isChosen, disabled: !allowed }}
              onPress={() => pickPattern(pattern.id)}
              style={styles.patternRow}
            >
              <Text variant="body" style={styles.grow}>
                {patternName}
              </Text>
              {allowed ? null : <Feather name="lock" size={16} color={colors.textMuted} />}
            </Pressable>
          </Card>
        );
      })}

      <Button label={t('saveCaller')} icon="check" onPress={save} />
      {existing ? (
        <Button
          label={t('deleteCaller', { name: existing.name })}
          variant="danger"
          icon="trash-2"
          onPress={remove}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 88, height: 88 },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
});
