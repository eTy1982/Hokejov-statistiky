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

/** Kmenový hráč ze sdílené tabulky public.players (sdílí se se skladem). */
export interface Player {
  id: string;
  fullName: string;
  jerseyNumber: number | null;
  position: Position | null;
  personType: string; // "hrac" | "trener"
  isActive: boolean;
}

/** Hostující hráč – výpomoc z juniorky při marodce.
 *  Vlastní tabulka, protože klub jim vybavení nevydává a ve skladu nemají co dělat. */
export interface GuestPlayer {
  id: string;
  fullName: string;
  note: string | null;
  isActive: boolean;
  updatedAt: string;
}

/** Zařazení do konkrétního zápasu. Pětka i číslo dresu patří k zápasu, ne
 *  k hráči – při marodce host převezme číslo zraněného a i kmenoví hráči se
 *  občas přečíslují. */
export interface RosterEntry {
  /** id řádku match_roster. */
  id: string;
  matchId: string;
  /** Vyplněné je právě jedno z dvojice. */
  playerId: string | null;
  guestId: string | null;
  jerseyNumber: number | null;
  line: number; // 0 = bez pětky, jinak 1..5
  position: Position;
}

/** Identita, na kterou odkazují události – buď players.id, nebo guest_players.id. */
export const participantId = (entry: RosterEntry): string =>
  (entry.playerId ?? entry.guestId)!;

/** Kmenový i hostující hráč sjednocený pro potřeby zápasu.
 *  Komponenty pracují s tímhle, ne se dvěma zdroji zvlášť. */
export interface Participant {
  rosterId: string;
  /** Na tohle id odkazují události. */
  id: string;
  fullName: string;
  jerseyNumber: number | null;
  position: Position;
  line: number;
  isGuest: boolean;
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
