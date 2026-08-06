import { describe, expect, it } from "vitest";
import { computeStats, emptyPlayerStats, savePercentage, scoreboard, sumCounts, sumTimes } from "./stats";
import { makeEvent, type MatchEvent } from "./types";

const M = "match-1";
const NOVAK = "p-novak";
const DVORAK = "p-dvorak";
const SVOBODA = "p-svoboda";
const GOALIE = "p-golman";

let seq = 0;
const ev = (partial: Partial<MatchEvent> & Pick<MatchEvent, "type">): MatchEvent =>
  makeEvent({ matchId: M, seq: seq++, period: "1", ...partial });

describe("computeStats – základní zápis", () => {
  it("počítá střely po třetinách", () => {
    const { byPlayer, totals } = computeStats([
      ev({ type: "shot", playerId: NOVAK, period: "1" }),
      ev({ type: "shot", playerId: NOVAK, period: "1" }),
      ev({ type: "shot", playerId: NOVAK, period: "3" }),
      ev({ type: "shot", playerId: DVORAK, period: "2" }),
    ]);
    expect(byPlayer[NOVAK]!.shots).toEqual({ "1": 2, "2": 0, "3": 1, P: 0 });
    expect(sumCounts(byPlayer[DVORAK]!.shots)).toBe(1);
    expect(totals.totalShotsFor).toBe(4);
  });

  it("gól se počítá i jako střela a dává střelci plus", () => {
    const { byPlayer, totals } = computeStats([
      ev({ type: "shot", playerId: NOVAK }),
      ev({ type: "goal_for", playerId: NOVAK, clock: "12:30" }),
    ]);
    const s = byPlayer[NOVAK]!;
    expect(sumTimes(s.goals)).toBe(1);
    expect(s.goals["1"]).toEqual(["12:30"]);
    expect(sumCounts(s.shots)).toBe(2); // střela + gól
    expect(sumCounts(s.plus)).toBe(1);
    expect(totals.totalGoalsFor).toBe(1);
    expect(totals.totalShotsFor).toBe(2);
  });

  it("asistenti dostanou asistenci i plus, plus se nepřičítá dvakrát", () => {
    const { byPlayer } = computeStats([
      ev({
        type: "goal_for",
        playerId: NOVAK,
        assists: [DVORAK, SVOBODA],
        // střelec i asistenti bývají v seznamu „na ledě“ – nesmí dostat plus dvakrát
        onIcePlus: [NOVAK, DVORAK, SVOBODA],
      }),
    ]);
    expect(sumCounts(byPlayer[NOVAK]!.plus)).toBe(1);
    expect(sumCounts(byPlayer[DVORAK]!.plus)).toBe(1);
    expect(sumCounts(byPlayer[DVORAK]!.assists)).toBe(1);
    expect(sumCounts(byPlayer[SVOBODA]!.plus)).toBe(1);
  });

  it("respektuje maximálně dvě asistence", () => {
    const { byPlayer } = computeStats([
      ev({ type: "goal_for", playerId: NOVAK, assists: [DVORAK, SVOBODA, GOALIE] }),
    ]);
    expect(byPlayer[GOALIE]).toBeUndefined();
  });

  it("obdržený gól zapíše čas brankáři a minus hráčům na ledě", () => {
    const { byPlayer, totals } = computeStats([
      ev({ type: "goal_against", goalieId: GOALIE, clock: "05:00", onIceMinus: [NOVAK, DVORAK] }),
    ]);
    expect(byPlayer[GOALIE]!.goalsAgainst["1"]).toEqual(["05:00"]);
    expect(sumCounts(byPlayer[NOVAK]!.minus)).toBe(1);
    expect(totals.totalGoalsAgainst).toBe(1);
    expect(totals.totalShotsAgainst).toBe(1); // obdržený gól je střela soupeře
  });

  it("tresty se ukládají s časem podle třetiny", () => {
    const { byPlayer } = computeStats([
      ev({ type: "penalty", playerId: NOVAK, clock: "08:15", period: "2" }),
    ]);
    expect(byPlayer[NOVAK]!.penalties["2"]).toEqual(["08:15"]);
    expect(sumTimes(byPlayer[NOVAK]!.penalties)).toBe(1);
  });
});

describe("computeStats – odolnost proti rozhození součtů", () => {
  it("smazaná událost se do statistik vůbec nepromítne", () => {
    const events = [
      ev({ type: "goal_for", playerId: NOVAK, assists: [DVORAK], clock: "01:00" }),
      ev({ type: "goal_for", playerId: NOVAK, assists: [DVORAK], clock: "02:00", deleted: true }),
    ];
    const { byPlayer, totals } = computeStats(events);
    expect(sumTimes(byPlayer[NOVAK]!.goals)).toBe(1);
    expect(sumCounts(byPlayer[NOVAK]!.plus)).toBe(1);
    expect(sumCounts(byPlayer[DVORAK]!.assists)).toBe(1);
    expect(totals.totalGoalsFor).toBe(1);
  });

  it("přepis události dá stejný výsledek jako kdyby byla zadaná rovnou správně", () => {
    // Uživatel omylem zadá gól Novákovi, pak ho opraví na Dvořáka.
    const wrong = ev({ type: "goal_for", playerId: NOVAK, assists: [SVOBODA], clock: "10:00" });
    const corrected: MatchEvent = { ...wrong, playerId: DVORAK, assists: [] };

    const afterEdit = computeStats([corrected]);
    const asIfCorrect = computeStats([
      ev({ type: "goal_for", playerId: DVORAK, assists: [], clock: "10:00" }),
    ]);

    expect(afterEdit.byPlayer[NOVAK]).toBeUndefined();
    expect(sumTimes(afterEdit.byPlayer[DVORAK]!.goals)).toBe(1);
    expect(sumCounts(afterEdit.byPlayer[DVORAK]!.plus)).toBe(1);
    expect(afterEdit.byPlayer[SVOBODA]).toBeUndefined();
    expect(afterEdit.totals).toEqual(asIfCorrect.totals);
  });

  it("opakovaný výpočet nad stejnými daty je stabilní", () => {
    const events = [
      ev({ type: "shot", playerId: NOVAK }),
      ev({ type: "goal_for", playerId: NOVAK, assists: [DVORAK] }),
      ev({ type: "save", goalieId: GOALIE }),
      ev({ type: "goal_against", goalieId: GOALIE, onIceMinus: [SVOBODA] }),
    ];
    expect(computeStats(events)).toEqual(computeStats(events));
    // pořadí v poli nesmí hrát roli, rozhoduje seq
    expect(computeStats([...events].reverse())).toEqual(computeStats(events));
  });
});

describe("brankářské statistiky", () => {
  it("SV% počítá zákroky proti celkovým střelám", () => {
    const { byPlayer } = computeStats([
      ...Array.from({ length: 9 }, () => ev({ type: "save", goalieId: GOALIE })),
      ev({ type: "goal_against", goalieId: GOALIE, clock: "01:00" }),
    ]);
    expect(savePercentage(byPlayer[GOALIE]!)).toBeCloseTo(90, 5);
  });

  it("SV% je null, když brankář nečelil ničemu", () => {
    const { byPlayer } = computeStats([ev({ type: "shot", playerId: NOVAK })]);
    expect(byPlayer[GOALIE]).toBeUndefined();
    expect(savePercentage(emptyPlayerStats())).toBeNull();
  });

  it("střely soupeře = zákroky + obdržené góly", () => {
    const { totals } = computeStats([
      ev({ type: "save", goalieId: GOALIE }),
      ev({ type: "save", goalieId: GOALIE }),
      ev({ type: "goal_against", goalieId: GOALIE }),
    ]);
    expect(totals.totalShotsAgainst).toBe(3);
    expect(totals.totalGoalsAgainst).toBe(1);
  });
});

describe("nájezdy", () => {
  it("vedou se odděleně a nemíchají se do střel ani gólů", () => {
    const { byPlayer, totals } = computeStats([
      ev({ type: "so_attempt", period: "SO", playerId: NOVAK, soResult: "goal", soRound: 1 }),
      ev({ type: "so_attempt", period: "SO", playerId: DVORAK, soResult: "miss", soRound: 2 }),
      ev({ type: "so_attempt", period: "SO", goalieId: GOALIE, soResult: "save", soRound: 1 }),
      ev({ type: "so_attempt", period: "SO", goalieId: GOALIE, soResult: "goal", soRound: 2 }),
    ]);
    expect(byPlayer[NOVAK]!.soGoals).toBe(1);
    expect(sumCounts(byPlayer[NOVAK]!.shots)).toBe(0);
    expect(sumTimes(byPlayer[NOVAK]!.goals)).toBe(0);
    expect(byPlayer[GOALIE]!.soSaves).toBe(1);
    expect(byPlayer[GOALIE]!.soGoalsAgainst).toBe(1);
    expect(totals.soFor).toBe(1);
    expect(totals.soAgainst).toBe(1);
    expect(totals.soRounds).toBe(2);
    expect(totals.totalGoalsFor).toBe(0);
  });

  it("vítěz nájezdů dostane +1 do celkového skóre, ne do třetin", () => {
    const events = [ev({ type: "goal_for", playerId: NOVAK }), ev({ type: "goal_against", goalieId: GOALIE })];
    const { totals } = computeStats(events, "us");
    expect(totals.totalGoalsFor).toBe(2);
    expect(totals.totalGoalsAgainst).toBe(1);
    expect(sumCounts(totals.goalsFor)).toBe(1); // po třetinách zůstává 1
  });
});

describe("scoreboard", () => {
  it("prohodí strany, když hrajeme venku", () => {
    const events = [
      ev({ type: "goal_for", playerId: NOVAK, period: "1" }),
      ev({ type: "goal_for", playerId: NOVAK, period: "2" }),
      ev({ type: "goal_against", goalieId: GOALIE, period: "1" }),
    ];
    const { totals } = computeStats(events);

    const doma = scoreboard(totals, "home");
    expect([doma.home, doma.away]).toEqual([2, 1]);
    expect(doma.perPeriod[0]).toEqual([1, 1]);

    const venku = scoreboard(totals, "away");
    expect([venku.home, venku.away]).toEqual([1, 2]);
    expect(venku.perPeriod[0]).toEqual([1, 1]);
    expect(venku.perPeriod[1]).toEqual([0, 1]);
  });
});
