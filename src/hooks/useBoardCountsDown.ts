import { useCallback, useState } from "react";

/** Odpočítává tabule v téhle hale? Pamatuje se **podle haly**, protože je to
 *  vlastnost zařízení na stadionu, ne zápasu – do stejné haly se jezdí znovu.
 *  Výchozí je odpočítávání, to má většina tabulí. */
const key = (venue: string | null) => `dynamo-stats-board-${venue?.trim() || "neznama-hala"}`;

const read = (venue: string | null): boolean => {
  try {
    const stored = localStorage.getItem(key(venue));
    return stored === null ? true : stored === "down";
  } catch {
    return true; // soukromé okno nebo zakázané úložiště
  }
};

export function useBoardCountsDown(venue: string | null): [boolean, (value: boolean) => void] {
  const [countsDown, setCountsDown] = useState(() => read(venue));

  const update = useCallback(
    (value: boolean) => {
      setCountsDown(value);
      try {
        localStorage.setItem(key(venue), value ? "down" : "up");
      } catch {
        // Nastavení se nezapamatuje, zápis funguje dál.
      }
    },
    [venue],
  );

  return [countsDown, update];
}
