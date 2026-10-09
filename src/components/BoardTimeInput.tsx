import { boardDisplay, boardToElapsed, formatSeconds } from "../lib/clock";
import { PERIOD_IN } from "../lib/format";
import type { Period } from "../lib/types";
import type { LayoutSize } from "../hooks/useLayoutSize";

interface Props {
  digits: string;
  onDigits: (digits: string) => void;
  countsDown: boolean;
  onCountsDown: (countsDown: boolean) => void;
  period: Period;
  size: LayoutSize;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

/** Čas se opisuje z tabule v hale, přepočet na odehraný čas dělá aplikace.
 *  Dřív si ho Libor počítal z hlavy, což je u 20:00 → 0:00 zdroj chyb.
 *
 *  Číselník je tu proto, že na tabletu v rukavici se do systémové klávesnice
 *  trefuje mizerně. Číslice se zadávají jako na kalkulačce: `438` = 04:38. */
export function BoardTimeInput({
  digits,
  onDigits,
  countsDown,
  onCountsDown,
  period,
  size,
}: Props) {
  const elapsed = boardToElapsed(digits, period, countsDown);
  const shown = boardDisplay(digits) ?? "––:––";
  const compact = size === "cover";

  const press = (pressedKey: string) => {
    if (pressedKey === "⌫") onDigits(digits.slice(0, -1));
    else if (pressedKey === "C") onDigits("");
    else onDigits((digits + pressedKey).slice(-4));
    navigator.vibrate?.(8);
  };

  return (
    <div>
      <div className="mb-1 text-center text-xs tracking-wide text-slate-500 uppercase">
        Na tabuli
      </div>
      <div
        className={`text-center font-condensed font-bold tabular-nums ${
          compact ? "text-3xl" : "text-4xl"
        }`}
      >
        {shown}
      </div>

      <div className={`text-center text-sm ${compact ? "mt-1 min-h-8" : "mt-2 min-h-10"}`}>
        {digits === "" ? (
          <span className="text-slate-500">Opište čas z tabule.</span>
        ) : elapsed === null ? (
          <span className="font-semibold text-rose-300">Takový čas na tabuli být nemůže</span>
        ) : (
          <span className="font-semibold text-emerald-300">
            = {formatSeconds(elapsed)} odehraného času {PERIOD_IN[period] ?? ""}
          </span>
        )}
      </div>

      <div className={`grid grid-cols-3 ${compact ? "mt-1 gap-1.5" : "mt-2 gap-2"}`}>
        {KEYS.map((pressedKey) => (
          <button
            key={pressedKey}
            type="button"
            className={`tap-target rounded-xl font-bold transition active:scale-95 ${
              compact ? "py-2.5 text-lg" : "py-3 text-xl"
            } ${
              pressedKey === "⌫" || pressedKey === "C"
                ? "bg-white/5 text-slate-300"
                : "bg-white/10 text-white"
            }`}
            onClick={() => press(pressedKey)}
          >
            {pressedKey}
          </button>
        ))}
      </div>

      <div className={`flex gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        {[
          { value: true, label: "Tabule odpočítává" },
          { value: false, label: "Tabule přičítá" },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${
              countsDown === option.value
                ? "bg-ice-500 text-white"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
            onClick={() => onCountsDown(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
