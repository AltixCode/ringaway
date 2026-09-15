import { fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Alert } from 'react-native';

import CallerEditor from '../caller';
import { setRouteParams, testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { FREE_CALLERS, useCallStore } from '@/store/useCallStore';
import { usePremiumStore } from '@/store/usePremiumStore';

const pickerMock = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  useCallStore.setState({ callers: [], pending: null });
  setRouteParams({});
});

describe('Caller editor', () => {
  it('saves a new caller and goes back', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.changeText(getByLabelText(t('nameLabel')), 'Mum');
    await fireEvent.changeText(getByLabelText(t('labelLabel')), 'Home');
    await fireEvent.press(getByText(t('saveCaller')));
    await waitFor(() => expect(useCallStore.getState().callers).toHaveLength(1));
    expect(useCallStore.getState().callers[0]).toMatchObject({ name: 'Mum', label: 'Home' });
    expect(testRouter.back).toHaveBeenCalled();
  });

  it('will not save a caller with no name', async () => {
    const { getByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.press(getByText(t('saveCaller')));
    expect(useCallStore.getState().callers).toHaveLength(0);
    expect(testRouter.back).not.toHaveBeenCalled();
  });

  it('edits the caller named in the route rather than adding another', async () => {
    useCallStore.setState({
      callers: [{ id: 'c1', name: 'Mum', label: 'Home', photoUri: null, patternId: 'standard' }],
    });
    setRouteParams({ id: 'c1' });
    const { getByLabelText, getByText } = await renderWithProviders(<CallerEditor />);
    expect(getByLabelText(t('nameLabel')).props.value).toBe('Mum');
    await fireEvent.changeText(getByLabelText(t('nameLabel')), 'Dad');
    await fireEvent.press(getByText(t('saveCaller')));
    await waitFor(() => expect(useCallStore.getState().callers).toHaveLength(1));
    expect(useCallStore.getState().callers[0]?.name).toBe('Dad');
  });

  it('deletes the caller being edited', async () => {
    useCallStore.setState({
      callers: [{ id: 'c1', name: 'Mum', label: '', photoUri: null, patternId: 'standard' }],
    });
    setRouteParams({ id: 'c1' });
    const { getByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.press(getByText(t('deleteCaller', { name: 'Mum' })));
    await waitFor(() => expect(useCallStore.getState().callers).toHaveLength(0));
  });

  it('offers no delete button while adding — there is nothing to delete', async () => {
    const { queryByText } = await renderWithProviders(<CallerEditor />);
    expect(queryByText(t('deleteCaller', { name: '' }))).toBeNull();
  });

  it('sends a free user picking a locked pattern to the paywall, and keeps the free one', async () => {
    const { getByLabelText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.press(getByLabelText(t('patternLocked', { name: t('ringUrgent') })));
    expect(testRouter.push).toHaveBeenCalledWith('/paywall');
  });

  // The photo is a paid claim, so the picker must not even open for a free user: a
  // permission prompt for a feature they cannot use is worse than the paywall.
  it('does not open the picker for a free user', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.press(getByText(t('photoCta')));
    expect(pickerMock.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      t('photoLockedTitle'),
      expect.any(String),
      expect.any(Array),
    );
    alert.mockRestore();
  });

  it('keeps the photo a premium user picks', async () => {
    usePremiumStore.setState({ isPremium: true, isReady: true });
    pickerMock.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///mum.jpg' }],
    } as Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>);
    const { getByLabelText, getByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.changeText(getByLabelText(t('nameLabel')), 'Mum');
    await fireEvent.press(getByText(t('photoCta')));
    await waitFor(() => expect(getByText(t('photoRemove'))).toBeTruthy());
    await fireEvent.press(getByText(t('saveCaller')));
    await waitFor(() => expect(useCallStore.getState().callers).toHaveLength(1));
    expect(useCallStore.getState().callers[0]?.photoUri).toBe('file:///mum.jpg');
  });

  // A cancelled pick is the common case and must leave the form exactly as it was.
  it('keeps no photo when the pick is cancelled', async () => {
    usePremiumStore.setState({ isPremium: true, isReady: true });
    const { getByText, queryByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.press(getByText(t('photoCta')));
    await waitFor(() => expect(pickerMock.launchImageLibraryAsync).toHaveBeenCalled());
    expect(queryByText(t('photoRemove'))).toBeNull();
  });

  it('tells a free user at the caller limit why, and offers the unlock', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useCallStore.setState({
      callers: Array.from({ length: FREE_CALLERS }, (_, i) => ({
        id: `c${i}`,
        name: `Caller ${i}`,
        label: '',
        photoUri: null,
        patternId: 'standard',
      })),
    });
    const { getByLabelText, getByText } = await renderWithProviders(<CallerEditor />);
    await fireEvent.changeText(getByLabelText(t('nameLabel')), 'One too many');
    await fireEvent.press(getByText(t('saveCaller')));
    expect(alert).toHaveBeenCalledWith(
      t('callerLimitTitle'),
      expect.any(String),
      expect.any(Array),
    );
    expect(useCallStore.getState().callers).toHaveLength(FREE_CALLERS);
    alert.mockRestore();
  });
});
