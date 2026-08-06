import type { Participant, Player, Position } from "./types";

/** Cokoli, co má jméno a číslo – kmenový hráč i účastník zápasu. */
type Named = { fullName: string; jerseyNumber: number | null };

/** "#12 Novák" – číslo a jméno jsou samostatné sloupce, nemusí se parsovat
 *  z jednoho řetězce jako v předchozí verzi. */
export function playerLabel(p: Named | undefined): string {
  if (!p) return "—";
  return p.jerseyNumber === null ? p.fullName : `#${p.jerseyNumber} ${p.fullName}`;
}

export function playerNumber(p: Named | undefined): string {
  if (!p) return "?";
  return p.jerseyNumber === null ? p.fullName.slice(0, 3) : String(p.jerseyNumber);
}

export function surname(p: Named | undefined): string {
  if (!p) return "—";
  const parts = p.fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : p.fullName;
}

/** Sloučí kmenové a hostující hráče do jednotného pohledu na zápas.
 *  Číslo dresu se bere ze sestavy zápasu; u kmenového hráče padá zpět na jeho
 *  vlastní číslo, když v sestavě vyplněné není. */
export function buildParticipants(
  roster: { id: string; playerId: string | null; guestId: string | null; jerseyNumber: number | null; line: number; position: Position }[],
  players: Map<string, Player>,
  guests: Map<string, { fullName: string }>,
): Participant[] {
  const list: Participant[] = [];
  for (const entry of roster) {
    const id = entry.playerId ?? entry.guestId;
    if (!id) continue;
    const player = entry.playerId ? players.get(entry.playerId) : undefined;
    const guest = entry.guestId ? guests.get(entry.guestId) : undefined;
    const fullName = player?.fullName ?? guest?.fullName;
    if (!fullName) continue; // hráč se ještě nestáhl ze serveru
    list.push({
      rosterId: entry.id,
      id,
      fullName,
      jerseyNumber: entry.jerseyNumber ?? player?.jerseyNumber ?? null,
      position: entry.position,
      line: entry.line,
      isGuest: Boolean(entry.guestId),
    });
  }
  return sortParticipants(list);
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

/** Seřazení: brankáři, obránci, útočníci; pak pětka; pak číslo dresu. */
export function sortParticipants(list: Participant[]): Participant[] {
  const rank: Record<Position, number> = { B: 0, O: 1, "Ú": 2 };
  return [...list].sort((a, b) => {
    const ra = rank[a.position] ?? 9;
    const rb = rank[b.position] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.line !== b.line) return (a.line || 99) - (b.line || 99);
    return (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
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
