import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Player, Position } from "../lib/types";
import { POSITIONS } from "../lib/types";
import { playerLabel } from "../lib/format";

interface Props {
  players: Player[];
  onBack: () => void;
  onPlayersChanged: () => void;
}

/** Soupiska je sdílená se skladovou aplikací (tabulka public.players),
 *  proto se upravuje přímo na serveru a vyžaduje připojení. */
export function RosterScreen({ players, onBack, onPlayersChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState<Position>("Ú");

  const online = navigator.onLine;

  const run = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await action();
    if (actionError) setError(actionError.message);
    else onPlayersChanged();
    setBusy(false);
  };

  const addPlayer = async () => {
    if (!name.trim()) {
      setError("Vyplňte jméno hráče.");
      return;
    }
    await run(async () =>
      supabase.from("players").insert({
        full_name: name.trim(),
        jersey_number: number.trim() ? Number(number) : null,
        position,
        person_type: "hrac",
        is_active: true,
      }),
    );
    setName("");
    setNumber("");
  };

  const patch = (id: string, values: Record<string, unknown>) =>
    run(async () => supabase.from("players").update(values).eq("id", id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={onBack}>
          ← Zpět
        </button>
        <h1 className="text-2xl font-bold">Soupiska</h1>
      </div>

      <p className="card p-4 text-sm text-slate-400">
        Soupiska je společná se skladovou aplikací – hráče stačí založit jednou.
        Do jednotlivých zápasů se sestava vybírá tlačítkem <strong>Sestava</strong>.
      </p>

      {!online && (
        <p className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-300">
          Bez připojení nelze soupisku upravovat. Zápis statistik funguje offline dál.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>
      )}

      <div className="card p-4">
        <h2 className="mb-3 font-bold">Přidat hráče</h2>
        <div className="grid gap-3 sm:grid-cols-[6rem_1fr_8rem_auto]">
          <div>
            <label className="label">Číslo</label>
            <input
              className="field"
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
              placeholder="12"
            />
          </div>
          <div>
            <label className="label">Jméno a příjmení</label>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jan Novák"
            />
          </div>
          <div>
            <label className="label">Pozice</label>
            <select
              className="field"
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
            >
              <option value="B">Brankář</option>
              <option value="O">Obránce</option>
              <option value="Ú">Útočník</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={busy || !online} onClick={() => void addPlayer()}>
              ➕ Přidat
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-white/10 px-4 py-3 font-bold">
          Hráči <span className="text-sm font-normal text-slate-500">({players.length})</span>
        </h2>
        <ul className="divide-y divide-white/5">
          {players.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-2 px-4 py-3 ${p.isActive ? "" : "opacity-50"}`}>
              <span className="flex-1 font-medium">{playerLabel(p)}</span>

              <select
                className="field !w-auto !py-1"
                value={p.position ?? "Ú"}
                disabled={busy || !online}
                onChange={(e) => void patch(p.id, { position: e.target.value })}
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos === "B" ? "Brankář" : pos === "O" ? "Obránce" : "Útočník"}
                  </option>
                ))}
              </select>

              <button
                className="btn-ghost"
                disabled={busy || !online}
                onClick={() => void patch(p.id, { is_active: !p.isActive })}
              >
                {p.isActive ? "Deaktivovat" : "Obnovit"}
              </button>
            </li>
          ))}
          {players.length === 0 && (
            <li className="px-4 py-8 text-center text-slate-500">
              Zatím tu není žádný hráč.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
