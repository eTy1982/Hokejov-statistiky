import { useMemo } from "react";
import type { Participant } from "../lib/types";
import { playerRows, type PlayerRow } from "../lib/playerRows";
import type { LayoutSize } from "../hooks/useLayoutSize";
import { PlayerTile } from "./PlayerTile";

interface Props {
  participants: Participant[];
  /** Hlavní počítadlo na dlaždici – střely hráče. */
  countOf: (participant: Participant) => number;
  size: LayoutSize;
  disabled?: boolean;
  /** Třetina neběží – ztlumit, ale ťuknutí pustit dál. */
  inactive?: boolean;
  onTap: (participant: Participant) => void;
  onLongPress: (participant: Participant) => void;
}

/** Dlaždice hráčů na obrazovce zápasu: obrany vlevo (2fr), útoky vpravo (3fr).
 *
 *  Brankáři v mřížce nejsou – mají vlastní lištu nad spodními tlačítky. Díky
 *  tomu stojí O1 vedle Ú1, O2 vedle Ú2 a oko hledá v jedné výšce. Kratší
 *  sloupec se dorovná prázdným řádkem.
 *
 *  Řádky se rozdělí o zbylou výšku, takže se obrazovka neroluje. */
export function PlayerGrid({
  participants,
  countOf,
  size,
  disabled,
  inactive,
  onTap,
  onLongPress,
}: Props) {
  const { left, right } = useMemo(
    () => playerRows(participants, { includeGoalies: false, balance: true }),
    [participants],
  );
  const showLabels = size !== "cover";

  const column = (rows: PlayerRow[], span: string) => (
    <div className={`flex min-h-0 flex-col gap-1.5 ${span}`}>
      {rows.map((row) => (
        <div key={row.key} className="flex min-h-0 flex-1 items-stretch gap-1.5">
          {showLabels && (
            <span className="w-7 shrink-0 self-center text-center text-xs font-bold text-slate-500">
              {row.label}
            </span>
          )}
          <div
            className="grid min-h-0 flex-1 gap-1.5"
            style={{ gridTemplateColumns: `repeat(${row.perRow}, minmax(0, 1fr))` }}
          >
            {row.players.map((player) => (
              <PlayerTile
                key={player.rosterId}
                participant={player}
                count={countOf(player)}
                size={size}
                disabled={disabled}
                inactive={inactive}
                onTap={() => onTap(player)}
                onLongPress={() => onLongPress(player)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-5 gap-2">
      {column(left, "col-span-2")}
      {column(right, "col-span-3")}
    </div>
  );
}
