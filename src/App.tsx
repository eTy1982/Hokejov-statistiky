import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { cachedPlayers } from "./lib/db";
import type { Player } from "./lib/types";
import { useSyncEngine } from "./hooks/useSync";
import { SyncBadge } from "./components/SyncBadge";
import { Login } from "./screens/Login";
import { MatchList } from "./screens/MatchList";
import { MatchScreen } from "./screens/MatchScreen";
import { RosterScreen } from "./screens/RosterScreen";

const ACTIVE_MATCH_KEY = "dynamo-stats-active-match";

type Screen = { name: "list" } | { name: "match"; id: string } | { name: "roster" };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => {
    const id = localStorage.getItem(ACTIVE_MATCH_KEY);
    return id ? { name: "match", id } : { name: "list" };
  });
  const [players, setPlayers] = useState<Player[]>([]);

  const signedIn = Boolean(session);
  const syncEngine = useSyncEngine(signedIn);
  const { state, pending, error, sync, notifyLocalChange } = syncEngine;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reloadPlayers = useCallback(async () => {
    setPlayers(await cachedPlayers());
  }, []);

  useEffect(() => {
    void reloadPlayers();
  }, [reloadPlayers, state]);

  const openMatch = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_MATCH_KEY, id);
    setScreen({ name: "match", id });
  }, []);

  const goToList = useCallback(() => {
    localStorage.removeItem(ACTIVE_MATCH_KEY);
    setScreen({ name: "list" });
  }, []);

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">Načítám…</div>
    );
  }

  if (!signedIn) return <Login />;

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 border-b border-white/10 bg-night-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            className="text-left text-base font-bold tracking-tight"
            onClick={goToList}
            title="Přehled zápasů"
          >
            Dynamo <span className="text-ice-400">statistiky</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <SyncBadge state={state} pending={pending} error={error} onSync={() => void sync()} />
            <button
              className="btn-ghost !px-3"
              onClick={() => setScreen({ name: "roster" })}
              title="Soupiska"
            >
              👥
            </button>
            <button
              className="btn-ghost !px-3"
              onClick={() => void supabase.auth.signOut()}
              title="Odhlásit se"
            >
              ⏻
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {screen.name === "list" && (
          <MatchList players={players} onOpen={openMatch} onChanged={notifyLocalChange} />
        )}
        {screen.name === "match" && (
          <MatchScreen
            matchId={screen.id}
            players={players}
            onBack={goToList}
            onChanged={notifyLocalChange}
          />
        )}
        {screen.name === "roster" && (
          <RosterScreen
            players={players}
            onBack={goToList}
            onPlayersChanged={() => {
              void sync().then(reloadPlayers);
            }}
          />
        )}
      </main>
    </div>
  );
}
