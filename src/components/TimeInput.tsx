import { normalizeClock } from "../lib/format";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];

/** Zadání času gólu. Číselník je tu proto, že na tabletu v rukavici se do
 *  systémové klávesnice trefuje mizerně – na rozdíl od původního prompt(). */
export function TimeInput({ value, onChange }: Props) {
  const digits = value.replace(/\D/g, "").slice(-4);
  const shown = digits.padStart(4, "0");

  const press = (key: string) => {
    if (key === "⌫") onChange(digits.slice(0, -1));
    else if (key === "✓") onChange(digits);
    else onChange((digits + key).slice(-4));
    navigator.vibrate?.(8);
  };

  return (
    <div>
      <div className="mb-3 text-center font-mono text-4xl font-bold tabular-nums tracking-wider">
        {shown.slice(0, 2)}
        <span className="text-slate-500">:</span>
        {shown.slice(2)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`tap-target rounded-xl py-4 text-xl font-bold transition active:scale-95 ${
              key === "⌫"
                ? "bg-white/5 text-slate-300"
                : key === "✓"
                  ? "bg-emerald-700/40 text-emerald-200"
                  : "bg-white/10 text-white"
            }`}
            onClick={() => press(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        Čas je nepovinný – bez vyplnění se událost uloží bez času.
      </p>
    </div>
  );
}

export { normalizeClock };
