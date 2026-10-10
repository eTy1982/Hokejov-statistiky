import type { Participant } from "../lib/types";
import type { LayoutSize } from "../hooks/useLayoutSize";
import { useLongPress } from "../hooks/useLongPress";
import { lineColor, playerNumber, surname } from "../lib/format";

interface Props {
  participant: Participant;
  /** Hlavní počítadlo na dlaždici – střely hráče. */
  count: number;
  size: LayoutSize;
  /** Uzamčený zápas – dlaždice nereaguje vůbec. */
  disabled?: boolean;
  /** Třetina neběží – dlaždice je ztlumená, ale ťuk projde, aby šlo
   *  zapisovateli říct proč se nic nezapsalo. */
  inactive?: boolean;
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

/** Dlaždice hráče: krátký stisk = střela, dlouhý = trest. */
export function PlayerTile({
  participant,
  count,
  size,
  disabled,
  inactive,
  onTap,
  onLongPress,
}: Props) {
  const metrics = METRICS[size];
  const handlers = useLongPress({ onTap, onLongPress, disabled });

  return (
    <button
      type="button"
      disabled={disabled}
      className={`tap-target relative flex h-full w-full flex-col items-center justify-center
                  overflow-hidden rounded-xl border-2 px-1 font-condensed font-bold text-white
                  shadow-md transition active:scale-[0.97] disabled:opacity-40
                  ${metrics.pad} ${metrics.gap} ${lineColor(participant.line, false)}
                  ${inactive ? "opacity-45 grayscale" : ""}`}
      {...handlers}
    >
      <span className={`${metrics.number} leading-none tabular-nums`}>
        {playerNumber(participant)}
      </span>
      {/* Bez ořezávání – zapisovatel hledá hráče podle jména, ne podle tří teček. */}
      <span className={`${metrics.name} leading-none font-semibold tracking-tight`}>
        {surname(participant)}
      </span>

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
