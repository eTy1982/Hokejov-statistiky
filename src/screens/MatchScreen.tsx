import { useCallback, useEffect, useMemo, useState } from "react";
import {
  eventsOfMatch,
  getMatch,
  nextSeq,
  putEvent,
  putMatch,
  putRoster,
  removeRosterEntry,
  rosterOfMatch,
  softDeleteEvent,
} from "../lib/db";
import { computeStats, scoreboard, sumCounts, sumTimes } from "../lib/stats";
import { makeEvent, PERIODS, type Match, type MatchEvent, type Period, type Player, type RosterEntry, type Side, type SoResult } from "../lib/types";
import { PERIOD_SHORT, lineColor, normalizeClock, playerLabel, playerNumber, sortRoster } from "../lib/format";
import { PlayerTile } from "../components/PlayerTile";
import { GoalDialog, type GoalDraft } from "../components/GoalDialog";
import { ShootoutDialog } from "../components/ShootoutDialog";
import { StatsTable } from "../components/StatsTable";
import { Modal } from "../components/Modal";
import { TimeInput } from "../components/TimeInput";

interface Props {
  matchId: string;
  players: Player[];
  onBack: () => void;
  onChanged: () => void;
}

type Dialog =
  | { kind: "goal"; mode: "for" | "against"; editing: MatchEvent | null }
  | { kind: "penalty"; playerId: string }
  | { kind: "shootout" }
  | { kind: "player"; playerId: string }
  | { kind: "lineup" }
  | null;

const goalieKey = (matchId: string) => `dynamo-stats-goalie-${matchId}`;

export function MatchScreen({ matchId, players, onBack, onChanged }: Props) {
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [period, setPeriod] = useState<Period>("1");
  const [lineFilter, setLineFilter] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activeGoalieId, setActiveGoalieId] = useState<string | null>(() =>
    localStorage.getItem(goalieKey(matchId)),
  );

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const reload = useCallback(async () => {
    const [m, e, r] = await Promise.all([
      getMatch(matchId),
      eventsOfMatch(matchId),
      rosterOfMatch(matchId),
    ]);
    setMatch(m ?? null);
    setEvents(e);
    setRoster(r);
  }, [matchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const locked = match?.status === "finished";

  const { byPlayer, totals } = useMemo(
    () => computeStats(events, match?.shootoutWinner ?? null),
    [events, match?.shootoutWinner],
  );
  const score = useMemo(
    () => scoreboard(totals, match?.homeAway ?? "home"),
    [totals, match?.homeAway],
  );

  const visibleRoster = useMemo(() => {
    const sorted = sortRoster(roster, playerMap);
    if (lineFilter === 0) return sorted;
    return sorted.filter((r) => r.position === "B" || r.line === lineFilter);
  }, [roster, playerMap, lineFilter]);

  /** Hráči, kteří v zápase něco mají. Takového nelze ze sestavy jen tak vyřadit,
   *  jeho záznamy by zmizely z tabulky, ale dál by se počítaly do skóre. */
  const playersWithEvents = useMemo(() => {
    const ids = new Set<string>();
    for (const e of events) {
      if (e.deleted) continue;
      if (e.playerId) ids.add(e.playerId);
      if (e.goalieId) ids.add(e.goalieId);
      for (const id of [...e.assists, ...e.onIcePlus, ...e.onIceMinus]) ids.add(id);
    }
    return ids;
  }, [events]);

  /** Do tabulky patří i ten, kdo v sestavě není, ale záznam má – jinak by se
   *  jeho čísla tiše ztratila. */
  const statsRoster = useMemo(() => {
    const inRoster = new Set(roster.map((r) => r.playerId));
    const extra: RosterEntry[] = [...playersWithEvents]
      .filter((id) => !inRoster.has(id) && playerMap.has(id))
      .map((id) => ({ playerId: id, line: 0, position: playerMap.get(id)?.position ?? "Ú" }));
    return [...roster, ...extra];
  }, [roster, playersWithEvents, playerMap]);

  const availableLines = useMemo(
    () => [...new Set(roster.filter((r) => r.position !== "B" && r.line > 0).map((r) => r.line))].sort(),
    [roster],
  );

  const liveEventsList = useMemo(
    () => events.filter((e) => !e.deleted).sort((a, b) => b.seq - a.seq),
    [events],
  );
  const shootoutAttempts = useMemo(
    () => events.filter((e) => !e.deleted && e.type === "so_attempt").sort((a, b) => a.seq - b.seq),
    [events],
  );

  /* ----------------------------------------------------------- zápis */

  const addEvent = useCallback(
    async (partial: Partial<MatchEvent> & Pick<MatchEvent, "type">) => {
      if (locked) return;
      const seq = await nextSeq(matchId);
      await putEvent(makeEvent({ matchId, seq, period, ...partial }));
      onChanged();
      await reload();
    },
    [locked, matchId, period, onChanged, reload],
  );

  const patchMatch = useCallback(
    async (patch: Partial<Match>) => {
      if (!match) return;
      await putMatch({ ...match, ...patch });
      onChanged();
      await reload();
    },
    [match, onChanged, reload],
  );

  const removeEvent = useCallback(
    async (clientId: string) => {
      await softDeleteEvent(clientId);
      onChanged();
      await reload();
    },
    [onChanged, reload],
  );

  const undoLast = useCallback(async () => {
    const last = liveEventsList[0];
    if (!last) return;
    await removeEvent(last.clientId);
  }, [liveEventsList, removeEvent]);

  const onTapPlayer = (entry: RosterEntry) => {
    if (entry.position === "B") void addEvent({ type: "save", goalieId: entry.playerId });
    else void addEvent({ type: "shot", playerId: entry.playerId });
  };

  const saveGoal = async (mode: "for" | "against", draft: GoalDraft, editing: MatchEvent | null) => {
    if (editing) {
      // Úprava přepíše celou událost. Protože se statistiky počítají z událostí,
      // není co „odečítat“ – rozhodit součty tím nejde.
      await putEvent({
        ...editing,
        clock: draft.clock,
        playerId: draft.playerId,
        goalieId: draft.goalieId,
        assists: draft.assists,
        onIcePlus: draft.onIcePlus,
        onIceMinus: draft.onIceMinus,
      });
      onChanged();
      await reload();
    } else {
      await addEvent({
        type: mode === "for" ? "goal_for" : "goal_against",
        clock: draft.clock,
        playerId: draft.playerId,
        goalieId: draft.goalieId,
        assists: draft.assists,
        onIcePlus: draft.onIcePlus,
        onIceMinus: draft.onIceMinus,
      });
    }
    setDialog(null);
  };

  const addShootoutAttempt = async (a: {
    playerId: string | null;
    goalieId: string | null;
    result: SoResult;
    round: number;
  }) => {
    const seq = await nextSeq(matchId);
    await putEvent(
      makeEvent({
        matchId,
        seq,
        period: "SO",
        type: "so_attempt",
        playerId: a.playerId,
        goalieId: a.goalieId,
        soResult: a.result,
        soRound: a.round,
      }),
    );
    onChanged();
    await reload();
  };

  const finishMatch = async () => {
    if (!confirm("Ukončit zápas? Zápis se uzamkne, statistiky zůstanou uložené.")) return;
    await patchMatch({ status: "finished" });
  };

  if (!match) {
    return (
      <div className="card p-10 text-center text-slate-400">
        Zápas se nepodařilo načíst.
        <button className="btn-ghost mt-4 block w-full" onClick={onBack}>
          Zpět na přehled
        </button>
      </div>
    );
  }

  const opponentName = match.opponent || "Soupeř";
  const homeName = match.homeAway === "home" ? "Dynamo" : opponentName;
  const awayName = match.homeAway === "home" ? opponentName : "Dynamo";
  const weAreHome = match.homeAway === "home";
  const shotsHome = weAreHome ? totals.totalShotsFor : totals.totalShotsAgainst;
  const shotsAway = weAreHome ? totals.totalShotsAgainst : totals.totalShotsFor;

  return (
    <div className="space-y-4 pb-24">
      {/* ---------------------------------------------------- záhlaví */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost no-print" onClick={onBack}>
            ← Zpět
          </button>
          <div className="text-sm text-slate-400">
            {match.matchDate}
            {match.venue && ` • ${match.venue}`}
            {match.competition && ` • ${match.competition}`}
          </div>
          {locked && <span className="chip bg-white/10 text-slate-300">Uzamčeno</span>}
          <div className="no-print ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setDialog({ kind: "lineup" })}>
              🧩 Sestava
            </button>
            <button
              className="btn-ghost"
              onClick={() =>
                void import("../lib/exports").then((m) =>
                  m.exportMatchStatsXlsx(match, events, roster, playerMap),
                )
              }
            >
              📤 XLSX
            </button>
            <button
              className="btn-ghost"
              onClick={() =>
                void import("../lib/exports").then((m) =>
                  m.exportEventsCsv(match, events, playerMap),
                )
              }
            >
              📄 CSV
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="truncate text-right text-lg font-semibold sm:text-xl">{homeName}</div>
          <div className="text-center">
            <div className="text-5xl font-black tabular-nums">
              {score.home}
              <span className="mx-2 text-slate-600">:</span>
              {score.away}
            </div>
            <div className="mt-1 text-xs text-slate-400 tabular-nums">
              {score.perPeriod.map(([h, a], i) => (
                <span key={i} className="mx-1">
                  {h}:{a}
                </span>
              ))}
            </div>
            {match.shootoutWinner && (
              <div className="mt-1 text-xs text-amber-300">
                po nájezdech {match.shootoutWinner === "us" ? "pro nás" : "pro soupeře"}
              </div>
            )}
          </div>
          <div className="truncate text-lg font-semibold sm:text-xl">{awayName}</div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3 text-center text-sm text-slate-400">
          Střely{" "}
          <strong className="text-slate-200 tabular-nums">
            {shotsHome}:{shotsAway}
          </strong>
          <span className="mx-2 text-slate-600">|</span>
          Gól se počítá i jako střela
        </div>
      </div>

      {/* ------------------------------------------------ ovládání */}
      <div className="no-print card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {(["1", "2", "3", "P"] as const).map((p) => (
            <button
              key={p}
              disabled={locked}
              className={`flex-1 rounded-xl px-3 py-3 text-sm font-bold transition ${
                period === p ? "bg-ice-500 text-white" : "bg-white/5 text-slate-300"
              } disabled:opacity-40`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_SHORT[p]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 uppercase">Pětka</span>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              lineFilter === 0 ? "bg-white/15 text-white" : "bg-white/5 text-slate-400"
            }`}
            onClick={() => setLineFilter(0)}
          >
            Vše
          </button>
          {availableLines.map((line) => (
            <button
              key={line}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                lineFilter === line ? `${lineColor(line, false)} text-white` : "bg-white/5 text-slate-400"
              }`}
              onClick={() => setLineFilter(line)}
            >
              {line}.
            </button>
          ))}

          <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            Brankář na ledě
            <select
              className="field !w-auto !py-1.5"
              value={activeGoalieId ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                setActiveGoalieId(value);
                if (value) localStorage.setItem(goalieKey(matchId), value);
                else localStorage.removeItem(goalieKey(matchId));
              }}
            >
              <option value="">— nevybrán —</option>
              {roster
                .filter((r) => r.position === "B")
                .map((r) => (
                  <option key={r.playerId} value={r.playerId}>
                    {playerLabel(playerMap.get(r.playerId))}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      {/* -------------------------------------------------- dlaždice */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {visibleRoster.map((entry) => {
          const player = playerMap.get(entry.playerId);
          if (!player) return null;
          const s = byPlayer[entry.playerId];
          const isGoalie = entry.position === "B";
          return (
            <PlayerTile
              key={entry.playerId}
              player={player}
              line={entry.line}
              isGoalie={isGoalie}
              count={s ? (isGoalie ? sumCounts(s.saves) : sumCounts(s.shots)) : 0}
              disabled={locked}
              highlighted={isGoalie && activeGoalieId === entry.playerId}
              onTap={() => onTapPlayer(entry)}
              onLongPress={() => setDialog({ kind: "penalty", playerId: entry.playerId })}
            />
          );
        })}
      </div>

      {/* --------------------------------------------------- akce */}
      <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          className="btn-success py-4 text-base"
          disabled={locked}
          onClick={() => setDialog({ kind: "goal", mode: "for", editing: null })}
        >
          🥅 Gól
        </button>
        <button
          className="btn-danger py-4 text-base"
          disabled={locked}
          onClick={() => setDialog({ kind: "goal", mode: "against", editing: null })}
        >
          💥 Obdržený
        </button>
        <button
          className="btn-ghost py-4 text-base"
          disabled={locked}
          onClick={() => setDialog({ kind: "shootout" })}
        >
          ⚔️ Nájezdy
        </button>
        <button
          className="btn-ghost py-4 text-base"
          disabled={locked || liveEventsList.length === 0}
          onClick={() => void undoLast()}
        >
          ↩︎ Zpět
        </button>
      </div>

      {/* -------------------------------------------------- události */}
      <div className="card overflow-hidden">
        <h3 className="border-b border-white/10 px-4 py-3 font-bold">
          Průběh zápasu{" "}
          <span className="text-sm font-normal text-slate-500">({liveEventsList.length})</span>
        </h3>
        {liveEventsList.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Zatím žádná událost. Ťukněte na hráče pro střelu, dlouhým stiskem zapíšete trest.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {liveEventsList.map((e) => (
              <EventRow
                key={e.clientId}
                event={e}
                players={playerMap}
                locked={Boolean(locked)}
                onEdit={
                  e.type === "goal_for" || e.type === "goal_against"
                    ? () =>
                        setDialog({
                          kind: "goal",
                          mode: e.type === "goal_for" ? "for" : "against",
                          editing: e,
                        })
                    : undefined
                }
                onDelete={() => void removeEvent(e.clientId)}
              />
            ))}
          </ul>
        )}
      </div>

      <StatsTable
        roster={statsRoster}
        players={playerMap}
        stats={byPlayer}
        onSelectPlayer={(playerId) => setDialog({ kind: "player", playerId })}
      />

      {!locked && (
        <div className="no-print flex justify-center pt-2">
          <button className="btn-danger px-8 py-4 text-base" onClick={() => void finishMatch()}>
            Ukončit zápas
          </button>
        </div>
      )}
      {locked && (
        <div className="no-print flex justify-center pt-2">
          <button className="btn-ghost" onClick={() => void patchMatch({ status: "live" })}>
            🔓 Odemknout k dodatečné úpravě
          </button>
        </div>
      )}

      {/* ------------------------------------------------- dialogy */}
      {dialog?.kind === "goal" && (
        <GoalDialog
          mode={dialog.mode}
          period={dialog.editing?.period ?? period}
          roster={roster}
          players={playerMap}
          activeGoalieId={activeGoalieId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSave={(draft) => void saveGoal(dialog.mode, draft, dialog.editing)}
        />
      )}

      {dialog?.kind === "penalty" && (
        <PenaltyDialog
          player={playerMap.get(dialog.playerId)}
          onClose={() => setDialog(null)}
          onSave={(clock, minutes) => {
            void addEvent({
              type: "penalty",
              playerId: dialog.playerId,
              clock,
              penaltyMin: minutes,
            });
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === "shootout" && (
        <ShootoutDialog
          roster={roster}
          players={playerMap}
          attempts={shootoutAttempts}
          activeGoalieId={activeGoalieId}
          shootoutWinner={match.shootoutWinner}
          onAttempt={(a) => void addShootoutAttempt(a)}
          onUndo={() => {
            const last = shootoutAttempts[shootoutAttempts.length - 1];
            if (last) void removeEvent(last.clientId);
          }}
          onFinish={(winner: Side | null) => void patchMatch({ shootoutWinner: winner })}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "player" && (
        <PlayerDetail
          player={playerMap.get(dialog.playerId)}
          stats={byPlayer[dialog.playerId]}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "lineup" && (
        <LineupDialog
          matchId={matchId}
          roster={roster}
          players={players}
          lockedPlayerIds={playersWithEvents}
          onClose={() => setDialog(null)}
          onChanged={async () => {
            onChanged();
            await reload();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ řádek události */

function EventRow({
  event,
  players,
  locked,
  onEdit,
  onDelete,
}: {
  event: MatchEvent;
  players: Map<string, Player>;
  locked: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const name = (id: string | null) => (id ? playerNumber(players.get(id)) : "?");
  const period = PERIOD_SHORT[event.period] ?? event.period;

  let text: React.ReactNode = null;
  let accent = "bg-white/5";

  switch (event.type) {
    case "goal_for":
      accent = "bg-emerald-500/10";
      text = (
        <>
          <strong>Gól</strong> #{name(event.playerId)}
          {event.assists.length > 0 && (
            <span className="text-slate-400">
              {" "}
              (A: {event.assists.map((id) => `#${name(id)}`).join(", ")})
            </span>
          )}
        </>
      );
      break;
    case "goal_against":
      accent = "bg-rose-500/10";
      text = (
        <>
          <strong>Obdržený gól</strong> <span className="text-slate-400">B: #{name(event.goalieId)}</span>
          {event.onIceMinus.length > 0 && (
            <span className="text-slate-400">
              {" "}
              (−: {event.onIceMinus.map((id) => `#${name(id)}`).join(", ")})
            </span>
          )}
        </>
      );
      break;
    case "penalty":
      accent = "bg-amber-500/10";
      text = (
        <>
          <strong>Trest</strong> #{name(event.playerId)}
          {event.penaltyMin ? <span className="text-slate-400"> ({event.penaltyMin} min)</span> : null}
        </>
      );
      break;
    case "shot":
      text = <span className="text-slate-300">Střela #{name(event.playerId)}</span>;
      break;
    case "save":
      text = <span className="text-slate-300">Zákrok #{name(event.goalieId)}</span>;
      break;
    case "so_attempt":
      accent = "bg-violet-500/10";
      text = (
        <>
          <strong>Nájezd</strong>{" "}
          {event.playerId ? `#${name(event.playerId)}` : `B: #${name(event.goalieId)}`}{" "}
          <span className="text-slate-400">
            {event.soResult === "goal" ? "gól" : event.soResult === "save" ? "zákrok" : "neproměnil"}
          </span>
        </>
      );
      break;
  }

  return (
    <li className={`flex items-center gap-3 px-4 py-2 text-sm ${accent}`}>
      <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">
        {period}
        {event.clock ? ` ${event.clock}` : ""}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {!locked && (
        <span className="no-print flex shrink-0 gap-1">
          {onEdit && (
            <button className="btn-ghost !px-2 !py-1" onClick={onEdit} title="Upravit">
              ✏️
            </button>
          )}
          <button className="btn-ghost !px-2 !py-1" onClick={onDelete} title="Smazat">
            🗑️
          </button>
        </span>
      )}
    </li>
  );
}

/* ----------------------------------------------------------------- trest */

function PenaltyDialog({
  player,
  onClose,
  onSave,
}: {
  player: Player | undefined;
  onClose: () => void;
  onSave: (clock: string | null, minutes: number) => void;
}) {
  const [clock, setClock] = useState("");
  const [minutes, setMinutes] = useState(2);

  return (
    <Modal
      title={`Trest – ${playerLabel(player)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn-primary" onClick={() => onSave(normalizeClock(clock), minutes)}>
            💾 Zapsat trest
          </button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {[2, 5, 10].map((m) => (
          <button
            key={m}
            className={`flex-1 rounded-xl py-3 font-bold transition ${
              minutes === m ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300"
            }`}
            onClick={() => setMinutes(m)}
          >
            {m} min
          </button>
        ))}
      </div>
      <TimeInput value={clock} onChange={setClock} />
    </Modal>
  );
}

/* ------------------------------------------------------- detail hráče */

function PlayerDetail({
  player,
  stats,
  onClose,
}: {
  player: Player | undefined;
  stats: ReturnType<typeof computeStats>["byPlayer"][string] | undefined;
  onClose: () => void;
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between border-b border-white/5 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );

  const times = (obj: Record<string, string[]> | undefined) => {
    if (!obj) return "—";
    const all = PERIODS.flatMap((p) => (obj[p] ?? []).map((t) => `${PERIOD_SHORT[p]} ${t || "—"}`));
    return all.length ? all.join(", ") : "—";
  };

  return (
    <Modal title={playerLabel(player)} onClose={onClose}>
      {!stats ? (
        <p className="text-slate-400">V tomto zápase zatím nemá žádný záznam.</p>
      ) : (
        <div className="text-sm">
          {row("Střely (včetně gólů)", sumCounts(stats.shots))}
          {row("Góly", sumTimes(stats.goals))}
          {row("Asistence", sumCounts(stats.assists))}
          {row("Body", sumTimes(stats.goals) + sumCounts(stats.assists))}
          {row("Plus / minus", `${sumCounts(stats.plus)} / ${sumCounts(stats.minus)}`)}
          {row("Zákroky", sumCounts(stats.saves))}
          {row("Obdržené góly", sumTimes(stats.goalsAgainst))}
          {row("Časy gólů", times(stats.goals))}
          {row("Časy obdržených", times(stats.goalsAgainst))}
          {row("Tresty", times(stats.penalties))}
          {stats.soAttempts > 0 && row("Nájezdy", `${stats.soGoals}/${stats.soAttempts}`)}
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------- sestava */

function LineupDialog({
  matchId,
  roster,
  players,
  lockedPlayerIds,
  onClose,
  onChanged,
}: {
  matchId: string;
  roster: RosterEntry[];
  players: Player[];
  lockedPlayerIds: Set<string>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const inRoster = new Map(roster.map((r) => [r.playerId, r]));

  const shown = players.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${p.fullName} ${p.jerseyNumber ?? ""}`.toLowerCase().includes(q);
  });

  const update = async (playerId: string, patch: Partial<RosterEntry> & { remove?: boolean }) => {
    setWorking(true);
    const current = inRoster.get(playerId);
    const player = players.find((p) => p.id === playerId);
    if (patch.remove) {
      await removeRosterEntry(matchId, playerId);
    } else {
      await putRoster({
        matchId,
        playerId,
        line: patch.line ?? current?.line ?? 0,
        position: patch.position ?? current?.position ?? player?.position ?? "Ú",
      });
    }
    await onChanged();
    setWorking(false);
  };

  const setAll = async (include: boolean) => {
    setWorking(true);
    for (const p of shown) {
      const isIn = inRoster.has(p.id);
      if (include && !isIn) {
        await putRoster({ matchId, playerId: p.id, line: 0, position: p.position ?? "Ú" });
      } else if (!include && isIn && !lockedPlayerIds.has(p.id)) {
        await removeRosterEntry(matchId, p.id);
      }
    }
    await onChanged();
    setWorking(false);
  };

  return (
    <Modal
      wide
      title="Sestava zápasu"
      subtitle={`Nastoupilo ${roster.length} z ${players.length} hráčů. Pětky platí jen pro tento zápas.`}
      onClose={onClose}
      footer={
        <button className="btn-primary" onClick={onClose}>
          Hotovo
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="field flex-1"
          placeholder="Hledat hráče…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-ghost" disabled={working} onClick={() => void setAll(true)}>
          Označit vše
        </button>
        <button className="btn-ghost" disabled={working} onClick={() => void setAll(false)}>
          Odznačit vše
        </button>
      </div>

      <div className="space-y-1">
        {shown.map((p) => {
          const entry = inRoster.get(p.id);
          const locked = lockedPlayerIds.has(p.id);
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
                entry ? "bg-white/5" : "bg-transparent opacity-50"
              }`}
            >
              <label className="flex flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-ice-500)]"
                  checked={Boolean(entry)}
                  disabled={working || (locked && Boolean(entry))}
                  onChange={(e) => void update(p.id, e.target.checked ? {} : { remove: true })}
                />
                <span className="font-medium">{playerLabel(p)}</span>
                {locked && entry && (
                  <span
                    className="chip bg-amber-500/15 text-amber-300"
                    title="Hráč už má v tomto zápase záznam, proto ho nelze vyřadit. Smažte nejdřív jeho události."
                  >
                    má záznam
                  </span>
                )}
              </label>

              {entry && (
                <>
                  <select
                    className="field !w-auto !py-1"
                    value={entry.position}
                    disabled={working}
                    onChange={(e) =>
                      void update(p.id, { position: e.target.value as RosterEntry["position"] })
                    }
                  >
                    <option value="B">Brankář</option>
                    <option value="O">Obránce</option>
                    <option value="Ú">Útočník</option>
                  </select>
                  <select
                    className="field !w-auto !py-1"
                    value={entry.line}
                    disabled={working}
                    onChange={(e) => void update(p.id, { line: Number(e.target.value) })}
                  >
                    <option value={0}>bez pětky</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}. pětka
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">Hledání nikoho nenašlo.</p>
        )}
      </div>
    </Modal>
  );
}
