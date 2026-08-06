import { useRef } from "react";
import type { Player } from "../lib/types";
import { lineColor, playerNumber, surname } from "../lib/format";

const LONG_PRESS_MS = 500;

interface Props {
  player: Player;
  line: number;
  isGoalie: boolean;
  /** Hlavní počítadlo na dlaždici – střely u hráčů, zákroky u brankářů. */
  count: number;
  disabled?: boolean;
  highlighted?: boolean;
  onTap: () => void;
  onLongPress: () => void;
}

/** Dlaždice hráče: krátký stisk = střela/zákrok, dlouhý = trest.
 *
 *  Oproti předchozí verzi tu není žádná globální ochrana proti dvojkliku –
 *  ta zahazovala rychlé kliky na různé hráče. Dvojité započtení řeší to, že
 *  akce visí na `pointerup` téže dlaždice. */
export function PlayerTile({
  player,
  line,
  isGoalie,
  count,
  disabled,
  highlighted,
  onTap,
  onLongPress,
}: Props) {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longFired.current = false;
    clear();
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      timer.current = null;
      navigator.vibrate?.([12, 40, 12]);
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const onPointerUp = () => {
    if (disabled) return;
    const wasLong = longFired.current;
    clear();
    if (!wasLong) {
      navigator.vibrate?.(10);
      onTap();
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`tap-target relative flex flex-col items-center justify-center rounded-2xl border-2 px-1 py-4
                  font-bold text-white shadow-md transition active:scale-[0.97]
                  disabled:opacity-40 ${lineColor(line, isGoalie)}
                  ${highlighted ? "ring-4 ring-amber-300" : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="text-3xl leading-none tabular-nums">{playerNumber(player)}</span>
      <span className="mt-1 max-w-full truncate px-1 text-[11px] font-medium opacity-80">
        {surname(player)}
      </span>
      {count > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-6 rounded-full bg-black/50 px-1.5 py-0.5 text-xs tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
