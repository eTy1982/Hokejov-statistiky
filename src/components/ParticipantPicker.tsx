import { useMemo } from "react";
import type { Participant } from "../lib/types";
import { playerRows } from "../lib/playerRows";
import { lineColor, playerNumber, surname } from "../lib/format";
import type { LayoutSize } from "../hooks/useLayoutSize";

interface Props {
  participants: Participant[];
  selected: ReadonlySet<string>;
  /** Vybraní, které nejde odkliknout – střelec a asistenti mají plus vždy. */
  locked?: ReadonlySet<string>;
  onToggle: (participantId: string) => void;
  size: LayoutSize;
}

/** Mřížka pro výběr hráčů v dialozích. Rozvržení je schválně stejné jako na
 *  hlavní obrazovce (obrany vlevo, útoky vpravo), aby zapisovatel nehledal. */
export function ParticipantPicker({
  participants,
  selected,
  locked,
  onToggle,
  size,
}: Props) {
  const { left, right } = useMemo(() => playerRows(participants), [participants]);
  const compact = size === "cover";

  const tile = (player: Participant) => {
    const isSelected = selected.has(player.id);
    const isLocked = locked?.has(player.id) ?? false;
    return (
      <button
        key={player.rosterId}
        type="button"
        disabled={isLocked}
        className={`tap-target flex flex-col items-center justify-center rounded-lg border-2
                    font-condensed font-bold text-white transition active:scale-95
                    ${compact ? "py-1.5" : "py-2"}
                    ${
                      isSelected
                        ? `${lineColor(player.line, player.position === "B")} ring-2 ring-white`
                        : "border-white/10 bg-white/5 text-slate-300"
                    }
                    ${isLocked ? "cursor-default opacity-90" : ""}`}
        onClick={() => onToggle(player.id)}
        title={isLocked ? "Plus má vždy – odkliknout nejde" : undefined}
      >
        <span className={`${compact ? "text-lg" : "text-xl"} leading-none tabular-nums`}>
          {playerNumber(player)}
        </span>
        <span className={`${compact ? "text-[10px]" : "text-[11px]"} leading-none font-semibold`}>
          {surname(player)}
        </span>
      </button>
    );
  };

  const column = (
    rows: ReturnType<typeof playerRows>["left"],
    span: string,
  ) => (
    <div className={`flex flex-col gap-1.5 ${span}`}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${row.perRow}, minmax(0, 1fr))` }}
        >
          {row.players.map(tile)}
        </div>
      ))}
    </div>
  );

  if (!participants.length) {
    return <p className="text-sm text-slate-500">V sestavě zápasu nikdo není.</p>;
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      {column(left, "col-span-2")}
      {column(right, "col-span-3")}
    </div>
  );
}
