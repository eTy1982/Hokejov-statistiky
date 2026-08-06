import { useState } from "react";
import { Modal } from "./Modal";
import { TimeInput } from "./TimeInput";
import { lineColor, normalizeClock, playerNumber, PERIOD_LABEL } from "../lib/format";
import type { MatchEvent, Participant } from "../lib/types";

type Mode = "for" | "against";
type Tab = "shooter" | "assist" | "plus" | "goalie" | "minus" | "clock";

export interface GoalDraft {
  clock: string | null;
  playerId: string | null;
  goalieId: string | null;
  assists: string[];
  onIcePlus: string[];
  onIceMinus: string[];
}

interface Props {
  mode: Mode;
  period: string;
  participants: Participant[];
  activeGoalieId: string | null;
  /** Vyplněno při editaci existující události. */
  editing?: MatchEvent | null;
  onSave: (draft: GoalDraft) => void;
  onClose: () => void;
}

export function GoalDialog({
  mode,
  period,
  participants,
  activeGoalieId,
  editing,
  onSave,
  onClose,
}: Props) {
  const [clock, setClock] = useState(editing?.clock?.replace(/\D/g, "") ?? "");
  const [shooter, setShooter] = useState<string | null>(editing?.playerId ?? null);
  const [goalie, setGoalie] = useState<string | null>(editing?.goalieId ?? activeGoalieId);
  const [assists, setAssists] = useState<string[]>(editing?.assists ?? []);
  const [plus, setPlus] = useState<string[]>(
    (editing?.onIcePlus ?? []).filter(
      (id) => id !== editing?.playerId && !(editing?.assists ?? []).includes(id),
    ),
  );
  const [minus, setMinus] = useState<string[]>(editing?.onIceMinus ?? []);
  const [tab, setTab] = useState<Tab>(mode === "for" ? "shooter" : "goalie");
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], id: string, limit?: number): string[] => {
    if (list.includes(id)) return list.filter((x) => x !== id);
    if (limit && list.length >= limit) return list;
    return [...list, id];
  };

  const selectedFor = (id: string): { ring: string; badge?: string } => {
    if (mode === "for") {
      if (shooter === id) return { ring: "ring-4 ring-amber-300", badge: "G" };
      const assistIndex = assists.indexOf(id);
      if (assistIndex >= 0) return { ring: "ring-4 ring-indigo-300", badge: `A${assistIndex + 1}` };
      if (plus.includes(id)) return { ring: "ring-4 ring-emerald-300", badge: "+" };
    } else {
      if (goalie === id) return { ring: "ring-4 ring-amber-300", badge: "B" };
      if (minus.includes(id)) return { ring: "ring-4 ring-rose-300", badge: "−" };
    }
    return { ring: "" };
  };

  const handleTile = (entry: Participant) => {
    const id = entry.id;
    setError(null);
    if (mode === "for") {
      if (tab === "shooter") {
        setShooter((current) => (current === id ? null : id));
        setAssists((a) => a.filter((x) => x !== id));
      } else if (tab === "assist") {
        if (id === shooter) return;
        setAssists((a) => toggle(a, id, 2));
      } else if (tab === "plus") {
        setPlus((p) => toggle(p, id));
      }
    } else {
      if (tab === "goalie") {
        if (entry.position !== "B") {
          setError("Jako brankáře lze vybrat jen hráče s pozicí B.");
          return;
        }
        setGoalie((current) => (current === id ? null : id));
      } else if (tab === "minus") {
        setMinus((m) => toggle(m, id));
      }
    }
  };

  const save = (withoutAssists = false) => {
    // Validace probíhá dřív, než se cokoli uloží – nedokončený zápis nesmí
    // zanechat žádnou stopu ve statistikách.
    if (mode === "for" && !shooter) {
      setError("Vyberte střelce.");
      setTab("shooter");
      return;
    }
    if (mode === "against" && !goalie) {
      setError("Vyberte brankáře.");
      setTab("goalie");
      return;
    }
    const finalAssists = withoutAssists ? [] : assists.slice(0, 2);
    onSave({
      clock: normalizeClock(clock),
      playerId: mode === "for" ? shooter : null,
      goalieId: mode === "against" ? goalie : null,
      assists: mode === "for" ? finalAssists : [],
      onIcePlus:
        mode === "for"
          ? [...new Set([shooter!, ...finalAssists, ...plus])]
          : [],
      onIceMinus: mode === "against" ? minus : [],
    });
  };

  const tabs: { key: Tab; label: string }[] =
    mode === "for"
      ? [
          { key: "shooter", label: "Střelec" },
          { key: "assist", label: `Asistence (${assists.length}/2)` },
          { key: "plus", label: `Plus (${plus.length})` },
          { key: "clock", label: "Čas" },
        ]
      : [
          { key: "goalie", label: "Brankář" },
          { key: "minus", label: `Minus (${minus.length})` },
          { key: "clock", label: "Čas" },
        ];

  const title = editing
    ? mode === "for"
      ? "Upravit vstřelený gól"
      : "Upravit obdržený gól"
    : mode === "for"
      ? "Vstřelený gól"
      : "Obdržený gól";

  return (
    <Modal
      wide
      title={title}
      subtitle={`${PERIOD_LABEL[period] ?? period}${normalizeClock(clock) ? ` • ${normalizeClock(clock)}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Zrušit
          </button>
          {mode === "for" && !editing && (
            <button className="btn-ghost" onClick={() => save(true)}>
              Uložit bez asistencí
            </button>
          )}
          <button className="btn-success" onClick={() => save(false)}>
            💾 Uložit
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              tab === t.key ? "bg-ice-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {tab === "clock" ? (
        <TimeInput value={clock} onChange={setClock} />
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {participants.map((entry) => {
            const { ring, badge } = selectedFor(entry.id);
            return (
              <button
                key={entry.rosterId}
                title={entry.fullName}
                className={`tap-target relative rounded-xl border-2 py-3 font-bold text-white transition active:scale-95
                            ${lineColor(entry.line, entry.position === "B")} ${ring}`}
                onClick={() => handleTile(entry)}
              >
                <span className="text-xl tabular-nums">{playerNumber(entry)}</span>
                {entry.isGuest && (
                  <span className="absolute top-0.5 left-1 text-[9px] opacity-70">H</span>
                )}
                {badge && (
                  <span className="absolute -top-1.5 -right-1.5 rounded-full bg-black px-1.5 py-0.5 text-[10px]">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <button
          className="btn-ghost"
          onClick={() => {
            setShooter(null);
            setAssists([]);
            setPlus([]);
            setMinus([]);
            setError(null);
          }}
        >
          🧹 Vymazat volby
        </button>
        <span className="self-center text-xs text-slate-500">
          {mode === "for"
            ? "Střelec i asistenti dostanou plus automaticky."
            : "Brankář se předvyplní podle toho, kdo je na ledě."}
        </span>
      </div>
    </Modal>
  );
}
