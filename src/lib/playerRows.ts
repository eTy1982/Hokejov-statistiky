/** Rozdělení hráčů do řádků podle postu a lajny.
 *
 *  Sdílí ho obrazovka zápasu i mřížky v dialozích, aby zapisovatel hledal
 *  hráče pořád na stejném místě.
 *
 *  Pětky se do řádků nespojují schválně: hlavní trenér točí útoky, asistent
 *  obrany, takže obranná dvojice a útok nepatří k sobě. Proto dva nezávislé
 *  sloupce – obrany (po dvou) a útoky (po třech).
 */
import type { Participant } from "./types";

export interface PlayerRow {
  key: string;
  label: string;
  /** Dlaždic na řádek. Drží se i u neúplné lajny, aby šířka nepodskakovala. */
  perRow: number;
  players: Participant[];
}

export function playerRows(participants: Participant[]): {
  left: PlayerRow[];
  right: PlayerRow[];
} {
  const goalies = participants.filter((p) => p.position === "B");
  const left: PlayerRow[] = [];
  const right: PlayerRow[] = [];

  if (goalies.length) {
    left.push({ key: "B", label: "B", perRow: Math.max(2, goalies.length), players: goalies });
  }

  const linesOf = (position: "O" | "Ú") =>
    [...new Set(participants.filter((p) => p.position === position).map((p) => p.line))]
      .filter((line) => line > 0)
      .sort((a, b) => a - b);

  for (const line of linesOf("O")) {
    left.push({
      key: `O${line}`,
      label: `O${line}`,
      perRow: 2,
      players: participants.filter((p) => p.position === "O" && p.line === line),
    });
  }
  for (const line of linesOf("Ú")) {
    right.push({
      key: `U${line}`,
      label: `Ú${line}`,
      perRow: 3,
      players: participants.filter((p) => p.position === "Ú" && p.line === line),
    });
  }

  // Kdo pětku nemá, patří na konec svého sloupce – vypadnout nesmí.
  const spareD = participants.filter((p) => p.position === "O" && p.line === 0);
  if (spareD.length) left.push({ key: "O0", label: "–", perRow: 2, players: spareD });

  const spareF = participants.filter((p) => p.position === "Ú" && p.line === 0);
  if (spareF.length) right.push({ key: "U0", label: "–", perRow: 3, players: spareF });

  return { left, right };
}

/** Lajny, které jsou v sestavě – pro tlačítka „označ celou formaci“. */
export function availableLines(
  participants: Participant[],
  position: "O" | "Ú",
): number[] {
  return [
    ...new Set(
      participants.filter((p) => p.position === position && p.line > 0).map((p) => p.line),
    ),
  ].sort((a, b) => a - b);
}
