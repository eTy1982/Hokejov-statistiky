import { useState } from "react";
import { Modal } from "./Modal";
import { putGuest, putRoster, removeRosterEntry } from "../lib/db";
import type { GuestPlayer, Player, RosterEntry } from "../lib/types";

interface Props {
  matchId: string;
  roster: RosterEntry[];
  players: Player[];
  guests: GuestPlayer[];
  /** Hráči se záznamem v zápase – ty nelze vyřadit, přišli bychom o jejich čísla. */
  lockedPlayerIds: Set<string>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

/** Sestava konkrétního zápasu.
 *
 *  Číslo dresu se drží tady, ne u hráče: při marodce si výpomoc z juniorky bere
 *  dres zraněného a i kmenoví hráči se občas přečíslují. Historie tak zůstane
 *  věrná tomu, kdo v daném zápase v jakém čísle skutečně hrál. */
export function LineupDialog({
  matchId,
  roster,
  players,
  guests,
  lockedPlayerIds,
  onClose,
  onChanged,
}: Props) {
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"kmenovi" | "hoste">("kmenovi");
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestNote, setNewGuestNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const byPlayer = new Map(roster.filter((r) => r.playerId).map((r) => [r.playerId!, r]));
  const byGuest = new Map(roster.filter((r) => r.guestId).map((r) => [r.guestId!, r]));
  const takenNumbers = new Map(
    roster.filter((r) => r.jerseyNumber !== null).map((r) => [r.jerseyNumber!, r.id]),
  );

  const matchesSearch = (name: string, num: number | null) => {
    const q = search.trim().toLowerCase();
    return !q || `${name} ${num ?? ""}`.toLowerCase().includes(q);
  };

  const save = async (fn: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } finally {
      setWorking(false);
    }
  };

  /** Nejnižší volné číslo – použije se, když je to obvyklé už obsazené. */
  const firstFreeNumber = (preferred: number | null): number | null => {
    if (preferred !== null && !takenNumbers.has(preferred)) return preferred;
    for (let n = 1; n <= 99; n += 1) if (!takenNumbers.has(n)) return n;
    return null;
  };

  const addPlayer = (p: Player) =>
    save(async () => {
      await putRoster({
        id: crypto.randomUUID(),
        matchId,
        playerId: p.id,
        guestId: null,
        jerseyNumber: firstFreeNumber(p.jerseyNumber),
        line: 0,
        position: p.position ?? "Ú",
      });
    });

  const addGuest = (g: GuestPlayer) =>
    save(async () => {
      await putRoster({
        id: crypto.randomUUID(),
        matchId,
        playerId: null,
        guestId: g.id,
        jerseyNumber: firstFreeNumber(null),
        line: 0,
        position: "Ú",
      });
    });

  const patchEntry = (entry: RosterEntry, patch: Partial<RosterEntry>) =>
    save(async () => {
      if (patch.jerseyNumber !== undefined && patch.jerseyNumber !== null) {
        const owner = takenNumbers.get(patch.jerseyNumber);
        if (owner && owner !== entry.id) {
          setError(`Číslo ${patch.jerseyNumber} už v tomto zápase někdo nosí.`);
          return;
        }
      }
      await putRoster({ ...entry, ...patch });
    });

  const removeEntry = (entry: RosterEntry) => save(() => removeRosterEntry(entry.id));

  const createGuest = () =>
    save(async () => {
      const name = newGuestName.trim();
      if (!name) {
        setError("Vyplňte jméno hostujícího hráče.");
        return;
      }
      const guest: GuestPlayer = {
        id: crypto.randomUUID(),
        fullName: name,
        note: newGuestNote.trim() || null,
        isActive: true,
        updatedAt: new Date().toISOString(),
      };
      await putGuest(guest);
      await putRoster({
        id: crypto.randomUUID(),
        matchId,
        playerId: null,
        guestId: guest.id,
        jerseyNumber: firstFreeNumber(null),
        line: 0,
        position: "Ú",
      });
      setNewGuestName("");
      setNewGuestNote("");
    });

  const entryControls = (entry: RosterEntry, locked: boolean) => (
    <>
      <label className="flex items-center gap-1 text-xs text-slate-400">
        č.
        <input
          type="number"
          min={0}
          max={99}
          className="field !w-16 !py-1 text-center"
          value={entry.jerseyNumber ?? ""}
          disabled={working}
          onChange={(e) =>
            void patchEntry(entry, {
              jerseyNumber: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>
      <select
        className="field !w-auto !py-1"
        value={entry.position}
        disabled={working}
        onChange={(e) =>
          void patchEntry(entry, { position: e.target.value as RosterEntry["position"] })
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
        onChange={(e) => void patchEntry(entry, { line: Number(e.target.value) })}
      >
        <option value={0}>bez pětky</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}. pětka
          </option>
        ))}
      </select>
      <button
        className="btn-ghost !px-2 !py-1"
        disabled={working || locked}
        title={
          locked
            ? "Hráč už má v zápase záznam – nejdřív smažte jeho události."
            : "Vyřadit ze sestavy"
        }
        onClick={() => void removeEntry(entry)}
      >
        ✕
      </button>
    </>
  );

  return (
    <Modal
      wide
      title="Sestava zápasu"
      subtitle={`Nastoupilo ${roster.length} hráčů. Číslo dresu i pětka platí jen pro tento zápas.`}
      onClose={onClose}
      footer={
        <button className="btn-primary" onClick={onClose}>
          Hotovo
        </button>
      }
    >
      <div className="mb-3 flex gap-2">
        {(["kmenovi", "hoste"] as const).map((key) => (
          <button
            key={key}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              tab === key ? "bg-ice-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
            onClick={() => setTab(key)}
          >
            {key === "kmenovi" ? "Kmenoví hráči" : `Výpomoc (${byGuest.size})`}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {tab === "kmenovi" && (
        <>
          <input
            className="field mb-3"
            placeholder="Hledat hráče…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-1">
            {players
              .filter((p) => matchesSearch(p.fullName, p.jerseyNumber))
              .map((p) => {
                const entry = byPlayer.get(p.id);
                return (
                  <div
                    key={p.id}
                    className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
                      entry ? "bg-white/5" : "opacity-60"
                    }`}
                  >
                    <span className="flex-1 font-medium">
                      {p.fullName}
                      {p.jerseyNumber !== null && (
                        <span className="ml-2 text-xs text-slate-500">
                          obvykle #{p.jerseyNumber}
                        </span>
                      )}
                    </span>
                    {entry ? (
                      entryControls(entry, lockedPlayerIds.has(p.id))
                    ) : (
                      <button className="btn-ghost" disabled={working} onClick={() => void addPlayer(p)}>
                        Přidat
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}

      {tab === "hoste" && (
        <>
          <div className="card mb-4 p-3">
            <p className="mb-2 text-sm text-slate-400">
              Výpomoc z juniorky. Tihle hráči jsou vedení jen ve statistikách – do
              skladové aplikace se nedostanou a vybavení se jim nevydává.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <input
                className="field"
                placeholder="Jméno a příjmení"
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
              />
              <input
                className="field"
                placeholder="Poznámka (U19)"
                value={newGuestNote}
                onChange={(e) => setNewGuestNote(e.target.value)}
              />
              <button className="btn-primary" disabled={working} onClick={() => void createGuest()}>
                ➕ Přidat do zápasu
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {guests
              .filter((g) => matchesSearch(g.fullName, null))
              .map((g) => {
                const entry = byGuest.get(g.id);
                return (
                  <div
                    key={g.id}
                    className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
                      entry ? "bg-white/5" : "opacity-60"
                    }`}
                  >
                    <span className="flex-1 font-medium">
                      {g.fullName}
                      {g.note && <span className="ml-2 text-xs text-slate-500">{g.note}</span>}
                    </span>
                    {entry ? (
                      entryControls(entry, lockedPlayerIds.has(g.id))
                    ) : (
                      <button className="btn-ghost" disabled={working} onClick={() => void addGuest(g)}>
                        Přidat
                      </button>
                    )}
                  </div>
                );
              })}
            {guests.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                Zatím tu není žádný hostující hráč. Přidejte ho formulářem výše.
              </p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
