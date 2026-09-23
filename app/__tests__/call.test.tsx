import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as KeepAwake from 'expo-keep-awake';
import React from 'react';
import { Vibration } from 'react-native';

import IncomingCall from '../call';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { patternById, RING_TIMEOUT_MS } from '@/logic/ring';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useCallStore } from '@/store/useCallStore';
import { usePremiumStore } from '@/store/usePremiumStore';

const caller = {
  id: 'c1',
  name: 'Mum',
  label: 'Home',
  photoUri: null,
  patternId: 'urgent',
};

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({
    consent: { canServeAds: true, offerPrivacyOptions: false },
  });
  useCallStore.setState({
    callers: [caller],
    pending: { callerId: 'c1', at: Date.now() },
  });
});

describe('Incoming call', () => {
  it('shows the caller, and their initials when there is no photo', async () => {
    const { getByText } = await renderWithProviders(<IncomingCall />);
    expect(getByText('Mum')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
    expect(getByText('M')).toBeTruthy();
    expect(getByText(t('incomingCall'))).toBeTruthy();
  });

  it('vibrates with the caller’s own pattern, repeating until answered', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    await renderWithProviders(<IncomingCall />);
    expect(vibrate).toHaveBeenCalledWith(patternById('urgent').pattern, true);
    vibrate.mockRestore();
  });

  it('stops vibrating and clears the call when declined', async () => {
    const cancelVibration = jest.spyOn(Vibration, 'cancel').mockImplementation(() => undefined);
    const { getByText } = await renderWithProviders(<IncomingCall />);
    await fireEvent.press(getByText(t('declineCta')));
    expect(cancelVibration).toHaveBeenCalled();
    await waitFor(() => expect(useCallStore.getState().pending).toBeNull());
    expect(testRouter.replace).toHaveBeenCalledWith('/');
    cancelVibration.mockRestore();
  });

  it('answers into a connected call, and stops ringing', async () => {
    const cancelVibration = jest.spyOn(Vibration, 'cancel').mockImplementation(() => undefined);
    const { getByText, queryByText } = await renderWithProviders(<IncomingCall />);
    await fireEvent.press(getByText(t('acceptCta')));
    expect(cancelVibration).toHaveBeenCalled();
    expect(getByText(t('inCall'))).toBeTruthy();
    expect(queryByText(t('acceptCta'))).toBeNull();
    await fireEvent.press(getByText(t('endCta')));
    await waitFor(() => expect(testRouter.replace).toHaveBeenCalledWith('/'));
    cancelVibration.mockRestore();
  });

  // The screen is honest about what it is. Without this, a user can reasonably expect
  // a voice on the other end — and a store reviewer reasonably expects one too.
  it('says plainly that there is no audio', async () => {
    const { getByText } = await renderWithProviders(<IncomingCall />);
    expect(getByText(t('silentNote'))).toBeTruthy();
  });

  // Reached with nothing pending — a stale deep link, or a call cancelled on another
  // screen. Anything but leaving would show a call from nobody.
  it('leaves immediately when there is no pending call', async () => {
    useCallStore.setState({ pending: null });
    await renderWithProviders(<IncomingCall />);
    await waitFor(() => expect(testRouter.replace).toHaveBeenCalledWith('/'));
  });

  // No banner over a ringing phone: the screen imitates a system call screen, and an ad
  // on it is both a bad lie and an AdMob policy problem.
  it('shows no ad while the phone is ringing', async () => {
    const { queryByTestId } = await renderWithProviders(<IncomingCall />);
    expect(queryByTestId('banner-ad')).toBeNull();
  });

  // Without this the OS is free to dim and then lock the screen while the call rings, which
  // leaves the vibration running with no reachable button to stop it — a force-close is the
  // only way out. Reported by a tester as the screen "slowly dims to white" with dead buttons.
  it('keeps the screen awake while a call is on it, and releases it on the way out', async () => {
    const activate = jest.spyOn(KeepAwake, 'activateKeepAwakeAsync').mockResolvedValue(undefined);
    const deactivate = jest.spyOn(KeepAwake, 'deactivateKeepAwake').mockResolvedValue(undefined);
    const { unmount } = await renderWithProviders(<IncomingCall />);
    await waitFor(() => expect(activate).toHaveBeenCalled());
    expect(deactivate).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(deactivate).toHaveBeenCalled());
    activate.mockRestore();
    deactivate.mockRestore();
  });

  // A safety net independent of keep-awake: even if the screen does dim or lock, or a device
  // ignores keep-awake under a power-saving mode, a call that is never answered must eventually
  // stop ringing on its own rather than vibrate forever.
  it('gives up and leaves an unanswered call once it has rung too long', async () => {
    jest.useFakeTimers();
    const cancelVibration = jest.spyOn(Vibration, 'cancel').mockImplementation(() => undefined);
    await renderWithProviders(<IncomingCall />);
    act(() => jest.advanceTimersByTime(RING_TIMEOUT_MS));
    await waitFor(() => expect(testRouter.replace).toHaveBeenCalledWith('/'));
    expect(cancelVibration).toHaveBeenCalled();
    expect(useCallStore.getState().pending).toBeNull();
    cancelVibration.mockRestore();
    jest.useRealTimers();
  });
});
