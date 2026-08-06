/** Exporty do XLSX a CSV. */
import * as XLSX from "xlsx";
import { computeStats, savePercentage, scoreboard, sumCounts, sumTimes } from "./stats";
import { PERIODS, type Match, type MatchEvent, type Participant } from "./types";
import { PERIOD_SHORT, playerLabel } from "./format";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Odvolání se odkládá – Safari na iPadu stahování zruší, když URL zmizí hned.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const safeName = (value: string) => value.replace(/[^\p{L}\p{N}._-]+/gu, "_");

/* -------------------------------------------------------- statistiky zápasu */

export function exportMatchStatsXlsx(
  match: Match,
  events: MatchEvent[],
  participants: Participant[],
): void {
  const { byPlayer, totals } = computeStats(events, match.shootoutWinner);
  const score = scoreboard(totals, match.homeAway);

  const header = [
    ["Zápas", `${match.homeAway === "home" ? "Dynamo" : match.opponent ?? "Soupeř"} vs ${match.homeAway === "home" ? match.opponent ?? "Soupeř" : "Dynamo"}`],
    ["Datum", match.matchDate],
    ["Místo", match.venue ?? ""],
    ["Soutěž", match.competition ?? ""],
    ["Skóre", `${score.home}:${score.away}`],
    ["Střely", `${totals.totalShotsFor}:${totals.totalShotsAgainst}`],
    ["Nájezdy", totals.soRounds ? `${totals.soFor}:${totals.soAgainst} (${totals.soRounds} kol)` : ""],
    [],
  ];

  const rows = participants.map((entry) => {
    const s = byPlayer[entry.id];
    const goals = s ? sumTimes(s.goals) : 0;
    const assists = s ? sumCounts(s.assists) : 0;
    const isGoalie = entry.position === "B";
    const sv = s && isGoalie ? savePercentage(s) : null;

    const record: Record<string, string | number> = {
      Číslo: entry.jerseyNumber ?? "",
      Jméno: entry.fullName,
      Pozice: entry.position,
      Pětka: entry.line || "",
      Hostující: entry.isGuest ? "ano" : "",
    };
    for (const p of PERIODS) {
      record[`Střely ${PERIOD_SHORT[p]}`] = s?.shots[p] ?? 0;
    }
    record["Střely celkem"] = s ? sumCounts(s.shots) : 0;
    record["Góly"] = goals;
    record["Asistence"] = assists;
    record["Body"] = goals + assists;
    record["Plus"] = s ? sumCounts(s.plus) : 0;
    record["Minus"] = s ? sumCounts(s.minus) : 0;
    record["Tresty"] = s ? sumTimes(s.penalties) : 0;
    record["Zákroky"] = s ? sumCounts(s.saves) : 0;
    record["Obdržené"] = s ? sumTimes(s.goalsAgainst) : 0;
    record["SV%"] = sv === null ? "" : Number(sv.toFixed(1));
    record["Nájezdy G/pokusy"] = s && s.soAttempts ? `${s.soGoals}/${s.soAttempts}` : "";
    return record;
  });

  const sheet = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(sheet, rows, { origin: -1 });
  sheet["!cols"] = [{ wch: 8 }, { wch: 22 }, ...Array.from({ length: 18 }, () => ({ wch: 11 }))];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Statistiky");
  XLSX.writeFile(book, `statistiky_${safeName(match.matchDate)}.xlsx`);
}

/* ------------------------------------------------------------- přehled zápasů */

export function exportMatchesXlsx(
  matches: Match[],
  eventsByMatch: Map<string, MatchEvent[]>,
): void {
  const rows = matches.map((m) => {
    const { totals } = computeStats(eventsByMatch.get(m.id) ?? [], m.shootoutWinner);
    const score = scoreboard(totals, m.homeAway);
    return {
      Datum: m.matchDate,
      Začátek: m.startTime ?? "",
      Domácí: m.homeAway === "home" ? "Dynamo" : (m.opponent ?? ""),
      Hosté: m.homeAway === "home" ? (m.opponent ?? "") : "Dynamo",
      Skóre: `${score.home}:${score.away}`,
      "Góly pro": totals.totalGoalsFor,
      "Góly proti": totals.totalGoalsAgainst,
      "Střely pro": totals.totalShotsFor,
      "Střely proti": totals.totalShotsAgainst,
      Nájezdy: totals.soRounds ? `${totals.soFor}:${totals.soAgainst}` : "",
      Místo: m.venue ?? "",
      Soutěž: m.competition ?? "",
      Štítky: m.tags.join(", "),
      Stav: m.status === "finished" ? "ukončen" : "rozehraný",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 8 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Zápasy");
  XLSX.writeFile(book, "prehled_zapasu.xlsx");
}

/* ---------------------------------------------------------------------- CSV */

const CSV_SEPARATOR = ";"; // český Excel očekává středník

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown) => {
    const text = value === undefined || value === null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(CSV_SEPARATOR)];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(CSV_SEPARATOR));
  }
  return lines.join("\r\n");
}

export function exportEventsCsv(
  match: Match,
  events: MatchEvent[],
  participants: Map<string, Participant>,
): void {
  const label = (id: string | null) => (id ? playerLabel(participants.get(id)) : "");
  const number = (id: string | null) => (id ? (participants.get(id)?.jerseyNumber ?? "") : "");

  const rows = events
    .filter((e) => !e.deleted)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      Poradi: e.seq,
      Tretina: e.period,
      Cas: e.clock ?? "",
      Udalost: e.type,
      Cislo: number(e.playerId ?? e.goalieId),
      Hrac: label(e.playerId),
      Brankar: label(e.goalieId),
      Asistence: e.assists.map(label).join(" / "),
      Plus: e.onIcePlus.map((id) => number(id)).join(" "),
      Minus: e.onIceMinus.map((id) => number(id)).join(" "),
      TrestMin: e.penaltyMin ?? "",
      NajezdVysledek: e.soResult ?? "",
      NajezdKolo: e.soRound ?? "",
    }));

  const headers = [
    "Poradi", "Tretina", "Cas", "Udalost", "Cislo", "Hrac", "Brankar",
    "Asistence", "Plus", "Minus", "TrestMin", "NajezdVysledek", "NajezdKolo",
  ];

  // BOM je nutné, jinak Excel v češtině rozsype diakritiku.
  const csv = "﻿" + toCsv(headers, rows);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `udalosti_${safeName(match.matchDate)}.csv`,
  );
}
