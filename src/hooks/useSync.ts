import { useCallback, useEffect, useState } from "react";
import { pendingCounts } from "../lib/db";
import { sync, type SyncState } from "../lib/sync";

const AUTO_SYNC_MS = 30_000;

/** Drží stav synchronizace a spouští ji: po startu, při návratu signálu,
 *  po probuzení karty a jinak každých 30 s. */
export function useSyncEngine(enabled: boolean) {
  const [state, setState] = useState<SyncState>("idle");
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshPending = useCallback(async () => {
    const counts = await pendingCounts();
    setPending(counts.matches + counts.events + counts.roster);
  }, []);

  const run = useCallback(async () => {
    if (!enabled) return;
    setState("syncing");
    const result = await sync();
    setState(result.state);
    setError(result.error);
    if (result.state === "idle") setLastSyncedAt(new Date());
    await refreshPending();
  }, [enabled, refreshPending]);

  /** Zavolá se po každém lokálním zápisu, aby se ukazatel hned aktualizoval. */
  const notifyLocalChange = useCallback(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!enabled) return;
    void run();

    const onOnline = () => void run();
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    const onOffline = () => setState("offline");
    const timer = window.setInterval(() => void run(), AUTO_SYNC_MS);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, run]);

  return { state, pending, error, lastSyncedAt, sync: run, notifyLocalChange };
}
