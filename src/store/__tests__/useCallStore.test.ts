import AsyncStorage from '@react-native-async-storage/async-storage';

import { CALL_CACHE_KEY, FREE_CALLERS, MAX_CALLERS, useCallStore } from '../useCallStore';
import { FREE_DELAYS, FREE_PATTERN } from '@/logic/ring';

const base = { name: 'Mum', label: 'Home', photoUri: null, patternId: FREE_PATTERN };
const FREE_DELAY = FREE_DELAYS[0]!;

const reset = () => useCallStore.setState({ callers: [], pending: null });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  reset();
});

describe('saving callers', () => {
  it('saves one', () => {
    expect(useCallStore.getState().saveCaller(base, false)).toBe('saved');
    expect(useCallStore.getState().callers[0]!.name).toBe('Mum');
  });

  it('refuses one with no name', () => {
    expect(useCallStore.getState().saveCaller({ ...base, name: '  ' }, false)).toBe('invalid');
  });

  it('refuses a locked pattern to a free user', () => {
    expect(useCallStore.getState().saveCaller({ ...base, patternId: 'urgent' }, false)).toBe(
      'locked-pattern',
    );
  });

  it('refuses a photo to a free user', () => {
    // If the UI ever lets a free user pick one, the store still holds the line.
    expect(useCallStore.getState().saveCaller({ ...base, photoUri: 'file:///x.jpg' }, false)).toBe(
      'locked-photo',
    );
  });

  it('allows both for a paying user', () => {
    expect(
      useCallStore.getState().saveCaller(
        { ...base, patternId: 'urgent', photoUri: 'file:///x.jpg' },
        true,
      ),
    ).toBe('saved');
  });

  it('stops a free user at the caller cap', () => {
    for (let i = 0; i < FREE_CALLERS; i += 1) {
      expect(useCallStore.getState().saveCaller({ ...base, name: `C${i}` }, false)).toBe('saved');
    }
    expect(useCallStore.getState().saveCaller({ ...base, name: 'Extra' }, false)).toBe(
      'limit-reached',
    );
  });

  it('still lets a free user edit one they already keep', () => {
    useCallStore.getState().saveCaller({ ...base, name: 'First' }, false);
    useCallStore.getState().saveCaller({ ...base, name: 'Second' }, false);
    const id = useCallStore.getState().callers[0]!.id;

    expect(useCallStore.getState().saveCaller({ ...base, id, name: 'Renamed' }, false)).toBe('saved');
    expect(useCallStore.getState().callers).toHaveLength(FREE_CALLERS);
    expect(useCallStore.getState().callerById(id)!.name).toBe('Renamed');
  });

  it('caps even a paying user', () => {
    for (let i = 0; i < MAX_CALLERS; i += 1) {
      useCallStore.getState().saveCaller({ ...base, name: `C${i}` }, true);
    }
    expect(useCallStore.getState().saveCaller({ ...base, name: 'Extra' }, true)).toBe(
      'limit-reached',
    );
  });

  it('removes a caller', () => {
    useCallStore.getState().saveCaller(base, false);
    useCallStore.getState().removeCaller(useCallStore.getState().callers[0]!.id);
    expect(useCallStore.getState().callers).toHaveLength(0);
  });
});

describe('scheduling', () => {
  const withCaller = () => {
    useCallStore.getState().saveCaller(base, false);
    return useCallStore.getState().callers[0]!.id;
  };

  it('schedules an absolute moment', () => {
    const id = withCaller();
    expect(useCallStore.getState().schedule(id, FREE_DELAY, false, 1_000_000)).toBe('scheduled');
    expect(useCallStore.getState().pending).toEqual({
      callerId: id,
      at: 1_000_000 + FREE_DELAY * 1000,
    });
  });

  it('refuses a locked delay', () => {
    const id = withCaller();
    expect(useCallStore.getState().schedule(id, 900, false)).toBe('locked-delay');
    expect(useCallStore.getState().pending).toBeNull();
  });

  it('allows it once paid', () => {
    const id = withCaller();
    expect(useCallStore.getState().schedule(id, 900, true)).toBe('scheduled');
  });

  it('refuses a caller it does not have', () => {
    expect(useCallStore.getState().schedule('nope', FREE_DELAY, true)).toBe('unknown-caller');
  });

  it('cancels', () => {
    const id = withCaller();
    useCallStore.getState().schedule(id, FREE_DELAY, false);
    useCallStore.getState().cancel();
    expect(useCallStore.getState().pending).toBeNull();
  });

  it('drops a pending call when its caller is deleted', () => {
    // Otherwise it rings with a blank screen.
    const id = withCaller();
    useCallStore.getState().schedule(id, FREE_DELAY, false);
    useCallStore.getState().removeCaller(id);
    expect(useCallStore.getState().pending).toBeNull();
  });
});

describe('persistence', () => {
  it('round-trips callers', async () => {
    useCallStore.getState().saveCaller(base, false);
    await useCallStore.getState().persist();

    reset();
    await useCallStore.getState().hydrate();
    expect(useCallStore.getState().callers[0]!.name).toBe('Mum');
  });

  it('drops a pending call that is already in the past', async () => {
    // A stale one would ring the instant the app opened.
    await AsyncStorage.setItem(
      CALL_CACHE_KEY,
      JSON.stringify({
        callers: [{ id: 'a', name: 'Mum', label: '', photoUri: null, patternId: FREE_PATTERN }],
        pending: { callerId: 'a', at: 1 },
      }),
    );
    await useCallStore.getState().hydrate();
    expect(useCallStore.getState().pending).toBeNull();
  });

  it('drops a pending call whose caller no longer exists', async () => {
    await AsyncStorage.setItem(
      CALL_CACHE_KEY,
      JSON.stringify({ callers: [], pending: { callerId: 'gone', at: Date.now() + 60_000 } }),
    );
    await useCallStore.getState().hydrate();
    expect(useCallStore.getState().pending).toBeNull();
  });

  it('keeps a pending call that is still in the future', async () => {
    const at = Date.now() + 60_000;
    await AsyncStorage.setItem(
      CALL_CACHE_KEY,
      JSON.stringify({
        callers: [{ id: 'a', name: 'Mum', label: '', photoUri: null, patternId: FREE_PATTERN }],
        pending: { callerId: 'a', at },
      }),
    );
    await useCallStore.getState().hydrate();
    expect(useCallStore.getState().pending).toEqual({ callerId: 'a', at });
  });

  it('starts empty on stored rubbish', async () => {
    await AsyncStorage.setItem(CALL_CACHE_KEY, '{"callers":"none","pending":7}');
    await useCallStore.getState().hydrate();
    expect(useCallStore.getState().callers).toEqual([]);
    expect(useCallStore.getState().pending).toBeNull();
  });
});
