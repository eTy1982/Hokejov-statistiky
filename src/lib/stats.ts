/** Výpočet statistik z událostí.
 *
 *  Celý modul je čistá funkce událostí -> statistiky. Nic se nikde neinkrementuje
 *  „stranou“, takže editace ani smazání události nemůže rozhodit součty – to byla
 *  hlavní slabina předchozí verze.
 *
 *  Konvence: gól JE střela na branku. Vstřelený gól se tedy počítá i do střel,
 *  stejně jako se obdržený gól počítá do střel soupeře (zásahy + obdržené).
 *  Díky tomu jsou obě strany ukazatele „Střely“ měřené stejně.
 */
import { PERIODS, type MatchEvent, type Period, type RegularPeriod, type Side } from "./types";

export type PeriodCounts = Record<RegularPeriod, number>;

const zeroCounts = (): PeriodCounts => ({ "1": 0, "2": 0, "3": 0, P: 0 });
const emptyTimes = (): Record<RegularPeriod, string[]> => ({ "1": [], "2": [], "3": [], P: [] });

export interface PlayerStats {
  /** Střely včetně gólů. */
  shots: PeriodCounts;
  goals: Record<RegularPeriod, string[]>;
  assists: PeriodCounts;
  plus: PeriodCounts;
  minus: PeriodCounts;
  penalties: Record<RegularPeriod, string[]>;
  /** Brankář: zákroky. */
  saves: PeriodCounts;
  /** Brankář: obdržené góly (časy). */
  goalsAgainst: Record<RegularPeriod, string[]>;
  /** Nájezdy – vedou se odděleně, do klasických statistik nevstupují. */
  soAttempts: number;
  soGoals: number;
  soSaves: number;
  soGoalsAgainst: number;
}

export const emptyPlayerStats = (): PlayerStats => ({
  shots: zeroCounts(),
  goals: emptyTimes(),
  assists: zeroCounts(),
  plus: zeroCounts(),
  minus: zeroCounts(),
  penalties: emptyTimes(),
  saves: zeroCounts(),
  goalsAgainst: emptyTimes(),
  soAttempts: 0,
  soGoals: 0,
  soSaves: 0,
  soGoalsAgainst: 0,
});

export type StatsByPlayer = Record<string, PlayerStats>;

export interface MatchTotals {
  /** Skóre po třetinách z pohledu nás/soupeře. */
  goalsFor: PeriodCounts;
  goalsAgainst: PeriodCounts;
  shotsFor: PeriodCounts;
  shotsAgainst: PeriodCounts;
  /** Součty přes všechny třetiny. */
  totalGoalsFor: number;
  totalGoalsAgainst: number;
  totalShotsFor: number;
  totalShotsAgainst: number;
  /** Nájezdy. */
  soFor: number;
  soAgainst: number;
  soRounds: number;
}

const isRegular = (p: Period): p is RegularPeriod => p !== "SO";

/** Bezpečné čtení/zápis do PeriodCounts (tsconfig má noUncheckedIndexedAccess). */
const bump = (c: PeriodCounts, p: RegularPeriod, by = 1) => {
  c[p] = (c[p] ?? 0) + by;
};
const push = (t: Record<RegularPeriod, string[]>, p: RegularPeriod, v: string) => {
  (t[p] ??= []).push(v);
};
export const sumCounts = (c: PeriodCounts): number =>
  PERIODS.reduce((acc, p) => acc + (c[p] ?? 0), 0);
export const sumTimes = (t: Record<RegularPeriod, string[]>): number =>
  PERIODS.reduce((acc, p) => acc + (t[p]?.length ?? 0), 0);

/** Seřadí události do deterministického pořadí a odfiltruje smazané. */
export function liveEvents(events: MatchEvent[]): MatchEvent[] {
  return events.filter((e) => !e.deleted).sort((a, b) => a.seq - b.seq);
}

export interface ComputedStats {
  byPlayer: StatsByPlayer;
  totals: MatchTotals;
}

export function computeStats(events: MatchEvent[], shootoutWinner: Side | null = null): ComputedStats {
  const byPlayer: StatsByPlayer = {};
  const totals: MatchTotals = {
    goalsFor: zeroCounts(),
    goalsAgainst: zeroCounts(),
    shotsFor: zeroCounts(),
    shotsAgainst: zeroCounts(),
    totalGoalsFor: 0,
    totalGoalsAgainst: 0,
    totalShotsFor: 0,
    totalShotsAgainst: 0,
    soFor: 0,
    soAgainst: 0,
    soRounds: 0,
  };

  const of = (id: string | null | undefined): PlayerStats | null => {
    if (!id) return null;
    return (byPlayer[id] ??= emptyPlayerStats());
  };

  for (const e of liveEvents(events)) {
    const clock = e.clock ?? "";

    if (e.type === "so_attempt") {
      const shooter = of(e.playerId);
      const goalie = of(e.goalieId);
      if (shooter) {
        shooter.soAttempts += 1;
        if (e.soResult === "goal") shooter.soGoals += 1;
      }
      if (goalie) {
        if (e.soResult === "save") goalie.soSaves += 1;
        if (e.soResult === "goal") goalie.soGoalsAgainst += 1;
      }
      if (e.soResult === "goal" && e.playerId) totals.soFor += 1;
      if (e.soResult === "goal" && e.goalieId) totals.soAgainst += 1;
      totals.soRounds = Math.max(totals.soRounds, e.soRound ?? 0);
      continue;
    }

    if (!isRegular(e.period)) continue;
    const p = e.period;

    switch (e.type) {
      case "shot": {
        const s = of(e.playerId);
        if (s) bump(s.shots, p);
        bump(totals.shotsFor, p);
        break;
      }
      case "save": {
        const g = of(e.goalieId);
        if (g) bump(g.saves, p);
        bump(totals.shotsAgainst, p);
        break;
      }
      case "goal_for": {
        const shooter = of(e.playerId);
        if (shooter) {
          push(shooter.goals, p, clock);
          bump(shooter.shots, p); // gól je zároveň střela
          bump(shooter.plus, p);
        }
        for (const id of e.assists.slice(0, 2)) {
          const a = of(id);
          if (!a) continue;
          bump(a.assists, p);
          bump(a.plus, p);
        }
        for (const id of e.onIcePlus) {
          if (id === e.playerId || e.assists.includes(id)) continue; // plus se nepřičítá dvakrát
          const x = of(id);
          if (x) bump(x.plus, p);
        }
        bump(totals.goalsFor, p);
        bump(totals.shotsFor, p);
        break;
      }
      case "goal_against": {
        const g = of(e.goalieId);
        if (g) push(g.goalsAgainst, p, clock);
        for (const id of e.onIceMinus) {
          const x = of(id);
          if (x) bump(x.minus, p);
        }
        bump(totals.goalsAgainst, p);
        bump(totals.shotsAgainst, p);
        break;
      }
      case "penalty": {
        const s = of(e.playerId);
        if (s) push(s.penalties, p, clock);
        break;
      }
    }
  }

  totals.totalGoalsFor = sumCounts(totals.goalsFor);
  totals.totalGoalsAgainst = sumCounts(totals.goalsAgainst);
  totals.totalShotsFor = sumCounts(totals.shotsFor);
  totals.totalShotsAgainst = sumCounts(totals.shotsAgainst);

  // Vyhrané nájezdy = +1 gól do celkového skóre (v tabulce po třetinách se neobjeví).
  if (shootoutWinner === "us") totals.totalGoalsFor += 1;
  if (shootoutWinner === "opp") totals.totalGoalsAgainst += 1;

  return { byPlayer, totals };
}

/** Úspěšnost zákroků brankáře. Vrací null, pokud brankář nečelil žádné střele. */
export function savePercentage(s: PlayerStats): number | null {
  const saves = sumCounts(s.saves);
  const against = sumTimes(s.goalsAgainst);
  const faced = saves + against;
  return faced === 0 ? null : (saves / faced) * 100;
}

/** Skóre z pohledu domácí/hosté podle toho, na které straně hrajeme. */
export function scoreboard(totals: MatchTotals, homeAway: "home" | "away") {
  const weAreHome = homeAway === "home";
  const home = weAreHome ? totals.totalGoalsFor : totals.totalGoalsAgainst;
  const away = weAreHome ? totals.totalGoalsAgainst : totals.totalGoalsFor;
  const perPeriod = PERIODS.map((p) => {
    const us = totals.goalsFor[p] ?? 0;
    const them = totals.goalsAgainst[p] ?? 0;
    return weAreHome ? ([us, them] as const) : ([them, us] as const);
  });
  return { home, away, perPeriod };
}
