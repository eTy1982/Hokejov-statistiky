import type { Participant } from "../lib/types";
import type { LayoutSize } from "../hooks/useLayoutSize";
import { useLongPress } from "../hooks/useLongPress";
import { lineColor, playerNumber, surname } from "../lib/format";

interface Props {
  activeGoalie: Participant | undefined;
  /** Zákroky brankáře na ledě – jde o nejčastější ťuknutí, ať je vidět počet. */
  saveCount: number;
  /** Je koho vyměnit? S jedním brankářem v soupisce přepínač nic nedělá. */
  canSwitch: boolean;
  size: LayoutSize;
  disabled?: boolean;
  inactive?: boolean;
  onSwitch: () => void;
  onLongPressGoalie: () => void;
  onOpponentShot: () => void;
}

/** Pevný řádek mezi mřížkou a spodní lištou.
 *
 *  Zákrok je spolu s naší střelou nejčastější ťuknutí v zápase (25–35×), takže
 *  si zaslouží velké tlačítko na pevném místě u palce, ne dlaždici v rohu.
 *  Brankáři proto z mřížky zmizeli a je tu jen přepínač, kdo chytá.
 *
 *  Tmavá barva (stejná, jakou měly dlaždice brankářů) odlišuje řádek od Gólu
 *  a Obdrženého gólu ve spodní liště. */
export function GoalieBar({
  activeGoalie,
  saveCount,
  canSwitch,
  size,
  disabled,
  inactive,
  onSwitch,
  onLongPressGoalie,
  onOpponentShot,
}: Props) {
  const cover = size === "cover";
  const dark = lineColor(0, true);

  const switchHandlers = useLongPress({
    onTap: onSwitch,
    onLongPress: activeGoalie ? onLongPressGoalie : undefined,
    disabled,
  });

  const shotHandlers = useLongPress({ onTap: onOpponentShot, disabled });

  return (
    <div className="flex shrink-0 items-stretch gap-2" style={{ minHeight: "56px" }}>
      <button
        type="button"
        disabled={disabled || !activeGoalie}
        className={`tap-target flex w-1/4 min-w-20 flex-col items-center justify-center
                    rounded-xl border-2 px-2 font-condensed font-bold text-white
                    transition active:scale-[0.97] disabled:opacity-40 ${dark}
                    ${inactive ? "opacity-45 grayscale" : ""}`}
        title={canSwitch ? "Vyměnit brankáře (podržením trest)" : "V soupisce je jen jeden brankář"}
        {...switchHandlers}
      >
        {activeGoalie ? (
          cover ? (
            <span className="text-xl leading-none tabular-nums">
              ⇄ {playerNumber(activeGoalie)}
            </span>
          ) : (
            <>
              <span className="text-lg leading-none tabular-nums">
                ⇄ B #{playerNumber(activeGoalie)}
              </span>
              <span className="text-xs leading-tight font-semibold opacity-80">
                {surname(activeGoalie)}
              </span>
            </>
          )
        ) : (
          <span className="text-xs leading-tight">Brankář nevybrán</span>
        )}
      </button>

      <button
        type="button"
        disabled={disabled || !activeGoalie}
        className={`tap-target flex flex-1 flex-col items-center justify-center rounded-xl
                    border-2 px-2 font-bold text-white transition active:scale-[0.97]
                    disabled:opacity-40 ${dark}
                    ${inactive ? "opacity-45 grayscale" : ""}`}
        {...shotHandlers}
      >
        <span className={cover ? "text-base" : "text-lg"}>Střela soupeře</span>
        {activeGoalie && (
          <span className="text-xs font-normal text-slate-400">
            zákrok · #{playerNumber(activeGoalie)} {surname(activeGoalie)} · {saveCount}
          </span>
        )}
      </button>
    </div>
  );
}
