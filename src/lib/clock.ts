/** Čas v zápase – přepočet mezi tabulí v hale a odehraným časem.
 *
 *  Tabule v halách odpočítává (20:00 → 00:00). Do `clock` se ale ukládá
 *  **odehraný** čas, protože na něm stojí všechny statistiky a dá se sečítat
 *  přes třetiny. Libor opíše tabuli, přepočet dělá tohle.
 *
 *  Celý modul jsou čisté funkce – žádná časomíra, nic se nespouští.
 */
import type { Period, RegularPeriod } from "./types";

/** Délka třetiny v sekundách. Prodloužení má v Maxa lize 5 minut.
 *  Nájezdy čas neměří, proto 0. */
export function periodLength(period: Period): number {
  switch (period) {
    case "1":
    case "2":
    case "3":
      return 1200;
    case "P":
      return 300;
    case "SO":
      return 0;
  }
}

/** Z číslic zadaných jako na kalkulačce udělá `mm:ss`: `438` → `04:38`.
 *  Prázdný vstup → null. */
export function boardDisplay(boardDigits: string): string | null {
  const digits = boardDigits.replace(/\D/g, "");
  if (!digits) return null;
  const padded = digits.slice(-4).padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

/** Čas na tabuli v sekundách, nebo null když to čas být nemůže. */
function boardSeconds(boardDigits: string, period: Period): number | null {
  const digits = boardDigits.replace(/\D/g, "");
  if (!digits) return null;
  const padded = digits.slice(-4).padStart(4, "0");
  const mm = Number(padded.slice(0, 2));
  const ss = Number(padded.slice(2));
  if (ss >= 60) return null; // „04:71“ na tabuli nesvítí
  const total = mm * 60 + ss;
  return total > periodLength(period) ? null : total;
}

/** Odehrané sekundy z času na tabuli. Null = neplatný vstup.
 *
 *  `countsDown` je výchozí chování tabulí; některé haly přičítají. */
export function boardToElapsed(
  boardDigits: string,
  period: Period,
  countsDown: boolean,
): number | null {
  const board = boardSeconds(boardDigits, period);
  if (board === null) return null;
  return countsDown ? periodLength(period) - board : board;
}

/** Zpátky na tabuli – pro zobrazení konce trestu („konec na tabuli 10:30“).
 *  Volající má dát čas uvnitř třetiny; mimo rozsah se výsledek přitlačí
 *  k jejímu okraji, protože na tabuli jiný čas svítit nemůže. */
export function elapsedToBoard(sec: number, period: Period, countsDown: boolean): string {
  const length = periodLength(period);
  const clamped = Math.max(0, Math.min(length, Math.round(sec)));
  return formatSeconds(countsDown ? length - clamped : clamped);
}

/** `mm:ss` z odehraných sekund. */
export function formatSeconds(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Odehrané sekundy z uloženého `clock` (`mm:ss`). Null u záznamů bez času. */
export function clockToSeconds(clock: string | null): number | null {
  if (!clock) return null;
  const match = /^(\d{1,3}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const ss = Number(match[2]);
  if (ss >= 60) return null;
  return Number(match[1]) * 60 + ss;
}

/** Čas od začátku zápasu v sekundách – aby šly tresty počítat přes konec třetiny.
 *  Nájezdy se řadí až za prodloužení, v početním stavu nevystupují. */
export function absoluteTime(period: Period, sec: number): number {
  switch (period) {
    case "1":
      return sec;
    case "2":
      return 1200 + sec;
    case "3":
      return 2400 + sec;
    case "P":
      return 3600 + sec;
    case "SO":
      return 3900 + sec;
  }
}

/** Opak `absoluteTime` – do které třetiny a jejího času čas spadá.
 *  Používá se u konce trestu, který přechází do další třetiny. */
export function fromAbsolute(abs: number): { period: RegularPeriod; sec: number } {
  if (abs < 1200) return { period: "1", sec: abs };
  if (abs < 2400) return { period: "2", sec: abs - 1200 };
  if (abs < 3600) return { period: "3", sec: abs - 2400 };
  return { period: "P", sec: abs - 3600 };
}
