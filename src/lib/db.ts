/** Lokální úložiště (IndexedDB).
 *
 *  Zápis vždy míří sem – aplikace tak funguje i bez signálu a nikdy nečeká na síť.
 *  Každý záznam nese příznak `dirty`, podle kterého ho synchronizace odešle
 *  na server (viz sync.ts).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Match, MatchEvent, Player, RosterEntry } from "./types";

export type Dirty<T> = T & { dirty: 0 | 1 };

export interface StoredRoster extends RosterEntry {
  matchId: string;
}

interface StatsDB extends DBSchema {
  matches: {
    key: string;
    value: Dirty<Match>;
    indexes: { byDate: string; byDirty: number };
  };
  events: {
    key: string; // clientId
    value: Dirty<MatchEvent>;
    indexes: { byMatch: string; byDirty: number };
  };
  roster: {
    key: [string, string]; // [matchId, playerId]
    value: Dirty<StoredRoster>;
    indexes: { byMatch: string; byDirty: number };
  };
  players: {
    key: string;
    value: Player;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<StatsDB>> | null = null;

export function db(): Promise<IDBPDatabase<StatsDB>> {
  dbPromise ??= openDB<StatsDB>("dynamo-stats", 1, {
    upgrade(database) {
      const matches = database.createObjectStore("matches", { keyPath: "id" });
      matches.createIndex("byDate", "matchDate");
      matches.createIndex("byDirty", "dirty");

      const events = database.createObjectStore("events", { keyPath: "clientId" });
      events.createIndex("byMatch", "matchId");
      events.createIndex("byDirty", "dirty");

      const roster = database.createObjectStore("roster", { keyPath: ["matchId", "playerId"] });
      roster.createIndex("byMatch", "matchId");
      roster.createIndex("byDirty", "dirty");

      database.createObjectStore("players", { keyPath: "id" });
      database.createObjectStore("meta");
    },
  });
  return dbPromise;
}

const stamp = () => new Date().toISOString();

/* ---------------------------------------------------------------- zápasy */

export async function putMatch(match: Match, dirty = true): Promise<Match> {
  const value: Dirty<Match> = { ...match, updatedAt: stamp(), dirty: dirty ? 1 : 0 };
  await (await db()).put("matches", value);
  return value;
}

/** Zápis přicházející ze serveru – nepřepíše lokální změny, které ještě nejsou odeslané. */
export async function mergeServerMatch(match: Match): Promise<void> {
  const database = await db();
  const local = await database.get("matches", match.id);
  if (local?.dirty === 1 && local.updatedAt >= match.updatedAt) return;
  await database.put("matches", { ...match, dirty: 0 });
}

export async function getMatch(id: string): Promise<Match | undefined> {
  return (await db()).get("matches", id);
}

export async function allMatches(): Promise<Match[]> {
  const list = await (await db()).getAll("matches");
  return list.sort((a, b) => b.matchDate.localeCompare(a.matchDate) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteMatch(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["matches", "events", "roster"], "readwrite");
  await tx.objectStore("matches").delete(id);
  for (const key of await tx.objectStore("events").index("byMatch").getAllKeys(id)) {
    await tx.objectStore("events").delete(key);
  }
  for (const key of await tx.objectStore("roster").index("byMatch").getAllKeys(id)) {
    await tx.objectStore("roster").delete(key);
  }
  await tx.done;
}

/* -------------------------------------------------------------- události */

export async function putEvent(event: MatchEvent, dirty = true): Promise<MatchEvent> {
  const value: Dirty<MatchEvent> = { ...event, updatedAt: stamp(), dirty: dirty ? 1 : 0 };
  await (await db()).put("events", value);
  return value;
}

export async function mergeServerEvent(event: MatchEvent): Promise<void> {
  const database = await db();
  const local = await database.get("events", event.clientId);
  if (local?.dirty === 1 && local.updatedAt >= event.updatedAt) return;
  await database.put("events", { ...event, dirty: 0 });
}

export async function eventsOfMatch(matchId: string): Promise<MatchEvent[]> {
  const list = await (await db()).getAllFromIndex("events", "byMatch", matchId);
  return list.sort((a, b) => a.seq - b.seq);
}

/** Měkké smazání – tombstone se musí dostat i na ostatní zařízení. */
export async function softDeleteEvent(clientId: string): Promise<void> {
  const database = await db();
  const existing = await database.get("events", clientId);
  if (!existing) return;
  await database.put("events", { ...existing, deleted: true, updatedAt: stamp(), dirty: 1 });
}

/** Poslední přidělené pořadí v běžící relaci.
 *  Bez toho by dvě rychlá ťuknutí po sobě přečetla stejné maximum dřív, než se
 *  první z nich stihne uložit, a dostala by shodné `seq`. */
const lastIssuedSeq = new Map<string, number>();

export async function nextSeq(matchId: string): Promise<number> {
  const events = await eventsOfMatch(matchId);
  const fromStore = events.reduce((max, e) => Math.max(max, e.seq), 0);
  const seq = Math.max(fromStore, lastIssuedSeq.get(matchId) ?? 0) + 1;
  lastIssuedSeq.set(matchId, seq);
  return seq;
}

/* -------------------------------------------------------------- soupiska */

export async function putRoster(entry: StoredRoster, dirty = true): Promise<void> {
  await (await db()).put("roster", { ...entry, dirty: dirty ? 1 : 0 });
}

export async function rosterOfMatch(matchId: string): Promise<RosterEntry[]> {
  return (await db()).getAllFromIndex("roster", "byMatch", matchId);
}

export async function removeRosterEntry(matchId: string, playerId: string): Promise<void> {
  await (await db()).delete("roster", [matchId, playerId]);
}

/* ---------------------------------------------------------------- hráči */

export async function cachePlayers(players: Player[]): Promise<void> {
  const database = await db();
  const tx = database.transaction("players", "readwrite");
  await Promise.all(players.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function cachedPlayers(): Promise<Player[]> {
  return (await db()).getAll("players");
}

/* ------------------------------------------------------------ pomocné */

export async function pendingCounts(): Promise<{ matches: number; events: number; roster: number }> {
  const database = await db();
  const [matches, events, roster] = await Promise.all([
    database.getAllFromIndex("matches", "byDirty", 1),
    database.getAllFromIndex("events", "byDirty", 1),
    database.getAllFromIndex("roster", "byDirty", 1),
  ]);
  return { matches: matches.length, events: events.length, roster: roster.length };
}

export async function dirtyRecords() {
  const database = await db();
  const [matches, events, roster] = await Promise.all([
    database.getAllFromIndex("matches", "byDirty", 1),
    database.getAllFromIndex("events", "byDirty", 1),
    database.getAllFromIndex("roster", "byDirty", 1),
  ]);
  return { matches, events, roster };
}

export async function markClean(kind: "matches" | "events" | "roster", keys: unknown[]): Promise<void> {
  const database = await db();
  const tx = database.transaction(kind, "readwrite");
  for (const key of keys) {
    const record = await tx.store.get(key as never);
    if (record) await tx.store.put({ ...record, dirty: 0 } as never);
  }
  await tx.done;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}
