/**
 * Saved callers and the call that is pending.
 *
 * Three of the paywall's four claims are enforced here — every ring pattern, a caller photo
 * from the library, and unlimited saved callers with scheduled calls — and each takes
 * `isPremium` explicitly at the call site.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  type Caller,
  FREE_PATTERN,
  canUseDelay,
  canUsePattern,
  isValidCaller,
  ringAt,
} from '@/logic/ring';

export const CALL_CACHE_KEY = 'ringaway.state.v1';

/** Callers a free user may keep. The purchase lifts it. */
export const FREE_CALLERS = 2;
/** A ceiling even for a paying user. */
export const MAX_CALLERS = 50;

export interface Pending {
  callerId: string;
  /** Absolute moment the call should arrive. */
  at: number;
}

interface CallState {
  callers: Caller[];
  pending: Pending | null;

  saveCaller: (
    caller: Omit<Caller, 'id'> & { id?: string },
    isPremium: boolean,
  ) => 'saved' | 'limit-reached' | 'invalid' | 'locked-pattern' | 'locked-photo';
  removeCaller: (id: string) => void;
  callerById: (id: string) => Caller | undefined;
  schedule: (callerId: string, delaySeconds: number, isPremium: boolean, now?: number) =>
    | 'scheduled'
    | 'locked-delay'
    | 'unknown-caller';
  cancel: () => void;
  persist: () => Promise<void>;
  hydrate: () => Promise<void>;
}

let counter = 0;
const nextId = (): string => `${Date.now().toString(36)}-${(counter += 1).toString(36)}`;

function validCallers(value: unknown): Caller[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (c): c is Caller =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as Caller).id === 'string' &&
        typeof (c as Caller).name === 'string' &&
        (c as Caller).name.trim().length > 0,
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      label: typeof c.label === 'string' ? c.label : '',
      photoUri: typeof c.photoUri === 'string' ? c.photoUri : null,
      patternId: typeof c.patternId === 'string' ? c.patternId : FREE_PATTERN,
    }));
}

export const useCallStore = create<CallState>((set, get) => ({
  callers: [],
  pending: null,

  saveCaller(caller, isPremium) {
    if (!isValidCaller(caller)) return 'invalid';
    if (!canUsePattern(caller.patternId, isPremium)) return 'locked-pattern';
    // A photo is a paid feature, and a free user reaching this with one set means the UI let
    // them past a gate it should have held.
    if (!isPremium && caller.photoUri) return 'locked-photo';

    const { callers } = get();
    const existing = caller.id ? callers.find((c) => c.id === caller.id) : undefined;
    const limit = isPremium ? MAX_CALLERS : FREE_CALLERS;
    // Editing one you already keep is not keeping more of them.
    if (!existing && callers.length >= limit) return 'limit-reached';

    const saved: Caller = {
      id: existing?.id ?? nextId(),
      name: caller.name.trim(),
      label: caller.label?.trim() ?? '',
      photoUri: caller.photoUri ?? null,
      patternId: caller.patternId,
    };
    set((s) => ({
      callers: existing ? s.callers.map((c) => (c.id === saved.id ? saved : c)) : [...s.callers, saved],
    }));
    void get().persist();
    return 'saved';
  },

  removeCaller(id) {
    set((s) => ({
      callers: s.callers.filter((c) => c.id !== id),
      // A pending call to a caller that no longer exists would ring with a blank screen.
      pending: s.pending?.callerId === id ? null : s.pending,
    }));
    void get().persist();
  },

  callerById(id) {
    return get().callers.find((c) => c.id === id);
  },

  schedule(callerId, delaySeconds, isPremium, now = Date.now()) {
    if (!get().callerById(callerId)) return 'unknown-caller';
    if (!canUseDelay(delaySeconds, isPremium)) return 'locked-delay';
    set({ pending: { callerId, at: ringAt(now, delaySeconds) } });
    void get().persist();
    return 'scheduled';
  },

  cancel() {
    set({ pending: null });
    void get().persist();
  },

  async persist() {
    const { callers, pending } = get();
    try {
      await AsyncStorage.setItem(CALL_CACHE_KEY, JSON.stringify({ callers, pending }));
    } catch {
      // A lost caller list is survivable; a failed launch is not.
    }
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(CALL_CACHE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const record = parsed as Record<string, unknown>;
      const callers = validCallers(record.callers);
      const pending = record.pending as Pending | undefined;
      set({
        callers,
        // A pending call is kept only if it still points at a caller that exists and is
        // still in the future — a stale one would ring the moment the app opened.
        pending:
          pending &&
          typeof pending.callerId === 'string' &&
          typeof pending.at === 'number' &&
          pending.at > Date.now() &&
          callers.some((c) => c.id === pending.callerId)
            ? { callerId: pending.callerId, at: pending.at }
            : null,
      });
    } catch {
      // Unreadable storage starts empty rather than preventing launch.
    }
  },
}));
