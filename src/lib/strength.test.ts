import { beforeEach, describe, expect, it } from "vitest";
import { absoluteTime, clockToSeconds } from "./clock";
import { penaltyMinutes } from "./penalty";
import { strengthAt } from "./strength";
import { makeEvent, type MatchEvent, type Period, type Side } from "./types";

const M = "match-1";

let seq = 0;
beforeEach(() => {
  seq = 0;
});

const pen = (
  side: Side,
  period: Period,
  clock: string | null,
  code: string,
  playerId: string | null = null,
): MatchEvent =>
  makeEvent({
    matchId: M,
    seq: seq++,
    period,
    type: "penalty",
    side,
    clock,
    penaltyCode: code,
    penaltyMin: penaltyMinutes(code),
    playerId,
  });

const goal = (scorer: Side, period: Period, clock: string): MatchEvent =>
  makeEvent({
    matchId: M,
    seq: seq++,
    period,
    type: scorer === "us" ? "goal_for" : "goal_against",
    clock,
  });

/** Dotaz „jaký je stav hry v tomhle okamžiku třetiny“. */
const at = (events: MatchEvent[], period: Period, clock: string) =>
  strengthAt(events, period, clockToSeconds(clock)!);

describe("strengthAt – dvanáct případů ze zadání", () => {
  it("1. náš gól v přesilovce ukončí menší trest soupeře", () => {
    const trest = pen("opp", "1", "03:10", "2");
    const events = [trest, goal("us", "1", "04:40")];

    const vGolu = at(events, "1", "04:40");
    expect(vGolu.strength).toBe("pp");
    expect(vGolu.theirs).toHaveLength(1);
    expect(vGolu.theirs[0]!.endsAt).toBe(absoluteTime("1", clockToSeconds("05:10")!));

    // Gól ho ukončil – hned po něm je plný počet.
    expect(at(events, "1", "04:41").strength).toBe("ev");
    // Bez gólu by běžel do konce.
    expect(at([trest], "1", "04:41").strength).toBe("pp");
  });

  it("2. gól soupeře v jeho přesilovce ukončí náš trest", () => {
    const events = [pen("us", "1", "09:30", "2", "p-7"), goal("opp", "1", "11:00")];

    const vGolu = at(events, "1", "11:00");
    expect(vGolu.strength).toBe("sh");
    expect(vGolu.ours).toHaveLength(1);
    expect(vGolu.ours[0]!.playerId).toBe("p-7");

    expect(at(events, "1", "11:01").strength).toBe("ev");
  });

  it("3. při dvou trestech skončí ten nejdřív udělený", () => {
    const events = [
      pen("opp", "1", "05:00", "2"),
      pen("opp", "1", "06:00", "2"),
      goal("us", "1", "06:30"),
    ];

    const vGolu = at(events, "1", "06:30");
    expect(vGolu.strength).toBe("pp");
    expect(vGolu.theirs).toHaveLength(2);
    expect(vGolu.theirSkaters).toBe(3); // 5:3

    const pozdeji = at(events, "1", "06:45");
    expect(pozdeji.strength).toBe("pp");
    expect(pozdeji.theirs).toHaveLength(1);
    expect(pozdeji.theirs[0]!.startedAt).toBe(absoluteTime("1", clockToSeconds("06:00")!));
  });

  it("4. velký trest běží dál i po gólu", () => {
    const events = [
      pen("opp", "1", "10:00", "5"),
      goal("us", "1", "11:00"),
      goal("us", "1", "12:00"),
    ];

    expect(at(events, "1", "11:00").strength).toBe("pp");
    expect(at(events, "1", "12:00").strength).toBe("pp");
    expect(at(events, "1", "14:59").strength).toBe("pp");
    expect(at(events, "1", "15:00").strength).toBe("ev");
  });

  it("5. stejné tresty obou stran ve stejném čase se ruší", () => {
    const events = [
      pen("us", "1", "08:00", "2", "p-7"),
      pen("opp", "1", "08:00", "2"),
      goal("us", "1", "09:00"),
    ];

    const stav = at(events, "1", "09:00");
    expect(stav.strength).toBe("ev");
    expect(stav.ours).toHaveLength(0);
    expect(stav.theirs).toHaveLength(0);

    // Gól je neukončil – po gólu je pořád plný počet, ne přesilovka.
    expect(at(events, "1", "09:30").strength).toBe("ev");
  });

  it("6. osobní trest 10 minut početní stav nemění", () => {
    const events = [pen("us", "1", "05:00", "10", "p-7"), goal("opp", "1", "05:30")];
    expect(at(events, "1", "05:30").strength).toBe("ev");
    expect(at(events, "1", "05:30").ours).toHaveLength(0);
  });

  it("7. 2+10 se chová jako dvě minuty", () => {
    const events = [pen("opp", "1", "05:00", "2+10"), goal("us", "1", "06:00")];
    expect(at(events, "1", "06:00").strength).toBe("pp");
    expect(at(events, "1", "06:01").strength).toBe("ev");
  });

  it("8. u 2+2 začne druhý trest v čase gólu", () => {
    const events = [pen("opp", "1", "01:00", "2+2"), goal("us", "1", "02:00")];

    const vGolu = at(events, "1", "02:00");
    expect(vGolu.strength).toBe("pp");
    expect(vGolu.theirs[0]!.hasNextPart).toBe(true);

    expect(at(events, "1", "03:30").strength).toBe("pp");
    expect(at(events, "1", "04:30").strength).toBe("ev");
  });

  it("9. trest přechází přes konec třetiny", () => {
    const events = [pen("opp", "1", "19:30", "2")];
    expect(at(events, "2", "01:00").strength).toBe("pp");
    expect(at(events, "2", "01:30").strength).toBe("ev");
  });

  it("10. trest ve stejném čase jako gól se ještě nepočítá", () => {
    const events = [pen("opp", "1", "08:00", "2"), goal("us", "1", "08:00")];
    expect(at(events, "1", "08:00").strength).toBe("ev");
    // O sekundu později už běží.
    expect(at(events, "1", "08:01").strength).toBe("pp");
  });

  it("11. trest bez času se ignoruje", () => {
    const events = [pen("opp", "1", null, "2"), goal("us", "1", "05:00")];
    const stav = at(events, "1", "05:00");
    expect(stav.strength).toBe("ev");
    expect(stav.theirs).toHaveLength(0);
  });

  it("12. v prodloužení to funguje stejně", () => {
    const events = [pen("opp", "P", "01:00", "2")];
    expect(at(events, "P", "02:00").strength).toBe("pp");
    expect(at(events, "P", "03:01").strength).toBe("ev");
  });
});

describe("strengthAt – počet hráčů v poli", () => {
  it("nejmíň tři hráči i při třech trestech", () => {
    const events = [
      pen("us", "1", "01:00", "2", "a"),
      pen("us", "1", "01:10", "2", "b"),
      pen("us", "1", "01:20", "2", "c"),
    ];
    const stav = at(events, "1", "01:30");
    expect(stav.ourSkaters).toBe(3);
    expect(stav.theirSkaters).toBe(5);
    expect(stav.strength).toBe("sh");
  });

  it("při stejném počtu trestů na obou stranách je plný počet", () => {
    // Tresty v různém čase se neruší, ale čtyři na čtyři je pořád plný počet.
    const events = [pen("us", "1", "01:00", "2", "a"), pen("opp", "1", "02:00", "2")];
    const stav = at(events, "1", "02:30");
    expect(stav.strength).toBe("ev");
    expect(stav.ourSkaters).toBe(4);
    expect(stav.theirSkaters).toBe(4);
  });

  it("gól při čtyřech na čtyři nic neukončí", () => {
    const events = [
      pen("us", "1", "01:00", "2", "a"),
      pen("opp", "1", "01:30", "2"),
      goal("us", "1", "02:00"),
    ];
    // Oba tresty doběhnou samy: náš ve 03:00, jejich ve 03:30.
    expect(at(events, "1", "02:30").strength).toBe("ev");
    // Náš doběhl první, takže krátkou chvíli jsme v přesilovce my.
    expect(at(events, "1", "03:10").strength).toBe("pp");
    expect(at(events, "1", "03:40").strength).toBe("ev");
  });
});

describe("strengthAt – starší zápisy a opravy", () => {
  it("trest bez kódu se čte z trestných minut", () => {
    const stary: MatchEvent = {
      ...pen("opp", "1", "05:00", "2"),
      penaltyCode: null,
      penaltyMin: 2,
    };
    expect(at([stary], "1", "06:00").strength).toBe("pp");
  });

  it("trest bez kódu i bez strany se bere jako náš", () => {
    const stary: MatchEvent = {
      ...pen("us", "1", "05:00", "2", "p-7"),
      penaltyCode: null,
      penaltyMin: 2,
      side: null,
    };
    const stav = at([stary], "1", "06:00");
    expect(stav.strength).toBe("sh");
    expect(stav.ours).toHaveLength(1);
  });

  it("smazaná událost se nepočítá", () => {
    const events = [{ ...pen("opp", "1", "05:00", "2"), deleted: true }];
    expect(at(events, "1", "06:00").strength).toBe("ev");
  });

  it("opravovaný gól si vlastní stav hry neovlivní", () => {
    const trest = pen("opp", "1", "05:00", "2");
    const puvodni = goal("us", "1", "05:30");
    const events = [trest, puvodni];

    // Bez vynechání by gól z 05:30 ukončil trest a v 06:00 by vyšlo ev.
    expect(at(events, "1", "06:00").strength).toBe("ev");
    expect(
      strengthAt(events, "1", clockToSeconds("06:00")!, { ignoreClientId: puvodni.clientId })
        .strength,
    ).toBe("pp");
  });

  it("nájezdy do početního stavu nevstupují", () => {
    const events = [pen("opp", "SO", "00:00", "2"), pen("opp", "1", "05:00", "2")];
    expect(at(events, "1", "06:00").theirs).toHaveLength(1);
  });

  it("prázdná branka se nikdy nenavrhne – tu vybírá zapisovatel ručně", () => {
    const events = [pen("opp", "1", "05:00", "2"), goal("us", "1", "06:00")];
    for (const clock of ["05:00", "06:00", "07:00", "19:59"]) {
      expect(["ev", "pp", "sh"]).toContain(at(events, "1", clock).strength);
    }
  });
});
