import { beforeEach, describe, expect, it } from "vitest";
import { periodState, spanMinutes } from "./periods";
import { makeEvent, type MatchEvent, type RegularPeriod } from "./types";

const M = "match-1";

let seq = 0;
beforeEach(() => {
  seq = 0;
});

const mark = (
  type: "period_start" | "period_end",
  period: RegularPeriod,
  time: string,
): MatchEvent =>
  makeEvent({ matchId: M, seq: seq++, period, type, recordedAt: `2026-10-07T${time}.000Z` });

const shot = (period: RegularPeriod): MatchEvent =>
  makeEvent({ matchId: M, seq: seq++, period, type: "shot", playerId: "p-1" });

describe("periodState", () => {
  it("před zápasem nabídne buly první třetiny", () => {
    const stav = periodState([]);
    expect(stav.phase).toBe("pre");
    expect(stav.hasMarks).toBe(false);
    expect(stav.next).toBe("1");
    expect(stav.running).toBeNull();
  });

  it("zápas bez značek se pozná, i když se v něm zapisovalo", () => {
    const stav = periodState([shot("1"), shot("2")]);
    expect(stav.hasMarks).toBe(false);
    expect(stav.phase).toBe("pre");
  });

  it("po buly třetina běží a ví se odkdy", () => {
    const stav = periodState([mark("period_start", "1", "17:00:00")]);
    expect(stav.phase).toBe("running");
    expect(stav.running).toBe("1");
    expect(stav.runningSince).toBe("2026-10-07T17:00:00.000Z");
    expect(stav.next).toBeNull();
  });

  it("po konci třetiny je přestávka a nabídne se další", () => {
    const stav = periodState([
      mark("period_start", "1", "17:00:00"),
      mark("period_end", "1", "17:28:00"),
    ]);
    expect(stav.phase).toBe("break");
    expect(stav.running).toBeNull();
    expect(stav.last).toBe("1");
    expect(stav.next).toBe("2");
  });

  it("buly druhé třetiny samo přepne třetinu", () => {
    const stav = periodState([
      mark("period_start", "1", "17:00:00"),
      mark("period_end", "1", "17:28:00"),
      mark("period_start", "2", "17:45:00"),
    ]);
    expect(stav.phase).toBe("running");
    expect(stav.running).toBe("2");
  });

  it("po třetí třetině nabídne prodloužení a po něm už nic", () => {
    const base = [
      mark("period_start", "1", "17:00:00"),
      mark("period_end", "1", "17:28:00"),
      mark("period_start", "2", "17:45:00"),
      mark("period_end", "2", "18:13:00"),
      mark("period_start", "3", "18:30:00"),
      mark("period_end", "3", "18:58:00"),
    ];
    expect(periodState(base).next).toBe("P");

    const sProdlouzenim = [
      ...base,
      mark("period_start", "P", "19:05:00"),
      mark("period_end", "P", "19:10:00"),
    ];
    expect(periodState(sProdlouzenim).next).toBeNull();
    expect(periodState(sProdlouzenim).last).toBe("P");
  });

  it("sestaví časy třetin pro kondičního trenéra", () => {
    const stav = periodState([
      mark("period_start", "1", "17:00:00"),
      mark("period_end", "1", "17:28:30"),
      mark("period_start", "2", "17:45:00"),
    ]);
    expect(stav.spans).toEqual([
      { period: "1", start: "2026-10-07T17:00:00.000Z", end: "2026-10-07T17:28:30.000Z" },
      { period: "2", start: "2026-10-07T17:45:00.000Z", end: null },
    ]);
    expect(spanMinutes(stav.spans[0]!)).toBe(29); // 28,5 min se zaokrouhlí
    expect(spanMinutes(stav.spans[1]!)).toBeNull();
  });

  it("vrácená značka se nepočítá", () => {
    const buly = mark("period_start", "1", "17:00:00");
    const stav = periodState([{ ...buly, deleted: true }]);
    expect(stav.hasMarks).toBe(false);
    expect(stav.next).toBe("1");
  });

  it("konec bez začátku nemá co uzavřít", () => {
    const stav = periodState([mark("period_end", "1", "17:28:00")]);
    expect(stav.spans).toEqual([]);
    expect(stav.phase).toBe("break");
    expect(stav.next).toBe("1");
  });

  it("rozhoduje seq, ne pořadí v poli", () => {
    const marks = [
      mark("period_start", "1", "17:00:00"),
      mark("period_end", "1", "17:28:00"),
    ];
    expect(periodState([...marks].reverse())).toEqual(periodState(marks));
  });

  it("značky nájezdů stav třetin neovlivní", () => {
    const so = makeEvent({
      matchId: M,
      seq: 99,
      period: "SO",
      type: "so_attempt",
      playerId: "p-1",
      soResult: "goal",
      soRound: 1,
    });
    const stav = periodState([mark("period_start", "1", "17:00:00"), so]);
    expect(stav.running).toBe("1");
  });
});
