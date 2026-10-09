import { useState } from "react";
import { Modal } from "./Modal";
import { periodTimesText, spanMinutes, type PeriodSpan } from "../lib/periods";
import { PERIOD_LABEL, formatTimeOfDay } from "../lib/format";

interface Props {
  title: string;
  spans: PeriodSpan[];
  onClose: () => void;
}

/** Začátky a konce třetin ve skutečném čase. Libor je předává kondičnímu
 *  trenérovi – jednotky Catapult (GPS/IMU na hráčích) běží v reálném čase,
 *  takže se data párují podle hodin, ne podle odehraného času. */
export function PeriodTimesPanel({ title, spans, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = periodTimesText(title, spans);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schránka může být zakázaná – ať má zapisovatel aspoň co opsat.
      window.prompt("Zkopírujte text ručně:", text);
    }
  };

  return (
    <Modal
      title="Časy třetin"
      subtitle="Skutečný čas pro kondičního trenéra (Catapult)."
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Zavřít
          </button>
          <button className="btn-primary" disabled={!spans.length} onClick={() => void copy()}>
            {copied ? "Zkopírováno" : "Zkopírovat časy"}
          </button>
        </>
      }
    >
      {spans.length === 0 ? (
        <p className="text-sm text-slate-400">
          Zápas ještě nemá značky třetin. Zapisují se tlačítkem <strong>Buly</strong> a{" "}
          <strong>Konec třetiny</strong> v horní liště.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs tracking-wide text-slate-400 uppercase">
            <tr>
              <th className="py-2 text-left">Třetina</th>
              <th className="py-2 text-right">Začátek</th>
              <th className="py-2 text-right">Konec</th>
              <th className="py-2 text-right">Délka</th>
            </tr>
          </thead>
          <tbody>
            {spans.map((span, index) => {
              const minutes = spanMinutes(span);
              return (
                <tr key={`${span.period}-${index}`} className="border-t border-white/5">
                  <td className="py-2 font-medium">{PERIOD_LABEL[span.period] ?? span.period}</td>
                  <td className="py-2 text-right tabular-nums">{formatTimeOfDay(span.start)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {span.end ? formatTimeOfDay(span.end) : <span className="text-ice-300">běží</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {minutes === null ? "—" : `${minutes} min`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
