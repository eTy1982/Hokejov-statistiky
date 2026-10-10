import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allGuests,
  eventsOfMatch,
  getMatch,
  nextSeq,
  putEvent,
  putMatch,
  rosterOfMatch,
  softDeleteEvent,
} from "../lib/db";
import { computeStats, scoreboard, sumCounts, sumTimes } from "../lib/stats";
import {
  PERIODS,
  makeEvent,
  type GuestPlayer,
  type Match,
  type MatchEvent,
  type Participant,
  type Period,
  type Player,
  type RegularPeriod,
  type Side,
  type SoResult,
} from "../lib/types";
import {
  PERIOD_SHORT,
  buildParticipants,
  describePenaltyEnd,
  formatDate,
  formatTimeOfDay,
  playerLabel,
  playerNumber,
} from "../lib/format";
import { clockToSeconds } from "../lib/clock";
import { describeEvent } from "../lib/eventText";
import { periodState } from "../lib/periods";
import { strengthAt } from "../lib/strength";
import { useLayoutSize } from "../hooks/useLayoutSize";
import { useBoardCountsDown } from "../hooks/useBoardCountsDown";
import { PlayerGrid } from "../components/PlayerGrid";
import { GoalieBar } from "../components/GoalieBar";
import { GoaliePickDialog } from "../components/GoaliePickDialog";
import { MatchTopBar, type StrengthLine } from "../components/MatchTopBar";
import { Toast, type ToastState } from "../components/Toast";
import { GoalDialog, type GoalDraft } from "../components/GoalDialog";
import { PenaltyDialog, type PenaltyDraft } from "../components/PenaltyDialog";
import { ShootoutDialog } from "../components/ShootoutDialog";
import { LineupDialog } from "../components/LineupDialog";
import { PeriodTimesPanel } from "../components/PeriodTimesPanel";
import { StatsTable } from "../components/StatsTable";
import { Modal } from "../components/Modal";

interface Props {
  matchId: string;
  players: Player[];
  onBack: () => void;
  onChanged: () => void;
}

type Dialog =
  | { kind: "goal"; mode: "for" | "against"; editing: MatchEvent | null }
  | { kind: "penalty"; playerId: string | null }
  | { kind: "goaliePick"; reason: "faceoff" | "switch" }
  | { kind: "shootout" }
  | { kind: "player"; playerId: string }
  | { kind: "lineup" }
  | { kind: "times" }
  | null;

/** Co umí vrátit tlačítko „Vrátit“. Výměna brankáře není událost, ale vrátit
 *  se musí stejně – proto jeden společný zásobník. */
type UndoEntry =
  | { kind: "event"; clientId: string; label: string }
  | { kind: "goalie"; previousId: string | null; label: string };

const goalieKey = (matchId: string) => `dynamo-stats-goalie-${matchId}`;

export function MatchScreen({ matchId, players, onBack, onChanged }: Props) {
  const size = useLayoutSize();
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [roster, setRoster] = useState<RosterEntryList>([]);
  const [guests, setGuests] = useState<GuestPlayer[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  /** Jen pro staré zápasy bez značek třetin. */
  const [manualPeriod, setManualPeriod] = useState<RegularPeriod>("1");
  const [activeGoalieId, setActiveGoalieId] = useState<string | null>(() =>
    localStorage.getItem(goalieKey(matchId)),
  );
  const toastId = useRef(0);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const reload = useCallback(async () => {
    const [m, e, r, g] = await Promise.all([
      getMatch(matchId),
      eventsOfMatch(matchId),
      rosterOfMatch(matchId),
      allGuests(),
    ]);
    setMatch(m ?? null);
    setEvents(e);
    setRoster(r);
    setGuests(g);
  }, [matchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const locked = match?.status === "finished";
  const [countsDown] = useBoardCountsDown(match?.venue ?? null);

  /* --------------------------------------------------------- odvozený stav */

  const state = useMemo(() => periodState(events), [events]);
  /** Třetina, do které se zapisuje. Běžící má přednost; starý zápas bez
   *  značek se řídí ručním přepínačem. */
  const period: Period = state.hasMarks
    ? (state.running ?? state.last ?? manualPeriod)
    : manualPeriod;
  const canRecord = !locked && (state.hasMarks ? state.phase === "running" : true);

  const { byPlayer, totals } = useMemo(
    () => computeStats(events, match?.shootoutWinner ?? null),
    [events, match?.shootoutWinner],
  );
  const score = useMemo(
    () => scoreboard(totals, match?.homeAway ?? "home"),
    [totals, match?.homeAway],
  );

  const guestMap = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);

  /** Kmenoví i hostující hráči sjednocení do jednoho seznamu účastníků zápasu. */
  const participants = useMemo(
    () => buildParticipants(roster, playerMap, guestMap),
    [roster, playerMap, guestMap],
  );
  const participantMap = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants],
  );

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
  const statsParticipants = useMemo(() => {
    const known = new Set(participants.map((p) => p.id));
    const extra: Participant[] = [...playersWithEvents]
      .filter((id) => !known.has(id))
      .map((id) => {
        const player = playerMap.get(id);
        const guest = guestMap.get(id);
        return {
          rosterId: `mimo-${id}`,
          id,
          fullName: player?.fullName ?? guest?.fullName ?? "Neznámý hráč",
          jerseyNumber: player?.jerseyNumber ?? null,
          position: player?.position ?? ("Ú" as const),
          line: 0,
          isGuest: Boolean(guest),
        };
      });
    return [...participants, ...extra];
  }, [participants, playersWithEvents, playerMap, guestMap]);

  const goalies = useMemo(
    () => participants.filter((p) => p.position === "B"),
    [participants],
  );
  const activeGoalie = activeGoalieId ? participantMap.get(activeGoalieId) : undefined;
  const goalieSaves = activeGoalieId
    ? sumCounts(byPlayer[activeGoalieId]?.saves ?? { "1": 0, "2": 0, "3": 0, P: 0 })
    : 0;

  const liveEventsList = useMemo(
    () => events.filter((e) => !e.deleted).sort((a, b) => b.seq - a.seq),
    [events],
  );
  const shootoutAttempts = useMemo(
    () => events.filter((e) => !e.deleted && e.type === "so_attempt").sort((a, b) => a.seq - b.seq),
    [events],
  );

  const nameOf = useCallback(
    (id: string | null) => {
      if (!id) return "";
      const participant = participantMap.get(id) ?? playerMap.get(id);
      return participant ? `#${playerNumber(participant)}` : "";
    },
    [participantMap, playerMap],
  );

  /* ------------------------------------------------------------ oznámení */

  const notify = useCallback((text: string, canUndo = true) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, canUndo });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  /* ---------------------------------------------------------------- zápis */

  const addEvent = useCallback(
    async (partial: Partial<MatchEvent> & Pick<MatchEvent, "type">) => {
      if (locked) return null;
      const seq = await nextSeq(matchId);
      const event = makeEvent({ matchId, seq, period, ...partial });
      await putEvent(event);
      onChanged();
      await reload();
      return event;
    },
    [locked, matchId, period, onChanged, reload],
  );

  /** Zapíše a zároveň ohlásí – tohle je cesta, po které jde většina ťuknutí. */
  const record = useCallback(
    async (partial: Partial<MatchEvent> & Pick<MatchEvent, "type">) => {
      const event = await addEvent(partial);
      if (!event) return;
      const label = describeEvent(event, nameOf);
      setUndoStack((stack) => [...stack, { kind: "event", clientId: event.clientId, label }]);
      notify(label);
    },
    [addEvent, nameOf, notify],
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

  const setGoalie = useCallback(
    (goalieId: string | null) => {
      setActiveGoalieId(goalieId);
      if (goalieId) localStorage.setItem(goalieKey(matchId), goalieId);
      else localStorage.removeItem(goalieKey(matchId));
    },
    [matchId],
  );

  const undoLabel = useMemo(() => {
    const top = undoStack[undoStack.length - 1];
    if (top) return top.label;
    const last = liveEventsList[0];
    return last ? describeEvent(last, nameOf) : null;
  }, [undoStack, liveEventsList, nameOf]);

  const undo = useCallback(async () => {
    const top = undoStack[undoStack.length - 1];
    if (top) {
      setUndoStack((stack) => stack.slice(0, -1));
      if (top.kind === "goalie") setGoalie(top.previousId);
      else await removeEvent(top.clientId);
      return;
    }
    // Po znovuotevření zápasu zásobník prázdný je – ať jde vrátit i tak.
    const last = liveEventsList[0];
    if (last) await removeEvent(last.clientId);
  }, [undoStack, liveEventsList, removeEvent, setGoalie]);

  /* ------------------------------------------------------- ťuknutí na hráče */

  const hintNotRunning = useCallback(() => {
    notify("Třetina neběží – nejdřív ťukni Buly", false);
  }, [notify]);

  const onTapPlayer = (entry: Participant) => {
    if (locked) return;
    if (!canRecord) {
      hintNotRunning();
      return;
    }
    void record({ type: "shot", playerId: entry.id });
  };

  const onLongPressPlayer = (entry: Participant) => {
    if (locked) return;
    if (!canRecord) {
      hintNotRunning();
      return;
    }
    setDialog({ kind: "penalty", playerId: entry.id });
  };

  /* ------------------------------------------------------------- brankáři */

  /** Výměna není událost, ale vrátit se musí stejně – proto do zásobníku. */
  const putGoalieOnIce = useCallback(
    (goalieId: string) => {
      if (goalieId === activeGoalieId) return;
      const previousId = activeGoalieId;
      const goalie = participantMap.get(goalieId);
      setGoalie(goalieId);
      const label = `Na ledě ${playerLabel(goalie)}`;
      setUndoStack((stack) => [...stack, { kind: "goalie", previousId, label }]);
      notify(label);
    },
    [activeGoalieId, participantMap, setGoalie, notify],
  );

  const onSwitchGoalie = () => {
    if (locked || goalies.length < 2) return;
    // Dva brankáři se přepnou jedním ťukem, u tří a víc se vybírá.
    if (goalies.length === 2) {
      const other = goalies.find((g) => g.id !== activeGoalieId);
      if (other) putGoalieOnIce(other.id);
      return;
    }
    setDialog({ kind: "goaliePick", reason: "switch" });
  };

  const onOpponentShot = () => {
    if (locked || !activeGoalieId) return;
    if (!canRecord) {
      hintNotRunning();
      return;
    }
    void record({ type: "save", goalieId: activeGoalieId });
  };

  const onLongPressGoalie = () => {
    if (locked || !activeGoalieId) return;
    if (!canRecord) {
      hintNotRunning();
      return;
    }
    setDialog({ kind: "penalty", playerId: activeGoalieId });
  };

  /* ----------------------------------------------------------- značky třetin */

  const startPeriod = useCallback(
    async (next: RegularPeriod) => {
      await record({ type: "period_start", period: next });
    },
    [record],
  );

  const onPeriodMark = async () => {
    if (locked) return;
    if (state.phase === "running" && state.running) {
      await record({ type: "period_end", period: state.running });
      return;
    }
    if (!state.next) return;
    // Soupiska neříká, kdo chytá – oba brankáři mají line = 0. Zeptáme se
    // jednou, při prvním buly, a výběr rovnou uloží i značku třetiny.
    if (!activeGoalieId && goalies.length > 1) {
      setDialog({ kind: "goaliePick", reason: "faceoff" });
      return;
    }
    if (!activeGoalieId && goalies.length === 1) setGoalie(goalies[0]!.id);
    await startPeriod(state.next);
  };

  /* ---------------------------------------------------------------- dialogy */

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
        strength: draft.strength,
      });
      onChanged();
      await reload();
      notify("Gól upraven", false);
    } else {
      await record({
        type: mode === "for" ? "goal_for" : "goal_against",
        clock: draft.clock,
        playerId: draft.playerId,
        goalieId: draft.goalieId,
        assists: draft.assists,
        onIcePlus: draft.onIcePlus,
        onIceMinus: draft.onIceMinus,
        strength: draft.strength,
      });
    }
    setDialog(null);
  };

  const savePenalty = async (draft: PenaltyDraft) => {
    await record({
      type: "penalty",
      side: draft.side,
      playerId: draft.playerId,
      clock: draft.clock,
      penaltyCode: draft.penaltyCode,
      penaltyMin: draft.penaltyMin,
    });
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

  /* ------------------------------------------------- lišta: co právě běží */

  /** Početní stav k času posledního zapsaného gólu nebo trestu v téhle třetině.
   *  Aplikace nemá časomíru, takže „teď“ neví – nejbližší známý okamžik je
   *  poslední zápis. */
  const strengthLine = useMemo<StrengthLine | null>(() => {
    const reference = latestTimedEvent(events, period);
    if (reference === null) return null;
    const suggestion = strengthAt(events, period, reference);
    if (suggestion.strength === "ev") return null;
    const running = suggestion.strength === "pp" ? suggestion.theirs : suggestion.ours;
    const first = running[0];
    if (!first) return null;
    const who = suggestion.strength === "pp" ? "soupeř" : nameOf(first.playerId) || "my";
    const extra = running.length > 1 ? ` (+${running.length - 1} další)` : "";
    return {
      label: suggestion.strength === "pp" ? "Přesilovka" : "Oslabení",
      detail: `${who} ${first.code}, ${describePenaltyEnd(first.endsAt, period, countsDown)}${extra}`,
      tone: suggestion.strength,
    };
  }, [events, period, nameOf, countsDown]);

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
  const timesTitle = `${homeName} – ${awayName} ${formatDate(match.matchDate)}`;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------- hrací plocha */}
      <section className="play-area relative flex min-h-0 flex-col gap-2">
        <MatchTopBar
          size={size}
          homeName={homeName}
          awayName={awayName}
          score={score}
          shotsHome={shotsHome}
          shotsAway={shotsAway}
          state={state}
          manualPeriod={manualPeriod}
          onManualPeriod={setManualPeriod}
          onPeriodMark={() => void onPeriodMark()}
          strengthLine={strengthLine}
          onOpenTimes={() => setDialog({ kind: "times" })}
          locked={Boolean(locked)}
          missingGoalie={goalies.length === 0}
        />

        <PlayerGrid
          participants={participants}
          countOf={(entry) => {
            const s = byPlayer[entry.id];
            return s ? sumCounts(s.shots) : 0;
          }}
          size={size}
          disabled={Boolean(locked)}
          inactive={!canRecord}
          onTap={onTapPlayer}
          onLongPress={onLongPressPlayer}
        />

        {size === "wide" && (
          <p className="shrink-0 text-center text-xs text-slate-500">
            Ťuk = naše střela · podržet = trest
          </p>
        )}

        <GoalieBar
          activeGoalie={activeGoalie}
          saveCount={goalieSaves}
          canSwitch={goalies.length > 1}
          size={size}
          disabled={Boolean(locked)}
          inactive={!canRecord}
          onSwitch={onSwitchGoalie}
          onLongPressGoalie={onLongPressGoalie}
          onOpponentShot={onOpponentShot}
        />

        {/* ------------------------------------------- spodní lišta */}
        <div className="flex shrink-0 gap-2">
          <button
            className="btn-success flex-1 py-3 text-base"
            disabled={!canRecord}
            onClick={() => setDialog({ kind: "goal", mode: "for", editing: null })}
          >
            Gól
          </button>
          <button
            className="btn-danger flex-1 py-3 text-base"
            disabled={!canRecord}
            onClick={() => setDialog({ kind: "goal", mode: "against", editing: null })}
          >
            {size === "cover" ? "Obdržený" : "Obdržený gól"}
          </button>
          <button
            className="btn-ghost flex-1 py-3 text-base"
            disabled={!canRecord}
            onClick={() => setDialog({ kind: "penalty", playerId: null })}
          >
            Trest
          </button>
          <button
            className="btn-ghost flex-[1.4] py-3 text-left text-sm"
            disabled={locked || !undoLabel}
            onClick={() => void undo()}
          >
            <span className="font-bold">Vrátit</span>
            {undoLabel && (
              <span className="ml-2 truncate text-xs text-slate-400">· {undoLabel}</span>
            )}
          </button>
        </div>

        <Toast toast={toast} onUndo={() => void undo()} onClose={closeToast} />
      </section>

      {/* --------------------------------------------- pod hrací plochou */}
      <div className="no-print card flex flex-wrap items-center gap-2 p-3 text-sm">
        <button className="btn-ghost" onClick={onBack}>
          ← Přehled zápasů
        </button>
        <span className="text-slate-400">
          {match.matchDate}
          {match.venue && ` • ${match.venue}`}
          {match.competition && ` • ${match.competition}`}
        </span>
        {locked && <span className="chip bg-white/10 text-slate-300">Uzamčeno</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setDialog({ kind: "lineup" })}>
            Sestava
          </button>
          <button className="btn-ghost" onClick={() => setDialog({ kind: "shootout" })}>
            Nájezdy
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              void import("../lib/exports").then((m) =>
                m.exportMatchStatsXlsx(match, events, statsParticipants),
              )
            }
          >
            XLSX
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              void import("../lib/exports").then((m) =>
                m.exportEventsCsv(match, events, participantMap),
              )
            }
          >
            CSV
          </button>
        </div>
      </div>

      {/* -------------------------------------------------- události */}
      <div className="card overflow-hidden">
        <h3 className="border-b border-white/10 px-4 py-3 font-bold">
          Průběh zápasu{" "}
          <span className="text-sm font-normal text-slate-500">({liveEventsList.length})</span>
        </h3>
        {liveEventsList.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Zatím žádná událost. Ťuknutí na hráče zapíše střelu, podržení trest.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {liveEventsList.map((e) => (
              <EventRow
                key={e.clientId}
                event={e}
                players={playerMap}
                participants={participantMap}
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
        participants={statsParticipants}
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
            Odemknout k dodatečné úpravě
          </button>
        </div>
      )}

      {/* ------------------------------------------------- dialogy */}
      {dialog?.kind === "goal" && (
        <GoalDialog
          mode={dialog.mode}
          period={dialog.editing?.period ?? period}
          participants={participants}
          events={events}
          activeGoalieId={activeGoalieId}
          venue={match.venue}
          size={size}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSave={(draft) => void saveGoal(dialog.mode, draft, dialog.editing)}
        />
      )}

      {dialog?.kind === "penalty" && (
        <PenaltyDialog
          period={period}
          participants={participants}
          preselectedPlayerId={dialog.playerId}
          venue={match.venue}
          size={size}
          onClose={() => setDialog(null)}
          onSave={(draft) => void savePenalty(draft)}
        />
      )}

      {dialog?.kind === "goaliePick" && (
        <GoaliePickDialog
          goalies={goalies}
          activeGoalieId={activeGoalieId}
          reason={dialog.reason}
          onPick={(goalieId) => {
            const faceoff = dialog.reason === "faceoff";
            setDialog(null);
            putGoalieOnIce(goalieId);
            // Při prvním buly je výběr brankáře součástí jednoho ťuknutí.
            if (faceoff && state.next) void startPeriod(state.next);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "times" && (
        <PeriodTimesPanel
          title={timesTitle}
          spans={state.spans}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "shootout" && (
        <ShootoutDialog
          participants={participants}
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
          player={statsParticipants.find((p) => p.id === dialog.playerId)}
          stats={byPlayer[dialog.playerId]}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "lineup" && (
        <LineupDialog
          matchId={matchId}
          roster={roster}
          players={players}
          guests={guests}
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

type RosterEntryList = Awaited<ReturnType<typeof rosterOfMatch>>;

/** Nejpozdější gól nebo trest s časem v dané třetině. */
function latestTimedEvent(events: MatchEvent[], period: Period): number | null {
  let latest: number | null = null;
  for (const event of events) {
    if (event.deleted || event.period !== period) continue;
    if (event.type !== "goal_for" && event.type !== "goal_against" && event.type !== "penalty")
      continue;
    const sec = clockToSeconds(event.clock);
    if (sec === null) continue;
    latest = latest === null ? sec : Math.max(latest, sec);
  }
  return latest;
}

/* ------------------------------------------------------------ řádek události */

function EventRow({
  event,
  players,
  participants,
  locked,
  onEdit,
  onDelete,
}: {
  event: MatchEvent;
  players: Map<string, Player>;
  participants: Map<string, Participant>;
  locked: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const name = (id: string | null) =>
    id ? playerNumber(participants.get(id) ?? players.get(id)) : "?";
  const period = PERIOD_SHORT[event.period] ?? event.period;

  const strengthTag =
    event.strength && event.strength !== "ev" ? (
      <span className="ml-1 rounded bg-black/40 px-1 text-[10px] font-bold tracking-wide">
        {event.strength.toUpperCase()}
      </span>
    ) : null;

  let text: React.ReactNode = null;
  let accent = "bg-white/5";

  switch (event.type) {
    case "goal_for":
      accent = "bg-emerald-500/10";
      text = (
        <>
          <strong>Gól</strong> #{name(event.playerId)}
          {strengthTag}
          {event.assists.length > 0 && (
            <span className="text-slate-400">
              {" "}
              (A: {event.assists.map((id) => `#${name(id)}`).join(", ")})
            </span>
          )}
          {/* Úplný seznam plusů, včetně střelce a asistentů – u zapisovatele
              se hlásí celá pětka na ledě a nemá se dopočítávat z hlavy. */}
          {event.onIcePlus.length > 0 && (
            <span className="text-emerald-300/80">
              {" "}
              (+: {event.onIcePlus.map((id) => `#${name(id)}`).join(", ")})
            </span>
          )}
        </>
      );
      break;
    case "goal_against":
      accent = "bg-rose-500/10";
      text = (
        <>
          <strong>Obdržený gól</strong>
          {strengthTag} <span className="text-slate-400">B: #{name(event.goalieId)}</span>
          {event.onIceMinus.length > 0 && (
            <span className="text-rose-300/80">
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
          <strong>{event.side === "opp" ? "Trest soupeře" : "Trest"}</strong>
          {event.side !== "opp" && <> #{name(event.playerId)}</>}
          <span className="text-slate-400">
            {" "}
            ({event.penaltyCode ?? "?"}
            {event.penaltyMin ? `, ${event.penaltyMin} TM` : ""})
          </span>
        </>
      );
      break;
    case "shot":
      text = <span className="text-slate-300">Střela #{name(event.playerId)}</span>;
      break;
    case "save":
      text = <span className="text-slate-300">Zákrok #{name(event.goalieId)}</span>;
      break;
    case "period_start":
      accent = "bg-ice-500/10";
      text = (
        <>
          <strong>Buly – {period}</strong>{" "}
          <span className="text-slate-400 tabular-nums">{formatTimeOfDay(event.recordedAt)}</span>
        </>
      );
      break;
    case "period_end":
      accent = "bg-ice-500/10";
      text = (
        <>
          <strong>Konec {period}</strong>{" "}
          <span className="text-slate-400 tabular-nums">{formatTimeOfDay(event.recordedAt)}</span>
        </>
      );
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
    <li className={`flex items-start gap-3 px-4 py-2 text-sm ${accent}`}>
      <span className="w-20 shrink-0 pt-0.5 text-xs text-slate-500 tabular-nums">
        {period}
        {event.clock ? ` ${event.clock}` : ""}
      </span>
      {/* Bez ořezávání – u zapisovatele se z řádku čte celá sestava na ledě,
          takže se radši zalomí na víc řádků, než aby zmizela pod třemi tečkami. */}
      <span className="min-w-0 flex-1">{text}</span>
      {!locked && (
        <span className="no-print flex shrink-0 gap-1">
          {onEdit && (
            <button className="btn-ghost !px-2 !py-1" onClick={onEdit} title="Upravit">
              Upravit
            </button>
          )}
          <button className="btn-ghost !px-2 !py-1" onClick={onDelete} title="Smazat">
            Smazat
          </button>
        </span>
      )}
    </li>
  );
}

/* ------------------------------------------------------- detail hráče */

function PlayerDetail({
  player,
  stats,
  onClose,
}: {
  player: Participant | undefined;
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
          {row("Trestné minuty", stats.pim)}
          {stats.soAttempts > 0 && row("Nájezdy", `${stats.soGoals}/${stats.soAttempts}`)}
        </div>
      )}
    </Modal>
  );
}
