import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { BoardTimeInput } from "./BoardTimeInput";
import { ParticipantPicker } from "./ParticipantPicker";
import { boardToElapsed, clockToSeconds, elapsedToBoard, formatSeconds, fromAbsolute } from "../lib/clock";
import { PERIOD_IN, PERIOD_LABEL, playerLabel } from "../lib/format";
import { availableLines } from "../lib/playerRows";
import { strengthAt, type RunningPenalty } from "../lib/strength";
import {
  STRENGTHS,
  type MatchEvent,
  type Participant,
  type Period,
  type Strength,
} from "../lib/types";
import { useBoardCountsDown } from "../hooks/useBoardCountsDown";
import type { LayoutSize } from "../hooks/useLayoutSize";

type Mode = "for" | "against";
type Role = "shooter" | "assist" | "plus" | "goalie" | "minus";
type Tab = "clock" | Role;

export interface GoalDraft {
  clock: string;
  playerId: string | null;
  goalieId: string | null;
  assists: string[];
  onIcePlus: string[];
  onIceMinus: string[];
  strength: Strength;
}

interface Props {
  mode: Mode;
  period: Period;
  participants: Participant[];
  /** Všechny události zápasu – z nich se navrhne stav hry. */
  events: MatchEvent[];
  activeGoalieId: string | null;
  venue: string | null;
  size: LayoutSize;
  /** Vyplněno při opravě existující události. */
  editing?: MatchEvent | null;
  onSave: (draft: GoalDraft) => void;
  onClose: () => void;
}

export function GoalDialog({
  mode,
  period,
  participants,
  events,
  activeGoalieId,
  venue,
  size,
  editing,
  onSave,
  onClose,
}: Props) {
  const forUs = mode === "for";
  const cover = size === "cover";

  const [countsDown, setCountsDown] = useBoardCountsDown(venue);
  const [digits, setDigits] = useState(() => initialDigits(editing, period, countsDown));
  const [shooter, setShooter] = useState<string | null>(editing?.playerId ?? null);
  const [goalie, setGoalie] = useState<string | null>(editing?.goalieId ?? activeGoalieId);
  const [assists, setAssists] = useState<string[]>(editing?.assists ?? []);
  const [plus, setPlus] = useState<string[]>(
    (editing?.onIcePlus ?? []).filter(
      (id) => id !== editing?.playerId && !(editing?.assists ?? []).includes(id),
    ),
  );
  const [minus, setMinus] = useState<string[]>(editing?.onIceMinus ?? []);
  /** Ruční volba stavu hry přebije návrh a zůstane, i když se pak změní čas. */
  const [manualStrength, setManualStrength] = useState<Strength | null>(
    editing?.strength ?? null,
  );
  const [role, setRole] = useState<Role>(forUs ? "shooter" : "goalie");
  const [tab, setTab] = useState<Tab>(cover ? "clock" : forUs ? "shooter" : "goalie");

  const elapsed = boardToElapsed(digits, period, countsDown);

  const suggestion = useMemo(() => {
    if (elapsed === null) return null;
    return strengthAt(events, period, elapsed, { ignoreClientId: editing?.clientId });
  }, [elapsed, events, period, editing?.clientId]);

  const strength: Strength = manualStrength ?? suggestion?.strength ?? "ev";

  /** Upozornění, ne zákaz – zapisovatel může mít pravdu a aplikace ne. */
  const outOfOrder = useMemo(() => {
    if (elapsed === null) return false;
    const previous = latestGoalElapsed(events, period, editing?.clientId);
    return previous !== null && elapsed < previous;
  }, [elapsed, events, period, editing?.clientId]);

  const goalies = useMemo(() => participants.filter((p) => p.position === "B"), [participants]);

  const lockedPlus = useMemo(
    () => new Set<string>([...(shooter ? [shooter] : []), ...assists]),
    [shooter, assists],
  );

  const selectedIds = useMemo(() => {
    switch (role) {
      case "shooter":
        return new Set(shooter ? [shooter] : []);
      case "assist":
        return new Set(assists);
      case "plus":
        return new Set([...lockedPlus, ...plus]);
      case "goalie":
        return new Set(goalie ? [goalie] : []);
      case "minus":
        return new Set(minus);
    }
  }, [role, shooter, assists, plus, lockedPlus, goalie, minus]);

  const canSave = elapsed !== null && (forUs ? Boolean(shooter) : Boolean(goalie));

  /* ------------------------------------------------------------ výběr */

  const goToRole = (next: Role) => {
    setRole(next);
    if (cover) setTab(next);
  };

  const toggleParticipant = (id: string) => {
    switch (role) {
      case "shooter": {
        const next = shooter === id ? null : id;
        setShooter(next);
        setAssists((list) => list.filter((x) => x !== id));
        setPlus((list) => list.filter((x) => x !== id));
        // Po výběru střelce se rovnou posuneme na asistence.
        if (next) goToRole("assist");
        break;
      }
      case "assist": {
        if (id === shooter) break;
        if (assists.includes(id)) {
          setAssists(assists.filter((x) => x !== id));
          break;
        }
        if (assists.length >= 2) break;
        const next = [...assists, id];
        setAssists(next);
        setPlus((list) => list.filter((x) => x !== id));
        // Po druhé asistenci se posuneme na plus.
        if (next.length === 2) goToRole("plus");
        break;
      }
      case "plus": {
        if (lockedPlus.has(id)) break; // střelec a asistenti plus mít musí
        setPlus((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
        break;
      }
      case "goalie": {
        setGoalie((current) => (current === id ? null : id));
        break;
      }
      case "minus": {
        setMinus((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
        break;
      }
    }
  };

  /** Jedním ťukem celá formace, druhým zpátky. Útok a obrana se míchají,
   *  takže 3. útok s 1. obranou jsou dva ťuky. */
  const toggleLine = (position: "O" | "Ú", line: number) => {
    const ids = participants
      .filter((p) => p.position === position && p.line === line)
      .map((p) => p.id);
    const target = role === "minus" ? minus : plus;
    const effective = role === "minus" ? new Set(target) : new Set([...lockedPlus, ...target]);
    const allIn = ids.every((id) => effective.has(id));

    const update = (list: string[]) => {
      if (allIn) return list.filter((id) => !ids.includes(id));
      // Střelce a asistenty není potřeba přidávat, plus mají tak jako tak.
      const addable = role === "minus" ? ids : ids.filter((id) => !lockedPlus.has(id));
      return [...new Set([...list, ...addable])];
    };

    if (role === "minus") setMinus(update);
    else setPlus(update);
  };

  const save = () => {
    if (elapsed === null) return;
    const finalAssists = assists.slice(0, 2);
    onSave({
      clock: formatSeconds(elapsed),
      playerId: forUs ? shooter : null,
      goalieId: forUs ? null : goalie,
      assists: forUs ? finalAssists : [],
      onIcePlus: forUs ? [...new Set([shooter!, ...finalAssists, ...plus])] : [],
      onIceMinus: forUs ? [] : minus,
      strength,
    });
  };

  /* ------------------------------------------------------------- části */

  const roles: { key: Role; label: string }[] = forUs
    ? [
        { key: "shooter", label: shooter ? "Střelec ✓" : "Střelec" },
        { key: "assist", label: `Asistence (${assists.length}/2)` },
        { key: "plus", label: `Plus (${lockedPlus.size + plus.length})` },
      ]
    : [
        { key: "goalie", label: goalie ? "Brankář ✓" : "Brankář" },
        { key: "minus", label: `Minus (${minus.length})` },
      ];

  const clockPane = (
    <div className="space-y-3">
      <BoardTimeInput
        digits={digits}
        onDigits={setDigits}
        countsDown={countsDown}
        onCountsDown={setCountsDown}
        period={period}
        size={size}
      />

      {outOfOrder && (
        <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
          Tenhle čas je dřív než předchozí gól ve stejné třetině. Nezačala už další třetina, nebo
          je překlep?
        </p>
      )}

      <div>
        <div className="label">Stav hry z pohledu Dynama</div>
        <div className="flex gap-1.5">
          {STRENGTHS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.title}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
                strength === option.value
                  ? "bg-ice-500 text-white"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              onClick={() => setManualStrength(option.value)}
            >
              {STRENGTH_LABEL[option.value]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {suggestion
            ? describeSuggestion(suggestion, period, countsDown, manualStrength !== null)
            : "Po zadání času se stav hry navrhne z trestů."}
        </p>
      </div>
    </div>
  );

  const pickerPane = (
    <div className="space-y-3">
      {/* Na zavřeném Foldu role přepínají záložky nahoře, tady by se zdvojily. */}
      {!cover && (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((item) => (
            <button
              key={item.key}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                role === item.key
                  ? "bg-ice-500 text-white"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              onClick={() => goToRole(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {(role === "plus" || role === "minus") && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-white/5 p-2">
          <span className="self-center px-1 text-xs tracking-wide text-slate-400 uppercase">
            Formace
          </span>
          {(["Ú", "O"] as const).map((position) =>
            availableLines(participants, position).map((line) => (
              <button
                key={`${position}${line}`}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20"
                onClick={() => toggleLine(position, line)}
              >
                {position}
                {line}
              </button>
            )),
          )}
        </div>
      )}

      <ParticipantPicker
        participants={role === "goalie" ? goalies : participants}
        selected={selectedIds}
        locked={role === "plus" ? lockedPlus : undefined}
        onToggle={toggleParticipant}
        size={size}
      />

      {role === "plus" && (
        <p className="text-xs text-slate-500">
          Střelec a asistenti mají plus vždy. Kdo zrovna střídal, odklikněte.
        </p>
      )}
      {role === "assist" && (
        <p className="text-xs text-slate-500">Asistence nejsou povinné – gól jde uložit i bez nich.</p>
      )}
    </div>
  );

  const title = editing
    ? forUs
      ? "Upravit vstřelený gól"
      : "Upravit obdržený gól"
    : forUs
      ? "Vstřelený gól"
      : "Obdržený gól";

  const subtitle = `${PERIOD_LABEL[period] ?? period}${
    elapsed === null ? "" : ` • ${formatSeconds(elapsed)} odehraného času`
  }${forUs && shooter ? ` • ${playerLabel(participants.find((p) => p.id === shooter))}` : ""}`;

  return (
    <Modal
      wide={!cover}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Zrušit
          </button>
          {cover && tab === "clock" && (
            <button
              className="btn-primary"
              disabled={elapsed === null}
              onClick={() => goToRole(forUs ? "shooter" : "goalie")}
            >
              Dál
            </button>
          )}
          <button className="btn-success" disabled={!canSave} onClick={save}>
            Uložit
          </button>
        </>
      }
    >
      {cover ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                tab === "clock"
                  ? "bg-ice-500 text-white"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              onClick={() => setTab("clock")}
            >
              {elapsed === null ? "Čas ⚠" : `Čas ${formatSeconds(elapsed)}`}
            </button>
            {roles.map((item) => (
              <button
                key={item.key}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  tab === item.key
                    ? "bg-ice-500 text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
                onClick={() => goToRole(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {tab === "clock" ? clockPane : pickerPane}
        </div>
      ) : (
        <div className="grid grid-cols-[18rem_1fr] gap-5">
          {clockPane}
          {pickerPane}
        </div>
      )}
    </Modal>
  );
}

const STRENGTH_LABEL: Record<Strength, string> = {
  ev: "5:5",
  pp: "Přesilovka",
  sh: "Oslabení",
  en: "Prázdná",
};

/** Při opravě se čas vrátí do formátu tabule, ať se v něm dá pokračovat. */
function initialDigits(
  editing: MatchEvent | null | undefined,
  period: Period,
  countsDown: boolean,
): string {
  const sec = clockToSeconds(editing?.clock ?? null);
  if (sec === null) return "";
  return elapsedToBoard(sec, period, countsDown).replace(/\D/g, "");
}

/** Nejpozdější gól v téže třetině – kvůli upozornění na překlep. */
function latestGoalElapsed(
  events: MatchEvent[],
  period: Period,
  ignoreClientId: string | undefined,
): number | null {
  let latest: number | null = null;
  for (const event of events) {
    if (event.deleted || event.period !== period) continue;
    if (event.type !== "goal_for" && event.type !== "goal_against") continue;
    if (event.clientId === ignoreClientId) continue;
    const sec = clockToSeconds(event.clock);
    if (sec === null) continue;
    latest = latest === null ? sec : Math.max(latest, sec);
  }
  return latest;
}

function describeSuggestion(
  suggestion: ReturnType<typeof strengthAt>,
  period: Period,
  countsDown: boolean,
  overridden: boolean,
): string {
  const prefix = overridden ? "Ruční volba. Podle trestů" : "Podle trestů";
  const name = { ev: "plný počet", pp: "přesilovka", sh: "oslabení" }[suggestion.strength];
  const running = [
    ...suggestion.theirs.map((pen) => `soupeř ${describePenalty(pen, period, countsDown)}`),
    ...suggestion.ours.map((pen) => `my ${describePenalty(pen, period, countsDown)}`),
  ];
  return running.length
    ? `${prefix}: ${name} – ${running.join(", ")}`
    : `${prefix}: ${name} – žádný trest neběží`;
}

function describePenalty(
  penalty: RunningPenalty,
  period: Period,
  countsDown: boolean,
): string {
  const start = fromAbsolute(penalty.startedAt);
  const from =
    start.period === period
      ? `od ${formatSeconds(start.sec)}`
      : `od ${formatSeconds(start.sec)} ${PERIOD_IN[start.period] ?? ""}`;
  const end = fromAbsolute(penalty.endsAt);
  return `${penalty.code} ${from}, konec na tabuli ${elapsedToBoard(end.sec, end.period, countsDown)}`;
}
