import type { Player, Position, RosterEntry } from "./types";

/** "#12 Novák" – číslo a jméno jsou v databázi samostatné sloupce,
 *  nemusí se tedy parsovat z jednoho řetězce jako v předchozí verzi. */
export function playerLabel(p: Player | undefined): string {
  if (!p) return "—";
  return p.jerseyNumber === null ? p.fullName : `#${p.jerseyNumber} ${p.fullName}`;
}

export function playerNumber(p: Player | undefined): string {
  if (!p) return "?";
  return p.jerseyNumber === null ? p.fullName.slice(0, 3) : String(p.jerseyNumber);
}

export function surname(p: Player | undefined): string {
  if (!p) return "—";
  const parts = p.fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : p.fullName;
}

/** Barva dlaždice podle pětky. Brankáři mají vlastní tmavou. */
export function lineColor(line: number, isGoalie: boolean): string {
  if (isGoalie) return "bg-slate-950 border-slate-700";
  switch (line) {
    case 1:
      return "bg-ice-600 border-ice-400";
    case 2:
      return "bg-emerald-700 border-emerald-500";
    case 3:
      return "bg-violet-700 border-violet-500";
    case 4:
      return "bg-amber-600 border-amber-400";
    case 5:
      return "bg-pink-700 border-pink-500";
    default:
      return "bg-slate-700 border-slate-500";
  }
}

/** Normalizuje vstup času na "mm:ss"; vrací null, když je vstup prázdný. */
export function normalizeClock(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const padded = digits.slice(-4).padStart(4, "0");
  const mm = padded.slice(0, 2);
  const ss = Math.min(59, Number(padded.slice(2))).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${Number(d)}. ${Number(m)}. ${y}` : iso;
}

/** Seřazení hráčů: brankáři, obránci, útočníci; pak pětka; pak číslo. */
export function sortRoster(
  entries: RosterEntry[],
  players: Map<string, Player>,
): RosterEntry[] {
  const rank: Record<Position, number> = { B: 0, O: 1, "Ú": 2 };
  return [...entries].sort((a, b) => {
    const ra = rank[a.position] ?? 9;
    const rb = rank[b.position] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.line !== b.line) return (a.line || 99) - (b.line || 99);
    const na = players.get(a.playerId)?.jerseyNumber ?? 999;
    const nb = players.get(b.playerId)?.jerseyNumber ?? 999;
    return na - nb;
  });
}

export const PERIOD_LABEL: Record<string, string> = {
  "1": "1. třetina",
  "2": "2. třetina",
  "3": "3. třetina",
  P: "Prodloužení",
  SO: "Nájezdy",
};

export const PERIOD_SHORT: Record<string, string> = {
  "1": "1. tř.",
  "2": "2. tř.",
  "3": "3. tř.",
  P: "Prodl.",
  SO: "SN",
};
