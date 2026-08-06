import { useCallback, useEffect, useMemo, useState } from "react";
import { allMatches, db, deleteMatch, putMatch, putRoster } from "../lib/db";
import { computeStats, scoreboard } from "../lib/stats";
import type { Match, MatchEvent, Player } from "../lib/types";
import { formatDate } from "../lib/format";
import { Modal } from "../components/Modal";

interface Props {
  players: Player[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function MatchList({ players, onOpen, onChanged }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setMatches(await allMatches());
    setEvents(await (await db()).getAll("events"));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const eventsByMatch = useMemo(() => {
    const map = new Map<string, MatchEvent[]>();
    for (const e of events) {
      const list = map.get(e.matchId);
      if (list) list.push(e);
      else map.set(e.matchId, [e]);
    }
    return map;
  }, [events]);

  /** Filtruje podle data zápasu (ne podle času uložení, jak to dělala stará verze). */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (from && m.matchDate < from) return false;
      if (to && m.matchDate > to) return false;
      if (!q) return true;
      const haystack = [m.opponent, m.venue, m.competition, ...m.tags].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [matches, from, to, query]);

  const createMatch = async (draft: Partial<Match>) => {
    const id = crypto.randomUUID();
    const match: Match = {
      id,
      clientId: id,
      seasonId: null,
      matchDate: draft.matchDate ?? today(),
      startTime: draft.startTime ?? null,
      venue: draft.venue ?? null,
      opponent: draft.opponent ?? null,
      homeAway: draft.homeAway ?? "home",
      competition: draft.competition ?? null,
      tags: draft.tags ?? [],
      status: "live",
      shootoutWinner: null,
      note: null,
      updatedAt: new Date().toISOString(),
    };
    await putMatch(match);

    // Do soupisky zápasu se předvyplní všichni aktivní hráči; pětky se doplní
    // Sestava se přebírá z posledního zápasu včetně toho, KDO nastoupil – ne
    // všichni ze soupisky. Kádr bývá 30 lidí, ale hraje jich patnáct a sestava
    // se mezi zápasy mění málo, takže je rychlejší pár jmen doplnit než patnáct
    // odklikávat. Bez předchozího zápasu se nabídnou všichni aktivní.
    const previous = matches[0];
    const previousRoster = previous
      ? await (await db()).getAllFromIndex("roster", "byMatch", previous.id)
      : [];
    const activeById = new Map(players.filter((p) => p.isActive).map((p) => [p.id, p]));

    // Hostující hráči se do dalšího zápasu nepřebírají – výpomoc je jednorázová
    // a stálou součástí kádru se z ní stát nemá.
    const seed = previousRoster.length
      ? previousRoster
          .filter((r) => r.playerId !== null && activeById.has(r.playerId))
          .map((r) => ({
            playerId: r.playerId,
            guestId: null,
            jerseyNumber: r.jerseyNumber,
            line: r.line,
            position: r.position,
          }))
      : [...activeById.values()].map((p) => ({
          playerId: p.id,
          guestId: null,
          jerseyNumber: p.jerseyNumber,
          line: 0,
          position: p.position ?? ("Ú" as const),
        }));

    for (const entry of seed) {
      await putRoster({ id: crypto.randomUUID(), matchId: id, ...entry });
    }

    onChanged();
    setCreating(false);
    onOpen(id);
  };

  const removeMatch = async (m: Match) => {
    if (!confirm(`Opravdu smazat zápas ${formatDate(m.matchDate)}? Smaže se i ze všech zařízení.`))
      return;
    await deleteMatch(m.id);
    onChanged();
    void reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Zápasy</h1>
        <button className="btn-primary ml-auto" onClick={() => setCreating(true)}>
          ➕ Nový zápas
        </button>
        <button
          className="btn-ghost"
          disabled={!filtered.length}
          onClick={() =>
            void import("../lib/exports").then((m) => m.exportMatchesXlsx(filtered, eventsByMatch))
          }
        >
          📤 Export přehledu
        </button>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-[auto_auto_1fr]">
        <div>
          <label className="label" htmlFor="from">
            Od
          </label>
          <input
            id="from"
            type="date"
            className="field"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="to">
            Do
          </label>
          <input
            id="to"
            type="date"
            className="field"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="q">
            Hledat
          </label>
          <input
            id="q"
            className="field"
            placeholder="soupeř, místo, soutěž, štítek"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {matches.length === 0
            ? "Zatím tu není žádný zápas. Založte první tlačítkem „Nový zápas“."
            : "Filtru neodpovídá žádný zápas."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => {
            const matchEvents = eventsByMatch.get(m.id) ?? [];
            const { totals } = computeStats(matchEvents, m.shootoutWinner);
            const score = scoreboard(totals, m.homeAway);
            const weWon = totals.totalGoalsFor > totals.totalGoalsAgainst;
            const draw = totals.totalGoalsFor === totals.totalGoalsAgainst;
            return (
              <li key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
                <button className="flex flex-1 items-center gap-4 text-left" onClick={() => onOpen(m.id)}>
                  <div
                    className={`min-w-20 rounded-xl px-3 py-2 text-center text-xl font-bold tabular-nums ${
                      draw
                        ? "bg-slate-500/20 text-slate-200"
                        : weWon
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {score.home}:{score.away}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {m.homeAway === "home" ? "Dynamo" : m.opponent || "Soupeř"}
                      <span className="mx-2 text-slate-500">vs</span>
                      {m.homeAway === "home" ? m.opponent || "Soupeř" : "Dynamo"}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-400">
                      {formatDate(m.matchDate)}
                      {m.startTime && ` • ${m.startTime.slice(0, 5)}`}
                      {m.venue && ` • ${m.venue}`}
                      {m.competition && ` • ${m.competition}`}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {m.status === "finished" && (
                    <span className="chip bg-white/5 text-slate-300">Ukončen</span>
                  )}
                  {m.status === "live" && (
                    <span className="chip bg-ice-500/15 text-ice-300">Rozehraný</span>
                  )}
                  <button
                    className="btn-ghost !px-3"
                    title="Smazat zápas"
                    onClick={() => void removeMatch(m)}
                  >
                    🗑️
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating && <NewMatchDialog onClose={() => setCreating(false)} onCreate={createMatch} />}
    </div>
  );
}

function NewMatchDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (draft: Partial<Match>) => Promise<void>;
}) {
  const [matchDate, setMatchDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [opponent, setOpponent] = useState("");
  const [venue, setVenue] = useState("");
  const [competition, setCompetition] = useState("");
  const [tags, setTags] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onCreate({
      matchDate,
      startTime: startTime || null,
      opponent: opponent.trim() || null,
      venue: venue.trim() || null,
      competition: competition.trim() || null,
      homeAway,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <Modal
      title="Nový zápas"
      subtitle="Soupiska se předvyplní podle posledního zápasu."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn-primary" onClick={() => void submit()} disabled={busy}>
            Založit a začít zápis
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Datum</label>
          <input
            type="date"
            className="field"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Začátek</label>
          <input
            type="time"
            className="field"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Soupeř</label>
          <input
            className="field"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="např. HC Sparta"
          />
        </div>
        <div>
          <label className="label">Místo</label>
          <input className="field" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <div>
          <label className="label">Soutěž</label>
          <input
            className="field"
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Štítky (oddělené čárkou)</label>
          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Hrajeme</label>
          <div className="flex gap-2">
            {(["home", "away"] as const).map((side) => (
              <button
                key={side}
                className={`flex-1 rounded-xl px-4 py-3 font-semibold transition ${
                  homeAway === side ? "bg-ice-500 text-white" : "bg-white/5 text-slate-300"
                }`}
                onClick={() => setHomeAway(side)}
              >
                {side === "home" ? "Doma" : "Venku"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
