/** Doménové typy. Zdrojem pravdy je vždy seznam událostí (MatchEvent[]);
 *  veškeré statistiky se z nich dopočítávají (viz stats.ts). */

/** Třetiny, ve kterých se vedou statistiky. "SO" = samostatné nájezdy. */
export const PERIODS = ["1", "2", "3", "P"] as const;
export type RegularPeriod = (typeof PERIODS)[number];
export type Period = RegularPeriod | "SO";

export type Position = "B" | "O" | "Ú";
export const POSITIONS: Position[] = ["B", "O", "Ú"];

export type EventType =
  | "shot" // střela hráče na branku soupeře
  | "save" // zákrok našeho brankáře
  | "goal_for" // vstřelený gól
  | "goal_against" // obdržený gól
  | "penalty" // trest
  | "so_attempt"; // pokus v samostatných nájezdech

export type SoResult = "goal" | "miss" | "save";
export type HomeAway = "home" | "away";
export type MatchStatus = "live" | "finished";
export type Side = "us" | "opp";

/** Hráč ze sdílené tabulky public.players. */
export interface Player {
  id: string;
  fullName: string;
  jerseyNumber: number | null;
  position: Position | null;
  personType: string; // "hrac" | "trener"
  isActive: boolean;
}

/** Zařazení hráče do konkrétního zápasu – pětka se zápas od zápasu mění. */
export interface RosterEntry {
  playerId: string;
  line: number; // 0 = bez pětky, jinak 1..5
  position: Position;
}

export interface Match {
  id: string;
  clientId: string;
  seasonId: string | null;
  matchDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  venue: string | null;
  opponent: string | null;
  homeAway: HomeAway;
  competition: string | null;
  tags: string[];
  status: MatchStatus;
  shootoutWinner: Side | null;
  note: string | null;
  updatedAt: string;
}

export interface MatchEvent {
  clientId: string; // stabilní ID generované offline, nese idempotenci
  matchId: string;
  seq: number; // pořadí zápisu v rámci zápasu
  period: Period;
  clock: string | null; // "mm:ss"
  type: EventType;
  playerId: string | null;
  goalieId: string | null;
  assists: string[]; // max 2
  onIcePlus: string[];
  onIceMinus: string[];
  soResult: SoResult | null;
  soRound: number | null;
  penaltyMin: number | null;
  deleted: boolean;
  updatedAt: string;
}

/** Prázdná událost s rozumnými výchozími hodnotami. */
export function makeEvent(
  base: Pick<MatchEvent, "matchId" | "seq" | "period" | "type"> & Partial<MatchEvent>,
): MatchEvent {
  return {
    clientId: base.clientId ?? crypto.randomUUID(),
    clock: null,
    playerId: null,
    goalieId: null,
    assists: [],
    onIcePlus: [],
    onIceMinus: [],
    soResult: null,
    soRound: null,
    penaltyMin: null,
    deleted: false,
    updatedAt: new Date().toISOString(),
    ...base,
  };
}
