import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAutomations,
  defaultState,
  demoState,
  reducer,
  validateState,
  type AppState,
  type FinancialAction,
} from "@danasiap/core";

const KEY = "danasiap.web.v1";
export type Mode = "personal" | "demo";
type Saved = {
  state: AppState;
  mode: Mode;
  initialized: boolean;
  revision: number;
  owner: string | null;
};

function decode(raw: string): Saved {
  const parsed = JSON.parse(raw);
  if (!Number.isSafeInteger(parsed.revision ?? 0) || (parsed.revision ?? 0) < 0)
    throw new Error("Versi catatan tidak valid.");
  if (parsed.owner != null && typeof parsed.owner !== "string")
    throw new Error("Pemilik catatan tidak valid.");
  return {
    state: validateState(parsed.state),
    mode: parsed.mode === "demo" ? "demo" : "personal",
    initialized: Boolean(parsed.initialized),
    revision: parsed.revision ?? 0,
    owner: parsed.owner ?? null,
  };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      return decode(raw);
    }
  } catch {
    // Preserve the original bytes for recovery; never silently replace malformed records.
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}.recovery.${Date.now()}`, raw);
    } catch {
      /* Storage may be disabled; keep the original key untouched. */
    }
  }
  const demo = new URLSearchParams(location.search).has("demo");
  return {
    state: demo ? demoState() : defaultState(),
    mode: demo ? "demo" : "personal",
    initialized: demo,
    revision: 0,
    owner: null,
  };
}

export function useFinance() {
  const [saved, setSaved] = useState<Saved>(load);
  const current = useRef(saved);
  const epoch = useRef(0);
  const [storageError, setStorageError] = useState("");
  const persist = useCallback((next: Saved) => {
    current.current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "Penyimpanan perangkat penuh. Ekspor data sebelum menutup aplikasi.",
      );
    }
    setSaved(next);
  }, []);
  const read = useCallback(
    () => ({ ...current.current, epoch: epoch.current }),
    [],
  );
  const dispatch = (action: FinancialAction) =>
    persist({
      ...current.current,
      state: reducer(current.current.state, action),
    });
  const start = (state: AppState, mode: Mode = "personal") => {
    const valid = validateState(state);
    epoch.current++;
    persist({
      state: valid,
      mode,
      initialized: true,
      revision: 0,
      owner: null,
    });
  };
  const replace = (
    state: AppState,
    revision = 0,
    owner: string | null = null,
  ) => {
    const valid = validateState(state);
    epoch.current++;
    persist({
      state: valid,
      mode: "personal",
      initialized: true,
      revision,
      owner,
    });
  };
  const setCloudRevision = (
    revision: number,
    owner: string,
    expectedEpoch: number,
  ) => {
    if (
      epoch.current !== expectedEpoch ||
      (current.current.owner && current.current.owner !== owner)
    )
      return false;
    // A network response may finish after another transaction. Update metadata only.
    persist({ ...current.current, revision, owner });
    return true;
  };
  const activateAccount = useCallback(
    (userId: string | null) => {
      const latest = current.current;
      if (latest.owner === userId) return;
      const accountRaw = userId
        ? localStorage.getItem(`${KEY}.account.${userId}`)
        : localStorage.getItem(`${KEY}.guest`);
      const restored = accountRaw ? decode(accountRaw) : null;
      if (restored && restored.owner !== userId)
        throw new Error("Pemilik cadangan lokal tidak cocok dengan akun.");
      if (latest.owner)
        localStorage.setItem(
          `${KEY}.account.${latest.owner}`,
          JSON.stringify(latest),
        );
      else if (restored && latest.initialized)
        localStorage.setItem(`${KEY}.guest`, JSON.stringify(latest));
      // Keep unowned local records for the user's explicit first-upload choice.
      if (!latest.owner && !restored) return;
      epoch.current++;
      persist(
        restored ?? {
          state: defaultState(),
          mode: "personal",
          initialized: true,
          revision: 0,
          owner: null,
        },
      );
    },
    [persist],
  );
  // Workdays and daily items are recorded automatically; only exceptions need to be recorded.
  useEffect(() => {
    const autoFill = () => {
      const latest = current.current;
      if (!latest.initialized || latest.mode === "demo") return;
      try {
        const state = applyAutomations(latest.state);
        if (state !== latest.state) persist({ ...latest, state });
      } catch {
        /* Leave records untouched if they cannot be completed automatically. */
      }
    };
    autoFill();
    document.addEventListener("visibilitychange", autoFill);
    return () => document.removeEventListener("visibilitychange", autoFill);
  }, [saved, persist]);
  return {
    ...saved,
    dispatch,
    start,
    replace,
    setCloudRevision,
    activateAccount,
    read,
    storageError,
  };
}
