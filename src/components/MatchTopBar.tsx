import { PERIODS, type RegularPeriod } from "../lib/types";
import { PERIOD_LABEL, PERIOD_SHORT, formatTimeOfDay } from "../lib/format";
import type { PeriodState } from "../lib/periods";
import type { LayoutSize } from "../hooks/useLayoutSize";

export interface StrengthLine {
  /** „Přesilovka“ / „Oslabení“. */
  label: string;
  /** „soupeř 2, konec na tabuli 10:30“. */
  detail: string;
  tone: "pp" | "sh";
}

interface Props {
  size: LayoutSize;
  homeName: string;
  awayName: string;
  score: { home: number; away: number };
  shotsHome: number;
  shotsAway: number;
  state: PeriodState;
  /** Ruční přepínač pro staré zápasy bez značek. */
  manualPeriod: RegularPeriod;
  onManualPeriod: (period: RegularPeriod) => void;
  onPeriodMark: () => void;
  strengthLine: StrengthLine | null;
  onOpenTimes: () => void;
  locked: boolean;
  /** Bez brankáře v soupisce nejde začít – nebylo by komu zapsat zákrok. */
  missingGoalie: boolean;
}

/** Pevná lišta nad dlaždicemi. Drží skóre, třetinu a jedno tlačítko, kterým
 *  se třetiny začínají a končí – ručně se už nepřepínají. */
export function MatchTopBar({
  size,
  homeName,
  awayName,
  score,
  shotsHome,
  shotsAway,
  state,
  manualPeriod,
  onManualPeriod,
  onPeriodMark,
  strengthLine,
  onOpenTimes,
  locked,
  missingGoalie,
}: Props) {
  const compact = size === "cover";
  const button = periodButton(state);
  const blockedByGoalie = button?.kind === "start" && missingGoalie;

  const scoreBlock = (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`truncate font-semibold ${compact ? "text-sm" : "text-base"}`}>
        {homeName}
      </span>
      <span
        className={`font-condensed font-black tabular-nums ${compact ? "text-2xl" : "text-3xl"}`}
      >
        {score.home}
        <span className="mx-1 text-slate-600">:</span>
        {score.away}
      </span>
      <span className={`truncate font-semibold ${compact ? "text-sm" : "text-base"}`}>
        {awayName}
      </span>
    </div>
  );

  const periodBlock = (
    <div className="min-w-0">
      <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
        {state.hasMarks
          ? state.running
            ? (PERIOD_LABEL[state.running] ?? state.running)
            : state.phase === "break"
              ? "Přestávka"
              : "Před zápasem"
          : (PERIOD_LABEL[manualPeriod] ?? manualPeriod)}
      </div>
      {state.hasMarks && state.phase === "running" && state.runningSince && (
        <div className="text-xs text-slate-400 tabular-nums">
          běží od {formatTimeOfDay(state.runningSince)}
        </div>
      )}
      {state.hasMarks && state.phase === "break" && state.last && (
        <div className="text-xs text-slate-400">
          dohraná {PERIOD_SHORT[state.last] ?? state.last}
        </div>
      )}
    </div>
  );

  const shotsBlock = (
    <div className={`shrink-0 text-slate-400 ${compact ? "text-xs" : "text-sm"}`}>
      Střely{" "}
      <strong className="text-slate-200 tabular-nums">
        {shotsHome}:{shotsAway}
      </strong>
    </div>
  );

  const markButton = button && (
    <button
      className={`shrink-0 font-bold ${button.kind === "end" ? "btn-danger" : "btn-primary"} ${
        compact ? "!px-3 !py-2 text-xs" : "!px-4 !py-2.5"
      }`}
      disabled={locked || blockedByGoalie}
      onClick={onPeriodMark}
    >
      {blockedByGoalie ? "Chybí brankář v sestavě" : button.label}
    </button>
  );

  /** Druhý řádek: co právě běží, nebo odkaz na časy třetin. */
  const secondLine = strengthLine ? (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <span
        className={`chip shrink-0 !px-2 !py-0.5 ${
          strengthLine.tone === "pp"
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-rose-500/20 text-rose-200"
        }`}
      >
        {strengthLine.label}
      </span>
      <span className="truncate text-slate-400">{strengthLine.detail}</span>
      <button className="ml-auto shrink-0 text-slate-400 underline" onClick={onOpenTimes}>
        Časy třetin
      </button>
    </div>
  ) : (
    <div className="flex items-center text-xs">
      <button className="text-slate-400 underline" onClick={onOpenTimes}>
        Časy třetin
      </button>
    </div>
  );

  return (
    <div className="card shrink-0 px-3 py-2">
      {compact ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            {scoreBlock}
            {markButton}
          </div>
          <div className="flex items-center justify-between gap-2">
            {periodBlock}
            {shotsBlock}
          </div>
          {secondLine}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-4">
            {scoreBlock}
            <div className="mx-auto">{periodBlock}</div>
            {shotsBlock}
            {markButton}
          </div>
          {secondLine}
        </div>
      )}

      {/* Starý zápas značky nemá – ať jde třetina dodatečně opravit ručně. */}
      {!state.hasMarks && !locked && (
        <div className="mt-2 flex gap-1.5 border-t border-white/10 pt-2">
          {PERIODS.map((period) => (
            <button
              key={period}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                manualPeriod === period ? "bg-ice-500 text-white" : "bg-white/5 text-slate-300"
              }`}
              onClick={() => onManualPeriod(period)}
            >
              {PERIOD_SHORT[period]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Jedno tlačítko, jehož význam plyne ze stavu zápasu. */
function periodButton(state: PeriodState): { label: string; kind: "start" | "end" } | null {
  if (state.phase === "running") return { label: "Konec třetiny", kind: "end" };
  if (!state.next) return null;
  const name =
    state.next === "P" ? "prodloužení" : `${state.next}. třetina`;
  return { label: `Buly – ${name}`, kind: "start" };
}
