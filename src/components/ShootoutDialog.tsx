import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { lineColor, playerNumber, sortRoster } from "../lib/format";
import type { MatchEvent, Player, RosterEntry, Side, SoResult } from "../lib/types";

interface Props {
  roster: RosterEntry[];
  players: Map<string, Player>;
  attempts: MatchEvent[];
  activeGoalieId: string | null;
  shootoutWinner: Side | null;
  onAttempt: (attempt: { playerId: string | null; goalieId: string | null; result: SoResult; round: number }) => void;
  onUndo: () => void;
  onFinish: (winner: Side | null) => void;
  onClose: () => void;
}

export function ShootoutDialog({
  roster,
  players,
  attempts,
  activeGoalieId,
  shootoutWinner,
  onAttempt,
  onUndo,
  onFinish,
  onClose,
}: Props) {
  const [view, setView] = useState<"menu" | "us" | "opp">("menu");
  const [shooter, setShooter] = useState<string | null>(null);
  const [goalie, setGoalie] = useState<string | null>(activeGoalieId);

  const ours = attempts.filter((a) => a.playerId);
  const theirs = attempts.filter((a) => a.goalieId);
  const goalsFor = ours.filter((a) => a.soResult === "goal").length;
  const goalsAgainst = theirs.filter((a) => a.soResult === "goal").length;
  const rounds = Math.max(ours.length, theirs.length);

  const skaters = useMemo(
    () => sortRoster(roster.filter((r) => r.position !== "B"), players),
    [roster, players],
  );
  const goalies = useMemo(
    () => sortRoster(roster.filter((r) => r.position === "B"), players),
    [roster, players],
  );

  const record = (result: SoResult) => {
    if (view === "us") {
      if (!shooter) return;
      onAttempt({ playerId: shooter, goalieId: null, result, round: ours.length + 1 });
      setShooter(null);
    } else {
      if (!goalie) return;
      onAttempt({ playerId: null, goalieId: goalie, result, round: theirs.length + 1 });
    }
    setView("menu");
  };

  const tiles = (entries: RosterEntry[], selected: string | null, onPick: (id: string) => void) => (
    <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
      {entries.map((entry) => {
        const player = players.get(entry.playerId);
        if (!player) return null;
        return (
          <button
            key={entry.playerId}
            className={`tap-target rounded-xl border-2 py-3 text-xl font-bold text-white tabular-nums transition active:scale-95
                        ${lineColor(entry.line, entry.position === "B")}
                        ${selected === entry.playerId ? "ring-4 ring-amber-300" : ""}`}
            onClick={() => onPick(entry.playerId)}
          >
            {playerNumber(player)}
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal
      wide
      title="Samostatné nájezdy"
      subtitle={`Stav ${goalsFor}:${goalsAgainst} po ${rounds} ${rounds === 1 ? "kole" : "kolech"}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" disabled={!attempts.length} onClick={onUndo}>
            ↩︎ Vrátit poslední pokus
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Zavřít
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-white/5 p-3">
        <span className="self-center text-sm text-slate-300">Výsledek nájezdů:</span>
        <button
          className={shootoutWinner === "us" ? "btn-success" : "btn-ghost"}
          onClick={() => onFinish("us")}
        >
          🏆 Vyhráli jsme
        </button>
        <button
          className={shootoutWinner === "opp" ? "btn-danger" : "btn-ghost"}
          onClick={() => onFinish("opp")}
        >
          Prohráli jsme
        </button>
        {shootoutWinner && (
          <button className="btn-ghost" onClick={() => onFinish(null)}>
            ↺ Zrušit výsledek
          </button>
        )}
      </div>

      {view === "menu" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="rounded-2xl bg-emerald-600 py-8 text-xl font-bold text-white transition active:scale-95"
            onClick={() => setView("us")}
          >
            🥅 Náš pokus
          </button>
          <button
            className="rounded-2xl bg-rose-600 py-8 text-xl font-bold text-white transition active:scale-95"
            onClick={() => setView("opp")}
          >
            💥 Pokus soupeře
          </button>
        </div>
      )}

      {view === "us" && (
        <div>
          <p className="mb-2 font-semibold">Vyberte střelce a výsledek</p>
          {tiles(skaters, shooter, (id) => setShooter((c) => (c === id ? null : id)))}
          <div className="flex flex-wrap gap-2">
            <button className="btn-success" disabled={!shooter} onClick={() => record("goal")}>
              Gól
            </button>
            <button className="btn-ghost" disabled={!shooter} onClick={() => record("miss")}>
              Neproměnil
            </button>
            <button className="btn-ghost ml-auto" onClick={() => setView("menu")}>
              Zpět
            </button>
          </div>
        </div>
      )}

      {view === "opp" && (
        <div>
          <p className="mb-2 font-semibold">Vyberte našeho brankáře a výsledek</p>
          {tiles(goalies, goalie, (id) => setGoalie((c) => (c === id ? null : id)))}
          <div className="flex flex-wrap gap-2">
            <button className="btn-success" disabled={!goalie} onClick={() => record("save")}>
              Zákrok
            </button>
            <button className="btn-danger" disabled={!goalie} onClick={() => record("goal")}>
              Gól soupeře
            </button>
            <button className="btn-ghost ml-auto" onClick={() => setView("menu")}>
              Zpět
            </button>
          </div>
        </div>
      )}

      {attempts.length > 0 && (
        <ol className="mt-5 space-y-1 border-t border-white/10 pt-3 text-sm">
          {attempts.map((a) => {
            const who = players.get(a.playerId ?? a.goalieId ?? "");
            const ourAttempt = Boolean(a.playerId);
            const label = ourAttempt
              ? a.soResult === "goal"
                ? "gól"
                : "neproměnil"
              : a.soResult === "goal"
                ? "inkasoval"
                : "zákrok";
            return (
              <li key={a.clientId} className="flex gap-2 text-slate-300">
                <span className="w-14 text-slate-500">{a.soRound}. kolo</span>
                <span className={ourAttempt ? "text-emerald-300" : "text-rose-300"}>
                  {ourAttempt ? "my" : "soupeř"}
                </span>
                <span>
                  {playerNumber(who)} {who?.fullName} – {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
