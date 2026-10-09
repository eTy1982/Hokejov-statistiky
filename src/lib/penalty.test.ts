import { describe, expect, it } from "vitest";
import {
  composeCode,
  effectiveCode,
  legacyCode,
  penaltyDurations,
  penaltyLabel,
  penaltyMinutes,
} from "./penalty";

describe("composeCode", () => {
  it("skládá hlavní a osobní trest", () => {
    expect(composeCode("2", null)).toBe("2");
    expect(composeCode("2+2", null)).toBe("2+2");
    expect(composeCode(null, "10")).toBe("10");
    expect(composeCode(null, "OK")).toBe("OK");
    expect(composeCode("2", "10")).toBe("2+10");
    expect(composeCode("5", "OK")).toBe("5+OK");
    expect(composeCode("2+2", "OK")).toBe("2+2+OK");
  });

  it("bez výběru není co zapsat", () => {
    expect(composeCode(null, null)).toBeNull();
  });
});

describe("penaltyMinutes – tabulka PIM ze zadání", () => {
  const expected: Record<string, number> = {
    "2": 2,
    "2+2": 4,
    "5": 5,
    "10": 10,
    OK: 20,
    "2+10": 12,
    "2+OK": 22,
    "5+10": 15,
    "5+OK": 25,
    "2+2+10": 14,
    "2+2+OK": 24,
  };

  for (const [code, minutes] of Object.entries(expected)) {
    it(`${code} = ${minutes} min`, () => {
      expect(penaltyMinutes(code)).toBe(minutes);
    });
  }

  it("záznam bez kódu nemá minuty", () => {
    expect(penaltyMinutes(null)).toBe(0);
  });
});

describe("penaltyDurations – co mění početní stav", () => {
  it("menší trest dvě minuty, velký pět", () => {
    expect(penaltyDurations("2")).toEqual([120]);
    expect(penaltyDurations("5")).toEqual([300]);
  });

  it("2+2 jsou dva menší tresty za sebou", () => {
    expect(penaltyDurations("2+2")).toEqual([120, 120]);
  });

  it("osobní trest sám počet hráčů nemění", () => {
    expect(penaltyDurations("10")).toEqual([]);
    expect(penaltyDurations("OK")).toEqual([]);
    expect(penaltyDurations(null)).toEqual([]);
  });

  it("s osobním trestem se počítá jen hlavní část", () => {
    expect(penaltyDurations("2+10")).toEqual([120]);
    expect(penaltyDurations("5+OK")).toEqual([300]);
    expect(penaltyDurations("2+2+OK")).toEqual([120, 120]);
  });

  it("neznámý kód raději nic nezmění", () => {
    expect(penaltyDurations("3")).toEqual([]);
    expect(penaltyDurations("nesmysl")).toEqual([]);
  });
});

describe("staré záznamy bez kódu", () => {
  it("kód se dopočítá z minut", () => {
    expect(legacyCode(2)).toBe("2");
    expect(legacyCode(4)).toBe("2+2");
    expect(legacyCode(5)).toBe("5");
    expect(legacyCode(null)).toBeNull();
    expect(legacyCode(7)).toBeNull();
  });

  it("effectiveCode dá přednost zapsanému kódu", () => {
    expect(effectiveCode({ penaltyCode: "2+10", penaltyMin: 12 })).toBe("2+10");
    expect(effectiveCode({ penaltyCode: null, penaltyMin: 2 })).toBe("2");
    expect(effectiveCode({ penaltyCode: null, penaltyMin: null })).toBeNull();
  });
});

describe("penaltyLabel", () => {
  it("popisuje trest česky", () => {
    expect(penaltyLabel("2")).toBe("2 min");
    expect(penaltyLabel("2+2")).toBe("2+2 min");
    expect(penaltyLabel("10")).toBe("10 min osobní");
    expect(penaltyLabel("OK")).toBe("do konce zápasu");
    expect(penaltyLabel("5+OK")).toBe("5 min + do konce zápasu");
    expect(penaltyLabel(null)).toBe("—");
  });
});
