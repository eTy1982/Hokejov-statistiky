/** Synchronizace lokálního úložiště se Supabase.
 *
 *  Model: zapisuje se vždy lokálně, sync běží na pozadí a je idempotentní –
 *  každý záznam má stabilní UUID vygenerované na zařízení, takže opakované
 *  odeslání téhož zápisu server jen přepíše, nikdy nezduplikuje.
 *
 *  Konflikty: vyhrává novější `updated_at`. V praxi zápas zapisuje jedno
 *  zařízení a ostatní jen čtou, takže se konflikty prakticky nevyskytují.
 */
import { supabase } from "./supabase";
import {
  cachePlayers,
  db,
  dirtyRecords,
  getMeta,
  markClean,
  mergeServerEvent,
  mergeServerGuest,
  mergeServerMatch,
  putRoster,
  setMeta,
} from "./db";
import type { GuestPlayer, Match, MatchEvent, Player, Position, SoResult } from "./types";

const LAST_PULL = "lastPullAt";

export type SyncState = "idle" | "syncing" | "offline" | "error" | "unauthenticated";

export interface SyncResult {
  state: SyncState;
  pushed: number;
  pulled: number;
  error?: string;
}

/* ------------------------------------------------------- mapování řádků */

type MatchRow = {
  id: string;
  client_id: string;
  season_id: string | null;
  match_date: string;
  start_time: string | null;
  venue: string | null;
  opponent: string | null;
  home_away: "home" | "away";
  competition: string | null;
  tags: string[] | null;
  status: "live" | "finished";
  shootout_winner: "us" | "opp" | null;
  note: string | null;
  updated_at: string;
};

const matchToRow = (m: Match): MatchRow => ({
  id: m.id,
  client_id: m.clientId,
  season_id: m.seasonId,
  match_date: m.matchDate,
  start_time: m.startTime,
  venue: m.venue,
  opponent: m.opponent,
  home_away: m.homeAway,
  competition: m.competition,
  tags: m.tags,
  status: m.status,
  shootout_winner: m.shootoutWinner,
  note: m.note,
  updated_at: m.updatedAt,
});

const rowToMatch = (r: MatchRow): Match => ({
  id: r.id,
  clientId: r.client_id,
  seasonId: r.season_id,
  matchDate: r.match_date,
  startTime: r.start_time,
  venue: r.venue,
  opponent: r.opponent,
  homeAway: r.home_away,
  competition: r.competition,
  tags: r.tags ?? [],
  status: r.status,
  shootoutWinner: r.shootout_winner,
  note: r.note,
  updatedAt: r.updated_at,
});

type EventRow = {
  id: string;
  match_id: string;
  client_id: string;
  seq: number;
  period: MatchEvent["period"];
  clock: string | null;
  type: MatchEvent["type"];
  player_id: string | null;
  goalie_id: string | null;
  assists: string[] | null;
  on_ice_plus: string[] | null;
  on_ice_minus: string[] | null;
  so_result: SoResult | null;
  so_round: number | null;
  penalty_min: number | null;
  deleted: boolean;
  updated_at: string;
};

const eventToRow = (e: MatchEvent): EventRow => ({
  id: e.clientId, // lokální UUID je zároveň primárním klíčem na serveru
  match_id: e.matchId,
  client_id: e.clientId,
  seq: e.seq,
  period: e.period,
  clock: e.clock,
  type: e.type,
  player_id: e.playerId,
  goalie_id: e.goalieId,
  assists: e.assists,
  on_ice_plus: e.onIcePlus,
  on_ice_minus: e.onIceMinus,
  so_result: e.soResult,
  so_round: e.soRound,
  penalty_min: e.penaltyMin,
  deleted: e.deleted,
  updated_at: e.updatedAt,
});

const rowToEvent = (r: EventRow): MatchEvent => ({
  clientId: r.client_id,
  matchId: r.match_id,
  seq: r.seq,
  period: r.period,
  clock: r.clock,
  type: r.type,
  playerId: r.player_id,
  goalieId: r.goalie_id,
  assists: r.assists ?? [],
  onIcePlus: r.on_ice_plus ?? [],
  onIceMinus: r.on_ice_minus ?? [],
  soResult: r.so_result,
  soRound: r.so_round,
  penaltyMin: r.penalty_min,
  deleted: r.deleted,
  updatedAt: r.updated_at,
});

type PlayerRow = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  person_type: string;
  is_active: boolean;
};

const rowToPlayer = (r: PlayerRow): Player => ({
  id: r.id,
  fullName: r.full_name,
  jerseyNumber: r.jersey_number,
  position: (r.position as Position | null) ?? null,
  personType: r.person_type,
  isActive: r.is_active,
});

type GuestRow = {
  id: string;
  full_name: string;
  note: string | null;
  is_active: boolean;
  updated_at: string;
};

const guestToRow = (g: GuestPlayer): GuestRow => ({
  id: g.id,
  full_name: g.fullName,
  note: g.note,
  is_active: g.isActive,
  updated_at: g.updatedAt,
});

const rowToGuest = (r: GuestRow): GuestPlayer => ({
  id: r.id,
  fullName: r.full_name,
  note: r.note,
  isActive: r.is_active,
  updatedAt: r.updated_at,
});

type RosterRow = {
  id: string;
  match_id: string;
  player_id: string | null;
  guest_id: string | null;
  jersey_number: number | null;
  line: number;
  position: Position;
};

/* ------------------------------------------------------------ vlastní sync */

async function isSignedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/** Odešle vše rozpracované.
 *  Pořadí je dané cizími klíči: host → zápas → soupiska → události. */
async function push(): Promise<number> {
  const { matches, events, roster, guests } = await dirtyRecords();
  let pushed = 0;

  if (guests.length) {
    const { error } = await supabase.from("guest_players").upsert(guests.map(guestToRow));
    if (error) throw new Error(`hostující hráči: ${error.message}`);
    await markClean("guests", guests.map((g) => g.id));
    pushed += guests.length;
  }

  if (matches.length) {
    const { error } = await supabase.from("matches").upsert(matches.map(matchToRow));
    if (error) throw new Error(`zápasy: ${error.message}`);
    await markClean("matches", matches.map((m) => m.id));
    pushed += matches.length;
  }

  // Vyřazení ze sestavy se musí propsat i na ostatní zařízení.
  const removedRoster = (await getMeta<string[]>("removedRoster")) ?? [];
  if (removedRoster.length) {
    const { error } = await supabase.from("match_roster").delete().in("id", removedRoster);
    if (error) throw new Error(`vyřazení ze sestavy: ${error.message}`);
    await setMeta("removedRoster", []);
    pushed += removedRoster.length;
  }

  if (roster.length) {
    const rows: RosterRow[] = roster.map((r) => ({
      id: r.id,
      match_id: r.matchId,
      player_id: r.playerId,
      guest_id: r.guestId,
      jersey_number: r.jerseyNumber,
      line: r.line,
      position: r.position,
    }));
    const { error } = await supabase.from("match_roster").upsert(rows);
    if (error) throw new Error(`soupiska: ${error.message}`);
    await markClean("roster", roster.map((r) => r.id));
    pushed += roster.length;
  }

  if (events.length) {
    // po dávkách, ať se do requestu vejde i dlouhý zápas
    for (let i = 0; i < events.length; i += 200) {
      const chunk = events.slice(i, i + 200);
      const { error } = await supabase.from("match_events").upsert(chunk.map(eventToRow));
      if (error) throw new Error(`události: ${error.message}`);
      await markClean("events", chunk.map((e) => e.clientId));
      pushed += chunk.length;
    }
  }

  return pushed;
}

/** Stáhne změny ze serveru od posledního běhu. */
async function pull(): Promise<number> {
  const since = (await getMeta<string>(LAST_PULL)) ?? "1970-01-01T00:00:00Z";
  const startedAt = new Date().toISOString();
  let pulled = 0;

  const { data: matchRows, error: matchErr } = await supabase
    .from("matches")
    .select("*")
    .gt("updated_at", since);
  if (matchErr) throw new Error(`stažení zápasů: ${matchErr.message}`);

  for (const row of (matchRows ?? []) as MatchRow[]) {
    await mergeServerMatch(rowToMatch(row));
    pulled += 1;
  }

  const { data: eventRows, error: eventErr } = await supabase
    .from("match_events")
    .select("*")
    .gt("updated_at", since);
  if (eventErr) throw new Error(`stažení událostí: ${eventErr.message}`);

  for (const row of (eventRows ?? []) as EventRow[]) {
    await mergeServerEvent(rowToEvent(row));
    pulled += 1;
  }

  const { data: guestRows, error: guestErr } = await supabase
    .from("guest_players")
    .select("*")
    .gt("updated_at", since);
  if (guestErr) throw new Error(`stažení hostujících: ${guestErr.message}`);
  for (const row of (guestRows ?? []) as GuestRow[]) {
    await mergeServerGuest(rowToGuest(row));
    pulled += 1;
  }

  // Soupiska nemá vlastní updated_at, tahá se pro zápasy, které se právě změnily.
  const changedMatchIds = (matchRows ?? []).map((m) => (m as MatchRow).id);
  if (changedMatchIds.length) {
    const { data: rosterRows, error: rosterErr } = await supabase
      .from("match_roster")
      .select("*")
      .in("match_id", changedMatchIds);
    if (rosterErr) throw new Error(`stažení soupisky: ${rosterErr.message}`);

    const fromServer = (rosterRows ?? []) as RosterRow[];
    for (const r of fromServer) {
      await putRoster(
        {
          id: r.id,
          matchId: r.match_id,
          playerId: r.player_id,
          guestId: r.guest_id,
          jerseyNumber: r.jersey_number,
          line: r.line,
          position: r.position,
        },
        false,
      );
    }

    // Co na serveru není, bylo jinde vyřazeno – smazat i lokálně, ale neztratit
    // vlastní neodeslané změny.
    const database = await db();
    const serverIds = new Set(fromServer.map((r) => r.id));
    for (const matchId of changedMatchIds) {
      const local = await database.getAllFromIndex("roster", "byMatch", matchId);
      for (const entry of local) {
        if (!serverIds.has(entry.id) && entry.dirty === 0) {
          await database.delete("roster", entry.id);
        }
      }
    }
  }

  await setMeta(LAST_PULL, startedAt);
  return pulled;
}

/** Načte soupisku hráčů ze serveru a uloží ji pro offline použití. */
export async function refreshPlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, jersey_number, position, person_type, is_active")
    .eq("person_type", "hrac")
    .order("jersey_number", { nullsFirst: false });
  if (error) throw new Error(`hráči: ${error.message}`);
  const players = ((data ?? []) as PlayerRow[]).map(rowToPlayer);
  await cachePlayers(players);
  return players;
}

let running: Promise<SyncResult> | null = null;

/** Jeden průchod synchronizací. Souběžná volání se sloučí do jednoho běhu. */
export function sync(): Promise<SyncResult> {
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

async function runSync(): Promise<SyncResult> {
  if (!navigator.onLine) return { state: "offline", pushed: 0, pulled: 0 };
  if (!(await isSignedIn())) return { state: "unauthenticated", pushed: 0, pulled: 0 };

  try {
    const pushed = await push();
    const pulled = await pull();
    await refreshPlayers().catch(() => undefined); // není kritické
    return { state: "idle", pushed, pulled };
  } catch (err) {
    return {
      state: "error",
      pushed: 0,
      pulled: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
