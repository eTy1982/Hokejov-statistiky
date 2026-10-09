import { useRef } from "react";
import type { Participant } from "../lib/types";
import type { LayoutSize } from "../hooks/useLayoutSize";
import { lineColor, playerNumber, surname } from "../lib/format";

const LONG_PRESS_MS = 550;

/** Role brankáře v zápase – druhý brankář je vidět, ale ztlumený, a ťuk na něj
 *  znamená výměnu, ne zákrok. */
export type GoalieRole = "ice" | "bench";

interface Props {
  participant: Participant;
  /** Hlavní počítadlo na dlaždici – střely u hráčů, zákroky u brankářů. */
  count: number;
  size: LayoutSize;
  /** Uzamčený zápas – dlaždice nereaguje vůbec. */
  disabled?: boolean;
  /** Třetina neběží – dlaždice je ztlumená, ale ťuk projde, aby šlo
   *  zapisovateli říct proč se nic nezapsalo. */
  inactive?: boolean;
  goalieRole?: GoalieRole;
  onTap: () => void;
  onLongPress: () => void;
}

/** Rozměry z makety. Číslo i jméno jsou v Barlow Condensed, aby se celé
 *  příjmení vešlo i na zavřený Fold – nejdelší v kádru má 12 znaků. */
const METRICS: Record<LayoutSize, { number: string; name: string; gap: string; pad: string }> = {
  wide: { number: "text-[34px]", name: "text-[15px]", gap: "gap-1.5", pad: "py-3" },
  fold: { number: "text-[29px]", name: "text-[13px]", gap: "gap-1", pad: "py-2.5" },
  cover: { number: "text-[25px]", name: "text-[12px]", gap: "gap-[5px]", pad: "py-2" },
};

/** Dlaždice hráče: krátký stisk = střela/zákrok, dlouhý = trest.
 *
 *  Oproti předchozí verzi tu není žádná globální ochrana proti dvojkliku –
 *  ta zahazovala rychlé kliky na různé hráče. Dvojité započtení řeší to, že
 *  akce visí na `pointerup` téže dlaždice. */
export function PlayerTile({
  participant,
  count,
  size,
  disabled,
  inactive,
  goalieRole,
  onTap,
  onLongPress,
}: Props) {
  const isGoalie = participant.position === "B";
  const metrics = METRICS[size];
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
      className={`tap-target relative flex h-full w-full flex-col items-center justify-center
                  overflow-hidden rounded-xl border-2 px-1 font-condensed font-bold text-white
                  shadow-md transition active:scale-[0.97] disabled:opacity-40
                  ${metrics.pad} ${metrics.gap} ${lineColor(participant.line, isGoalie)}
                  ${goalieRole === "ice" ? "ring-2 ring-emerald-400" : ""}
                  ${goalieRole === "bench" ? "opacity-60" : ""}
                  ${inactive ? "opacity-45 grayscale" : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={`${metrics.number} leading-none tabular-nums`}>
        {playerNumber(participant)}
      </span>
      {/* Bez ořezávání – zapisovatel hledá hráče podle jména, ne podle tří teček. */}
      <span className={`${metrics.name} leading-none font-semibold tracking-tight`}>
        {surname(participant)}
      </span>

      {goalieRole && (
        <span
          className={`mt-0.5 rounded px-1 text-[9px] leading-tight font-semibold tracking-wide uppercase ${
            goalieRole === "ice" ? "bg-emerald-400/30 text-emerald-100" : "bg-white/15 text-white/80"
          }`}
        >
          {goalieRole === "ice" ? "na ledě" : "střídačka"}
        </span>
      )}

      {participant.isGuest && (
        <span
          className="absolute top-1 left-1 rounded bg-white/25 px-1 text-[9px] leading-tight"
          title="Hostující hráč"
        >
          H
        </span>
      )}
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-5 rounded-full bg-black/50 px-1 py-0.5 text-[11px] leading-tight tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
