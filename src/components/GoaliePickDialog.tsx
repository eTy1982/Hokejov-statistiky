import { Modal } from "./Modal";
import { lineColor, playerNumber, surname } from "../lib/format";
import type { Participant } from "../lib/types";

interface Props {
  goalies: Participant[];
  activeGoalieId: string | null;
  /** Před prvním buly se ptáme „Kdo chytá?“ – soupiska to neříká. */
  reason: "faceoff" | "switch";
  onPick: (goalieId: string) => void;
  onClose: () => void;
}

export function GoaliePickDialog({ goalies, activeGoalieId, reason, onPick, onClose }: Props) {
  return (
    <Modal
      title={reason === "faceoff" ? "Kdo chytá?" : "Výměna brankáře"}
      subtitle={
        reason === "faceoff"
          ? "Zapíše se zároveň buly. Vyměnit se dá kdykoli v liště pod dlaždicemi."
          : "Na led jde vybraný brankář."
      }
      onClose={onClose}
      footer={
        <button className="btn-ghost" onClick={onClose}>
          Zrušit
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {goalies.map((goalie) => (
          <button
            key={goalie.rosterId}
            type="button"
            className={`tap-target flex flex-col items-center justify-center gap-1 rounded-2xl
                        border-2 py-8 font-condensed font-bold text-white transition
                        active:scale-95 ${lineColor(0, true)}
                        ${goalie.id === activeGoalieId ? "ring-2 ring-emerald-400" : ""}`}
            onClick={() => onPick(goalie.id)}
          >
            <span className="text-4xl leading-none tabular-nums">{playerNumber(goalie)}</span>
            <span className="text-sm leading-none font-semibold">{surname(goalie)}</span>
            {goalie.id === activeGoalieId && (
              <span className="rounded bg-emerald-400/30 px-1 text-[10px] text-emerald-100 uppercase">
                na ledě
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
