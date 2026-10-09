/** Krátké popisy událostí pro oznámení a pro tlačítko Vrátit.
 *
 *  Zapisovatel se po ťuknutí potřebuje jednou podívat a vědět, co se zapsalo,
 *  takže popis obsahuje hráče i čas – ne jen typ události.
 */
import { PERIOD_SHORT } from "./format";
import { penaltyLabel } from "./penalty";
import type { MatchEvent } from "./types";

/** `nameOf` vrací třeba `#61 Rákos`; co s neznámým id, rozhoduje volající. */
export function describeEvent(
  event: MatchEvent,
  nameOf: (id: string | null) => string,
): string {
  const at = event.clock ? ` · ${event.clock}` : "";
  const periodName = PERIOD_SHORT[event.period] ?? event.period;

  switch (event.type) {
    case "shot":
      return `Střela ${nameOf(event.playerId)}`;
    case "save":
      return `Zákrok ${nameOf(event.goalieId)}`;
    case "goal_for":
      return `Gól ${nameOf(event.playerId)}${at}`;
    case "goal_against":
      return `Obdržený gól${at}`;
    case "penalty":
      return event.side === "opp"
        ? `Trest soupeře ${event.penaltyCode ?? penaltyLabel(null)}${at}`
        : `Trest ${nameOf(event.playerId)} ${event.penaltyCode ?? `${event.penaltyMin ?? "?"} min`}${at}`;
    case "so_attempt":
      return `Nájezd ${nameOf(event.playerId ?? event.goalieId)}`;
    case "period_start":
      return `Buly – ${periodName}`;
    case "period_end":
      return `Konec ${periodName}`;
  }
}
