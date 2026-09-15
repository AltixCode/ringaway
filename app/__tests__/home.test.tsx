import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import Home from '../index';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { formatCountdown } from '@/logic/ring';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useCallStore } from '@/store/useCallStore';
import { usePremiumStore } from '@/store/usePremiumStore';

const caller = {
  id: 'c1',
  name: 'Mum',
  label: 'Home',
  photoUri: null,
  patternId: 'standard',
};

beforeEach(async () => {
  jest.clearAllMocks();
  // The screen hydrates from storage on mount, so a call scheduled by an earlier test
  // arrives in the next one. Clearing it keeps each test's starting state the one it set.
  await AsyncStorage.clear();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  useCallStore.setState({ callers: [], pending: null });
});

// No `jest.restoreAllMocks()` here. It restores every spy in the process, not
// only this file's — including ones the renderer itself relies on — and the
// next test's tree then renders and is immediately torn down, which surfaces as
// "unable to find an element" on a screen that plainly renders it in isolation.

describe('Home', () => {
  it('renders the app name and routes to settings', async () => {
    const { getByText, getByLabelText } = await renderWithProviders(<Home />);
    expect(getByText(t('appName'))).toBeTruthy();
    await fireEvent.press(getByLabelText(t('settingsTitle')));
    expect(testRouter.push).toHaveBeenCalledWith('/settings');
  });

  it('shows a banner to a free user', async () => {
    const { queryByTestId } = await renderWithProviders(<Home />);
    expect(queryByTestId('banner-ad')).not.toBeNull();
  });

  it('shows no banner to a premium user — the whole point of the upgrade', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { queryByTestId } = await renderWithProviders(<Home />);
    expect(queryByTestId('banner-ad')).toBeNull();
  });

  it('says so when there is nobody to call', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    expect(getByText(t('noCallers'))).toBeTruthy();
  });

  it('lists saved callers and opens the editor for one', async () => {
    useCallStore.setState({ callers: [caller] });
    const { getByText, getByLabelText } = await renderWithProviders(<Home />);
    expect(getByText('Mum')).toBeTruthy();
    // Tapping a caller picks who calls; editing is its own control, so the primary
    // action of the screen cannot be lost to a mis-tap on a pencil.
    await fireEvent.press(getByLabelText(t('editCaller', { name: 'Mum' })));
    expect(testRouter.push).toHaveBeenCalledWith({ pathname: '/caller', params: { id: 'c1' } });
  });

  it('schedules a call at the free delay and counts it down', async () => {
    useCallStore.setState({ callers: [caller] });
    const { getByText, getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('delaySeconds', { n: 15, count: 15 })));
    await fireEvent.press(getByText(t('scheduleCta')));
    await waitFor(() => expect(useCallStore.getState().pending).not.toBeNull());
    expect(getByText(t('ringingIn', { time: formatCountdown(15_000) }))).toBeTruthy();
  });

  // The gate that the paywall is paid for: a free user picking a locked delay is sent to
  // the paywall and nothing is scheduled. A silent no-op would read as a bug.
  it('sends a free user picking a locked delay to the paywall', async () => {
    useCallStore.setState({ callers: [caller] });
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('delayLocked', { label: t('delayMinutes', { n: 5, count: 5 }) })));
    expect(testRouter.push).toHaveBeenCalledWith('/paywall');
    expect(useCallStore.getState().pending).toBeNull();
  });

  it('lets a premium user pick any delay', async () => {
    usePremiumStore.setState({ isPremium: true, isReady: true });
    useCallStore.setState({ callers: [caller] });
    const { getByText, getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('delayMinutes', { n: 5, count: 5 })));
    await fireEvent.press(getByText(t('scheduleCta')));
    await waitFor(() => expect(useCallStore.getState().pending).not.toBeNull());
    expect(testRouter.push).not.toHaveBeenCalledWith('/paywall');
  });

  it('cancels a pending call', async () => {
    useCallStore.setState({ callers: [caller], pending: { callerId: 'c1', at: Date.now() + 60_000 } });
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t('cancelCall')));
    await waitFor(() => expect(useCallStore.getState().pending).toBeNull());
  });

  // The whole app is this moment. A pending call already in the past when the screen opens
  // must go straight to the call screen rather than sit showing 0:00.
  it('goes to the call screen when the call is due', async () => {
    useCallStore.setState({ callers: [caller], pending: { callerId: 'c1', at: Date.now() - 1 } });
    await renderWithProviders(<Home />);
    await waitFor(() => expect(testRouter.replace).toHaveBeenCalledWith('/call'));
  });
});
