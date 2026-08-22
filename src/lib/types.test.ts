import { describe, expect, it } from "vitest";
import { makeEvent, type MatchEvent } from "./types";
import { computeStats, sumCounts, sumTimes } from "./stats";

const base = { matchId: "m1", seq: 1, period: "1" } as const;

describe("makeEvent – nová pole", () => {
  it("nechává stav hry i stranu trestu prázdné, dokud je někdo nevyplní", () => {
    const e = makeEvent({ ...base, type: "shot" });
    expect(e.strength).toBeNull();
    expect(e.side).toBeNull();
  });

  it("předané hodnoty nepřepisuje", () => {
    const gol = makeEvent({ ...base, type: "goal_for", strength: "pp" });
    expect(gol.strength).toBe("pp");
    const trest = makeEvent({ ...base, type: "penalty", side: "opp" });
    expect(trest.side).toBe("opp");
  });
});

describe("zpětná kompatibilita se zápasy zapsanými před touto změnou", () => {
  /** Přesně to, co je dnes v databázi u pěti přípravných zápasů. */
  const stary = (over: Partial<MatchEvent>): MatchEvent => ({
    ...makeEvent({ ...base, type: "goal_for" }),
    strength: null,
    side: null,
    ...over,
  });

  it("gól bez stavu hry se počítá stejně jako dřív", () => {
    const { byPlayer, totals } = computeStats([
      stary({ type: "goal_for", playerId: "p1", clock: "10:00", assists: ["p2"] }),
    ]);
    expect(sumTimes(byPlayer["p1"]!.goals)).toBe(1);
    expect(sumCounts(byPlayer["p1"]!.shots)).toBe(1);
    expect(sumCounts(byPlayer["p2"]!.assists)).toBe(1);
    expect(totals.totalGoalsFor).toBe(1);
  });

  it("trest bez určení strany se počítá jako dřív", () => {
    const { byPlayer } = computeStats([
      stary({ type: "penalty", playerId: "p1", clock: "05:00" }),
    ]);
    expect(sumTimes(byPlayer["p1"]!.penalties)).toBe(1);
  });

  it("gól bez času nerozbije výpočet", () => {
    const { totals } = computeStats([stary({ type: "goal_for", playerId: "p1", clock: null })]);
    expect(totals.totalGoalsFor).toBe(1);
  });
});

describe("nová pole nemění výpočet statistik", () => {
  it("stav hry ani trest soupeře se do součtů nepromítnou", () => {
    const bez = computeStats([
      makeEvent({ ...base, type: "goal_for", playerId: "p1", clock: "01:00" }),
      makeEvent({ ...base, seq: 2, type: "penalty", playerId: "p1", clock: "02:00" }),
    ]);
    const s = computeStats([
      makeEvent({ ...base, type: "goal_for", playerId: "p1", clock: "01:00", strength: "pp" }),
      makeEvent({ ...base, seq: 2, type: "penalty", playerId: "p1", clock: "02:00", side: "us" }),
    ]);
    expect(s).toEqual(bez);
  });

  it("trest soupeře nikomu nepřidá trestné minuty", () => {
    const { byPlayer } = computeStats([
      makeEvent({ ...base, type: "penalty", playerId: null, side: "opp", clock: "07:00" }),
    ]);
    expect(Object.keys(byPlayer)).toEqual([]);
  });
});
