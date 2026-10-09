/** Návrh početního stavu z trestů obou stran.
 *
 *  Slouží dialogu gólu (předvybere stav hry) a horní liště (co právě běží).
 *  Výsledek je **vždy z pohledu Dynama** – stejná konvence jako u `Strength`
 *  v types.ts: `pp` = jsme v přesilovce, `sh` = jsme v oslabení.
 *
 *  `en` (prázdná branka) se nenavrhuje nikdy, z trestů se poznat nedá – tu
 *  vybírá zapisovatel ručně.
 *
 *  Čistá funkce bez stavu; testy v strength.test.ts pokrývají všech dvanáct
 *  případů ze zadání.
 */
import { absoluteTime, clockToSeconds } from "./clock";
import { effectiveCode, penaltyDurations } from "./penalty";
import type { MatchEvent, Period, Side } from "./types";

export interface RunningPenalty {
  clientId: string;
  side: Side;
  /** U trestu soupeře null – hráče soupeře nesledujeme. */
  playerId: string | null;
  code: string;
  /** Absolutní čas udělení (sekundy od začátku zápasu). */
  startedAt: number;
  /** Absolutní čas, kdy skončí právě běžící díl. */
  endsAt: number;
  /** Čeká ještě další díl – druhá polovina `2+2`. */
  hasNextPart: boolean;
}

export interface StrengthSuggestion {
  strength: "ev" | "pp" | "sh";
  /** Běžící tresty Dynama, od nejdřív uděleného. */
  ours: RunningPenalty[];
  theirs: RunningPenalty[];
  /** Hráčů v poli bez brankáře, nejméně tři. */
  ourSkaters: number;
  theirSkaters: number;
}

interface Pen {
  clientId: string;
  side: Side;
  playerId: string | null;
  code: string;
  seq: number;
  startedAt: number;
  /** Délky dílů, které mění počet hráčů, v sekundách. */
  durations: number[];
  partIndex: number;
  partStart: number;
  partEnd: number;
  done: boolean;
}

const MINOR = 120;

const byTime = (a: Pen, b: Pen) => a.startedAt - b.startedAt || a.seq - b.seq;

/** Tresty, které vstupují do početního stavu. Vynechává tresty bez času
 *  (nejdou umístit na časovou osu) a osobní tresty, které počet hráčů nemění. */
function collectPenalties(events: MatchEvent[], ignoreClientId?: string): Pen[] {
  const pens: Pen[] = [];
  for (const e of events) {
    if (e.deleted || e.type !== "penalty") continue;
    if (e.clientId === ignoreClientId) continue;
    if (e.period === "SO") continue;
    const sec = clockToSeconds(e.clock);
    if (sec === null) continue;
    const code = effectiveCode(e);
    const durations = penaltyDurations(code);
    if (!durations.length || !code) continue;
    const startedAt = absoluteTime(e.period, sec);
    pens.push({
      clientId: e.clientId,
      side: e.side ?? "us", // starší záznamy strany neznaly, byly vždy naše
      playerId: e.playerId,
      code,
      seq: e.seq,
      startedAt,
      durations,
      partIndex: 0,
      partStart: startedAt,
      partEnd: startedAt + durations[0]!,
      done: false,
    });
  }
  return pens.sort(byTime);
}

/** Stejné tresty obou stran ve stejném čase se vzájemně ruší: početní stav
 *  nemění a gól je neukončí. Hráči sedí na trestné, ale rozdíl je nulový –
 *  proto z výpisu běžících trestů vypadnou úplně. */
function cancelCoincidental(pens: Pen[]): Pen[] {
  const groups = new Map<string, { us: Pen[]; opp: Pen[] }>();
  for (const pen of pens) {
    const key = `${pen.startedAt}|${pen.durations.join(",")}`;
    const group = groups.get(key) ?? { us: [], opp: [] };
    (pen.side === "us" ? group.us : group.opp).push(pen);
    groups.set(key, group);
  }
  const kept: Pen[] = [];
  for (const group of groups.values()) {
    const pairs = Math.min(group.us.length, group.opp.length);
    kept.push(...group.us.slice(pairs), ...group.opp.slice(pairs));
  }
  return kept.sort(byTime);
}

/** Posune trest na čas `t` – projde díly, které skončily samy. Volá se jen
 *  s neklesajícím `t`. */
function advanceTo(pen: Pen, t: number): void {
  while (!pen.done && pen.partEnd <= t) {
    pen.partIndex += 1;
    if (pen.partIndex >= pen.durations.length) {
      pen.done = true;
      return;
    }
    pen.partStart = pen.partEnd;
    pen.partEnd = pen.partStart + pen.durations[pen.partIndex]!;
  }
}

/** Trest s časem shodným s dotazem se ještě nepočítá (odložený trest). */
function runningAt(pen: Pen, t: number): boolean {
  return !pen.done && pen.partStart < t && t < pen.partEnd;
}

/** Gól v přesilovce ukončí běžící menší trest. U `2+2` tím začne druhý díl
 *  v čase gólu, velký trest (5) běží dál. */
function terminate(pen: Pen, t: number): void {
  pen.partIndex += 1;
  if (pen.partIndex >= pen.durations.length) {
    pen.done = true;
    return;
  }
  pen.partStart = t;
  pen.partEnd = t + pen.durations[pen.partIndex]!;
}

const toRunning = (pen: Pen): RunningPenalty => ({
  clientId: pen.clientId,
  side: pen.side,
  playerId: pen.playerId,
  code: pen.code,
  startedAt: pen.startedAt,
  endsAt: pen.partEnd,
  hasNextPart: pen.partIndex + 1 < pen.durations.length,
});

interface Goal {
  at: number;
  scorer: Side;
  seq: number;
}

/** Góly umístitelné na časovou osu, které padly před dotazovaným časem.
 *  Gól přesně v dotazovaném čase je ten, na který se ptáme – vlastní stav
 *  hry si ovlivnit nesmí. */
function goalsBefore(events: MatchEvent[], at: number, ignoreClientId?: string): Goal[] {
  const goals: Goal[] = [];
  for (const e of events) {
    if (e.deleted || e.period === "SO") continue;
    if (e.type !== "goal_for" && e.type !== "goal_against") continue;
    if (e.clientId === ignoreClientId) continue;
    const sec = clockToSeconds(e.clock);
    if (sec === null) continue;
    const abs = absoluteTime(e.period, sec);
    if (abs >= at) continue;
    goals.push({ at: abs, scorer: e.type === "goal_for" ? "us" : "opp", seq: e.seq });
  }
  return goals.sort((a, b) => a.at - b.at || a.seq - b.seq);
}

/** Početní stav v daném okamžiku třetiny.
 *
 *  `ignoreClientId` vynechá jednu událost z výpočtu – používá to dialog při
 *  opravě gólu, aby gól neovlivňoval návrh stavu pro sebe sama. */
export function strengthAt(
  events: MatchEvent[],
  period: Period,
  elapsedSec: number,
  options: { ignoreClientId?: string } = {},
): StrengthSuggestion {
  const at = absoluteTime(period, elapsedSec);
  const pens = cancelCoincidental(collectPenalties(events, options.ignoreClientId));

  for (const goal of goalsBefore(events, at, options.ignoreClientId)) {
    for (const pen of pens) advanceTo(pen, goal.at);

    const running = pens.filter((pen) => runningAt(pen, goal.at));
    const scoring = running.filter((pen) => pen.side === goal.scorer);
    const punished = running.filter((pen) => pen.side !== goal.scorer);

    // Jen gól v přesilovce trest ukončí – při 4:4 se nic neruší.
    if (scoring.length >= punished.length) continue;
    // Víc trestů (5:3) → končí ten nejdřív udělený.
    const minor = punished.find((pen) => pen.durations[pen.partIndex] === MINOR);
    if (minor) terminate(minor, goal.at);
  }

  for (const pen of pens) advanceTo(pen, at);

  const ours = pens.filter((pen) => pen.side === "us" && runningAt(pen, at));
  const theirs = pens.filter((pen) => pen.side === "opp" && runningAt(pen, at));
  const ourSkaters = Math.max(3, 5 - ours.length);
  const theirSkaters = Math.max(3, 5 - theirs.length);

  return {
    strength: ourSkaters > theirSkaters ? "pp" : ourSkaters < theirSkaters ? "sh" : "ev",
    ours: ours.map(toRunning),
    theirs: theirs.map(toRunning),
    ourSkaters,
    theirSkaters,
  };
}
