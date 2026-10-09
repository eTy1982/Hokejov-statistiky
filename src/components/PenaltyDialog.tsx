import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { BoardTimeInput } from "./BoardTimeInput";
import { ParticipantPicker } from "./ParticipantPicker";
import { boardToElapsed, formatSeconds } from "../lib/clock";
import { playerLabel } from "../lib/format";
import {
  PENALTY_MAIN,
  PENALTY_PERSONAL,
  composeCode,
  penaltyMinutes,
  type PenaltyMain,
  type PenaltyPersonal,
} from "../lib/penalty";
import type { Participant, Period, Side } from "../lib/types";
import { useBoardCountsDown } from "../hooks/useBoardCountsDown";
import type { LayoutSize } from "../hooks/useLayoutSize";

export interface PenaltyDraft {
  side: Side;
  playerId: string | null;
  clock: string;
  penaltyCode: string;
  penaltyMin: number;
}

interface Props {
  period: Period;
  participants: Participant[];
  /** Při podržení dlaždice je hráč předvybraný. */
  preselectedPlayerId: string | null;
  venue: string | null;
  size: LayoutSize;
  onClose: () => void;
  onSave: (draft: PenaltyDraft) => void;
}

const PERSONAL_LABEL: Record<PenaltyPersonal, string> = { "10": "10", OK: "do konce" };

/** Jeden dialog pro trest Dynama i soupeře.
 *
 *  Čas je povinný u obou stran – bez něj nejde spočítat početní stav u gólu.
 *  (Vědomá změna rozhodnutí z 22. 8., kdy se trest soupeře zapisoval na dva
 *  doteky bez času; Libor si čas 7. 10. vyžádal sám.) */
export function PenaltyDialog({
  period,
  participants,
  preselectedPlayerId,
  venue,
  size,
  onClose,
  onSave,
}: Props) {
  const [side, setSide] = useState<Side>("us");
  const [playerId, setPlayerId] = useState<string | null>(preselectedPlayerId);
  const [main, setMain] = useState<PenaltyMain | null>("2");
  const [personal, setPersonal] = useState<PenaltyPersonal | null>(null);
  const [digits, setDigits] = useState("");
  const [countsDown, setCountsDown] = useBoardCountsDown(venue);

  const elapsed = boardToElapsed(digits, period, countsDown);
  const code = side === "opp" ? main : composeCode(main, personal);
  const minutes = penaltyMinutes(code);
  const selected = useMemo(() => new Set(playerId ? [playerId] : []), [playerId]);

  const needsPlayer = side === "us";
  const canSave = elapsed !== null && Boolean(code) && (!needsPlayer || Boolean(playerId));

  const save = () => {
    if (elapsed === null || !code) return;
    onSave({
      side,
      playerId: side === "opp" ? null : playerId,
      clock: formatSeconds(elapsed),
      penaltyCode: code,
      penaltyMin: minutes,
    });
  };

  const sentence = describe(side, code, minutes);

  return (
    <Modal
      title="Trest"
      subtitle={sentence}
      wide={size !== "cover"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Zrušit
          </button>
          <button className="btn-primary" disabled={!canSave} onClick={save}>
            Zapsat trest
          </button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {(
          [
            { value: "us" as Side, label: "Dynamo" },
            { value: "opp" as Side, label: "Soupeř" },
          ]
        ).map((option) => (
          <button
            key={option.value}
            className={`flex-1 rounded-xl py-3 font-bold transition ${
              side === option.value ? "bg-ice-500 text-white" : "bg-white/5 text-slate-300"
            }`}
            onClick={() => setSide(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={size === "cover" ? "space-y-4" : "grid grid-cols-2 gap-5"}>
        <div className="space-y-4">
          <div>
            <div className="label">Trest – mění počet hráčů</div>
            <div className="flex gap-2">
              <ChoiceButton active={main === null} onClick={() => setMain(null)} label="žádný" />
              {PENALTY_MAIN.map((value) => (
                <ChoiceButton
                  key={value}
                  active={main === value}
                  onClick={() => setMain(value)}
                  label={value}
                />
              ))}
            </div>
          </div>

          {side === "us" && (
            <div>
              <div className="label">Osobní trest – počet hráčů nemění</div>
              <div className="flex gap-2">
                <ChoiceButton
                  active={personal === null}
                  onClick={() => setPersonal(null)}
                  label="žádný"
                />
                {PENALTY_PERSONAL.map((value) => (
                  <ChoiceButton
                    key={value}
                    active={personal === value}
                    onClick={() => setPersonal(value)}
                    label={PERSONAL_LABEL[value]}
                  />
                ))}
              </div>
            </div>
          )}

          <BoardTimeInput
            digits={digits}
            onDigits={setDigits}
            countsDown={countsDown}
            onCountsDown={setCountsDown}
            period={period}
            size={size}
          />
        </div>

        {side === "us" ? (
          <div>
            <div className="label">
              Hráč {playerId ? `– ${playerLabel(participants.find((p) => p.id === playerId))}` : ""}
            </div>
            <ParticipantPicker
              participants={participants}
              selected={selected}
              onToggle={(id) => setPlayerId((current) => (current === id ? null : id))}
              size={size}
            />
          </div>
        ) : (
          <p className="self-start text-sm text-slate-400">
            U trestu soupeře se hráč nevybírá – hráče soupeře nesledujeme. Čas je potřeba kvůli
            početnímu stavu u gólů.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex-1 rounded-xl px-2 py-3 text-sm font-bold whitespace-nowrap transition ${
        active ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Věta, co se vlastně zapíše – ať se zapisovatel nemusí dohadovat. */
function describe(side: Side, code: string | null, minutes: number): string {
  if (!code) return "Vyberte trest.";
  const who = side === "opp" ? "Trest soupeře" : "Trest";
  const ending =
    code === "10" || code === "OK"
      ? " Početní stav nemění."
      : code.startsWith("5")
        ? " Velký trest běží dál i po gólu."
        : side === "opp"
          ? " Náš gól v přesilovce ho ukončí."
          : " Gól soupeře v přesilovce ho ukončí.";
  return `${who} ${code}, ${minutes} trestných minut.${ending}`;
}
