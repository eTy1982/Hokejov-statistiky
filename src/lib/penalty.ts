/** Skladba trestu – jeden zdroj pravdy pro kód, trestné minuty a početní stav.
 *
 *  Kód trestu je řetězec jako `2`, `2+2`, `5`, `10`, `OK`, `2+10`, `5+OK`,
 *  `2+2+OK`. Databáze ho hlídá CHECKem
 *  `^((2|2\+2|5)(\+(10|OK))?|10|OK)$` (migrace ze 7. 10. 2026).
 *
 *  Dvě části se nepletou:
 *  - **hlavní trest** (`2`, `2+2`, `5`) mění počet hráčů na ledě,
 *  - **osobní trest** (`10`, `OK`) počet hráčů nemění, jen přičte minuty.
 */

/** Hlavní trest – mění počet hráčů na ledě. */
export const PENALTY_MAIN = ["2", "2+2", "5"] as const;
export type PenaltyMain = (typeof PENALTY_MAIN)[number];

/** Osobní trest – počet hráčů nemění. `OK` = do konce zápasu. */
export const PENALTY_PERSONAL = ["10", "OK"] as const;
export type PenaltyPersonal = (typeof PENALTY_PERSONAL)[number];

/** Trestné minuty jednoho dílu. `OK` = 20 je statistická konvence
 *  (viz poznámka v zadání – u podpisu zápisu je to první místo k ověření). */
const MINUTES_PER_PART: Record<string, number> = { "2": 2, "5": 5, "10": 10, OK: 20 };

/** Sekundy, po které díl hlavního trestu drží hráče mimo led. */
const SECONDS_PER_PART: Record<string, number> = { "2": 120, "5": 300 };

/** Složí kód z obou přepínačů dialogu. Null = nevybráno ani jedno,
 *  takový trest nemá co zapisovat. */
export function composeCode(
  main: PenaltyMain | null,
  personal: PenaltyPersonal | null,
): string | null {
  if (!main && !personal) return null;
  if (!main) return personal;
  return personal ? `${main}+${personal}` : main;
}

/** Rozpadne kód na díly. Neznámý kód dá prázdné pole. */
function parts(code: string): string[] {
  const list = code.split("+");
  return list.every((part) => part in MINUTES_PER_PART) ? list : [];
}

/** Trestné minuty celkem (PIM) – prostý součet dílů.
 *  `2+2+OK` = 2+2+20 = 24, `5+10` = 15. */
export function penaltyMinutes(code: string | null): number {
  if (!code) return 0;
  return parts(code).reduce((sum, part) => sum + (MINUTES_PER_PART[part] ?? 0), 0);
}

/** Délky dílů, které mění početní stav, v sekundách a v pořadí, jak běží.
 *  `2+2` = dva menší tresty za sebou → `[120, 120]`.
 *  `2+10` se chová jako `2` → `[120]`. Samotné `10` i `OK` → `[]`. */
export function penaltyDurations(code: string | null): number[] {
  if (!code) return [];
  const seconds: number[] = [];
  for (const part of parts(code)) {
    const sec = SECONDS_PER_PART[part];
    // Osobní trest ukončuje hlavní část kódu – za ním už nic počítaného není.
    if (sec === undefined) break;
    seconds.push(sec);
  }
  return seconds;
}

/** Kód pro záznam zapsaný před zavedením `penalty_code`.
 *  Tehdy se zapisovaly jen 2 a 5; 4 minuty znamenaly dva menší tresty. */
export function legacyCode(penaltyMin: number | null): string | null {
  switch (penaltyMin) {
    case 2:
      return "2";
    case 4:
      return "2+2";
    case 5:
      return "5";
    default:
      return null;
  }
}

/** Kód trestu u události – u starých záznamů dopočítaný z minut. */
export function effectiveCode(event: {
  penaltyCode: string | null;
  penaltyMin: number | null;
}): string | null {
  return event.penaltyCode ?? legacyCode(event.penaltyMin);
}

/** Popis pro uživatele: „2 min“, „2+2 min“, „10 min osobní“, „do konce zápasu“. */
export function penaltyLabel(code: string | null): string {
  if (!code) return "—";
  switch (code) {
    case "OK":
      return "do konce zápasu";
    case "10":
      return "10 min osobní";
    default:
      return code.endsWith("+OK")
        ? `${code.slice(0, -3)} min + do konce zápasu`
        : `${code} min`;
  }
}
