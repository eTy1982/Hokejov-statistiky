/** Stav třetin odvozený ze značek `period_start` / `period_end`.
 *
 *  Třetina se nepřepíná ručně – vyplývá z toho, co je zapsané. Značka nese
 *  `recordedAt` (skutečný čas), odtud se berou i časy pro kondičního trenéra.
 *
 *  Zápasy zapsané před touhle změnou značky nemají (`hasMarks === false`);
 *  tam se třetina pořád vybírá ručně, aby šly dodatečně opravit.
 */
import { PERIOD_LABEL, formatTimeOfDay } from "./format";
import { PERIODS, type MatchEvent, type RegularPeriod } from "./types";

export type MatchPhase = "pre" | "running" | "break";

export interface PeriodSpan {
  period: RegularPeriod;
  /** Skutečný čas buly (ISO). */
  start: string | null;
  /** Skutečný čas konce; null u právě běžící třetiny. */
  end: string | null;
}

export interface PeriodState {
  phase: MatchPhase;
  /** Jsou v zápase značky třetin? Když ne, patří slovo ručnímu přepínači. */
  hasMarks: boolean;
  /** Třetina, do které se právě zapisuje. Mimo běžící třetinu null. */
  running: RegularPeriod | null;
  /** Naposledy dohraná třetina. */
  last: RegularPeriod | null;
  /** Co nabídne tlačítko „Buly“. Null = další už není (po prodloužení). */
  next: RegularPeriod | null;
  /** Skutečný čas buly běžící třetiny. */
  runningSince: string | null;
  spans: PeriodSpan[];
}

const nextAfter = (period: RegularPeriod): RegularPeriod | null => {
  const index = PERIODS.indexOf(period);
  return index < 0 ? null : (PERIODS[index + 1] ?? null);
};

const isRegular = (event: MatchEvent): event is MatchEvent & { period: RegularPeriod } =>
  event.period !== "SO";

export function periodState(events: MatchEvent[]): PeriodState {
  const marks = events
    .filter((e) => !e.deleted && (e.type === "period_start" || e.type === "period_end"))
    .filter(isRegular)
    .sort((a, b) => a.seq - b.seq);

  const spans: PeriodSpan[] = [];
  for (const mark of marks) {
    const open = [...spans].reverse().find((span) => span.end === null);
    if (mark.type === "period_start") {
      // Běžet může jen jedna třetina. Druhé buly je překlep (dvojí ťuknutí) –
      // platí to první, protože nese skutečný čas vhazování. Nadbytečnou
      // značku smaže Vrátit.
      if (!open) spans.push({ period: mark.period, start: mark.recordedAt, end: null });
      continue;
    }
    // Konec bez začátku (vrácené buly) nemá co uzavřít a zahodí se.
    if (open) open.end = mark.recordedAt;
  }

  const openSpan = spans.find((span) => span.end === null) ?? null;
  const closed = spans.filter((span) => span.end !== null);
  const lastClosed = closed[closed.length - 1] ?? null;

  if (!marks.length) {
    return {
      phase: "pre",
      hasMarks: false,
      running: null,
      last: null,
      next: PERIODS[0]!,
      runningSince: null,
      spans: [],
    };
  }

  if (openSpan) {
    return {
      phase: "running",
      hasMarks: true,
      running: openSpan.period,
      last: lastClosed?.period ?? null,
      next: null,
      runningSince: openSpan.start,
      spans,
    };
  }

  return {
    phase: "break",
    hasMarks: true,
    running: null,
    last: lastClosed?.period ?? null,
    next: lastClosed ? nextAfter(lastClosed.period) : PERIODS[0]!,
    runningSince: null,
    spans,
  };
}

/** Délka třetiny ve minutách podle skutečných časů. Null, když některý chybí. */
export function spanMinutes(span: PeriodSpan): number | null {
  if (!span.start || !span.end) return null;
  const from = Date.parse(span.start);
  const to = Date.parse(span.end);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 60000);
}

/** Text ke zkopírování kondičnímu trenérovi. Jednotky z Catapultu běží ve
 *  skutečném čase, takže potřebuje hodiny, ne odehraný čas. */
export function periodTimesText(title: string, spans: PeriodSpan[]): string {
  const lines = spans.map((span) => {
    const name = PERIOD_LABEL[span.period] ?? span.period;
    const minutes = spanMinutes(span);
    const end = span.end ? formatTimeOfDay(span.end) : "běží";
    const length = minutes === null ? "" : ` (${minutes} min)`;
    return `${name}: ${formatTimeOfDay(span.start)} – ${end}${length}`;
  });
  return [title, ...lines].join("\n");
}
