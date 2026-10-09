import { describe, expect, it } from "vitest";
import {
  absoluteTime,
  boardDisplay,
  boardToElapsed,
  clockToSeconds,
  elapsedToBoard,
  formatSeconds,
  fromAbsolute,
  periodLength,
} from "./clock";

describe("periodLength", () => {
  it("řádné třetiny mají 20 minut, prodloužení v Maxa lize 5", () => {
    expect(periodLength("1")).toBe(1200);
    expect(periodLength("2")).toBe(1200);
    expect(periodLength("3")).toBe(1200);
    expect(periodLength("P")).toBe(300);
  });

  it("nájezdy čas neměří", () => {
    expect(periodLength("SO")).toBe(0);
  });
});

describe("boardDisplay – číslice jako na kalkulačce", () => {
  it("doplní zleva nulami", () => {
    expect(boardDisplay("438")).toBe("04:38");
    expect(boardDisplay("7")).toBe("00:07");
    expect(boardDisplay("1115")).toBe("11:15");
  });

  it("prázdný vstup nemá co zobrazit", () => {
    expect(boardDisplay("")).toBeNull();
    expect(boardDisplay("abc")).toBeNull();
  });
});

describe("boardToElapsed – odpočítávající tabule", () => {
  it("opíše tabuli a vrátí odehraný čas", () => {
    // Kontrola ze zadání: tabule 11:15 ve 2. třetině = 08:45 odehraného času.
    expect(boardToElapsed("1115", "2", true)).toBe(8 * 60 + 45);
    expect(formatSeconds(boardToElapsed("1115", "2", true)!)).toBe("08:45");
  });

  it("začátek a konec třetiny", () => {
    expect(boardToElapsed("2000", "1", true)).toBe(0);
    expect(boardToElapsed("0", "1", true)).toBe(1200);
  });

  it("prodloužení se počítá z pěti minut", () => {
    expect(boardToElapsed("500", "P", true)).toBe(0);
    expect(boardToElapsed("130", "P", true)).toBe(210);
  });

  it("přičítající tabule se bere, jak je", () => {
    expect(boardToElapsed("845", "2", false)).toBe(8 * 60 + 45);
    expect(boardToElapsed("2000", "1", false)).toBe(1200);
  });

  it("sekundy od 60 výš na tabuli svítit nemohou", () => {
    expect(boardToElapsed("460", "1", true)).toBeNull();
    expect(boardToElapsed("199", "1", true)).toBeNull();
  });

  it("čas delší než třetina je neplatný", () => {
    expect(boardToElapsed("2100", "1", true)).toBeNull();
    expect(boardToElapsed("600", "P", true)).toBeNull();
    expect(boardToElapsed("1000", "P", false)).toBeNull();
  });

  it("prázdný vstup je neplatný", () => {
    expect(boardToElapsed("", "1", true)).toBeNull();
  });
});

describe("elapsedToBoard – zpátky na tabuli", () => {
  it("převede konec trestu do formátu tabule", () => {
    expect(elapsedToBoard(8 * 60 + 45, "2", true)).toBe("11:15");
    expect(elapsedToBoard(8 * 60 + 45, "2", false)).toBe("08:45");
  });

  it("mimo rozsah třetiny se přitlačí k okraji", () => {
    expect(elapsedToBoard(-10, "1", true)).toBe("20:00");
    expect(elapsedToBoard(5000, "1", true)).toBe("00:00");
  });
});

describe("clockToSeconds – čtení uloženého času", () => {
  it("rozumí mm:ss", () => {
    expect(clockToSeconds("08:45")).toBe(525);
    expect(clockToSeconds("00:00")).toBe(0);
  });

  it("záznam bez času vrací null", () => {
    expect(clockToSeconds(null)).toBeNull();
    expect(clockToSeconds("")).toBeNull();
    expect(clockToSeconds("nesmysl")).toBeNull();
    expect(clockToSeconds("04:71")).toBeNull();
  });
});

describe("absoluteTime a fromAbsolute", () => {
  it("skládá čas od začátku zápasu", () => {
    expect(absoluteTime("1", 190)).toBe(190);
    expect(absoluteTime("2", 60)).toBe(1260);
    expect(absoluteTime("3", 0)).toBe(2400);
    expect(absoluteTime("P", 60)).toBe(3660);
  });

  it("je to obousměrné", () => {
    for (const [period, sec] of [["1", 190], ["2", 60], ["3", 1199], ["P", 299]] as const) {
      expect(fromAbsolute(absoluteTime(period, sec))).toEqual({ period, sec });
    }
  });

  it("hranice třetin padnou na začátek té další", () => {
    expect(fromAbsolute(1200)).toEqual({ period: "2", sec: 0 });
    expect(fromAbsolute(2400)).toEqual({ period: "3", sec: 0 });
    expect(fromAbsolute(3600)).toEqual({ period: "P", sec: 0 });
  });
});
