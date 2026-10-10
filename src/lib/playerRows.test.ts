import { describe, expect, it } from "vitest";
import { availableLines, playerRows } from "./playerRows";
import type { Participant, Position } from "./types";

let counter = 0;
const hrac = (position: Position, line: number): Participant => {
  counter += 1;
  return {
    rosterId: `r-${counter}`,
    id: `p-${counter}`,
    fullName: `Hráč ${counter}`,
    jerseyNumber: counter,
    position,
    line,
    isGuest: false,
  };
};

/** Běžná sestava: dva brankáři, čtyři obranné dvojice, čtyři útoky. */
const sestava = (): Participant[] => [
  hrac("B", 0),
  hrac("B", 0),
  ...[1, 2, 3, 4].flatMap((line) => [hrac("O", line), hrac("O", line)]),
  ...[1, 2, 3, 4].flatMap((line) => [hrac("Ú", line), hrac("Ú", line), hrac("Ú", line)]),
];

describe("playerRows – hlavní obrazovka (bez brankářů, vyrovnané sloupce)", () => {
  const options = { includeGoalies: false, balance: true } as const;

  it("brankáře do mřížky nedává", () => {
    const { left, right } = playerRows(sestava(), options);
    const vsichni = [...left, ...right].flatMap((row) => row.players);
    expect(vsichni.some((p) => p.position === "B")).toBe(false);
    expect(left[0]!.label).toBe("O1");
  });

  it("O1 stojí vedle Ú1, O2 vedle Ú2", () => {
    const { left, right } = playerRows(sestava(), options);
    expect(left.map((row) => row.label)).toEqual(["O1", "O2", "O3", "O4"]);
    expect(right.map((row) => row.label)).toEqual(["Ú1", "Ú2", "Ú3", "Ú4"]);
  });

  it("s pátým útokem dostane levý sloupec prázdný řádek navíc", () => {
    const sPatym = [...sestava(), hrac("Ú", 5), hrac("Ú", 5), hrac("Ú", 5)];
    const { left, right } = playerRows(sPatym, options);
    expect(right).toHaveLength(5);
    expect(left).toHaveLength(5);
    expect(left[4]!.players).toEqual([]);
    // Prvních pět řádků zůstává spárovaných.
    expect(left.slice(0, 4).map((row) => row.label)).toEqual(["O1", "O2", "O3", "O4"]);
  });

  it("chybějící obranná dvojice sloupce nerozhodí", () => {
    const bezO4 = sestava().filter((p) => !(p.position === "O" && p.line === 4));
    const { left, right } = playerRows(bezO4, options);
    expect(left).toHaveLength(right.length);
    expect(left.map((row) => row.label)).toEqual(["O1", "O2", "O3", ""]);
  });

  it("řádek bez lajny se do počtu započítá", () => {
    const sNahradnikem = [...sestava(), hrac("O", 0)];
    const { left, right } = playerRows(sNahradnikem, options);
    expect(left.map((row) => row.label)).toEqual(["O1", "O2", "O3", "O4", "–"]);
    expect(right).toHaveLength(5);
    expect(right[4]!.players).toEqual([]);
  });

  it("neúplná lajna si drží šířku dlaždic", () => {
    const sJednim = [hrac("O", 4), hrac("Ú", 1)];
    const { left, right } = playerRows(sJednim, options);
    expect(left[0]!.perRow).toBe(2);
    expect(right[0]!.perRow).toBe(3);
  });
});

describe("playerRows – dialogy", () => {
  it("brankáře ukazují dál", () => {
    const { left } = playerRows(sestava());
    expect(left[0]!.label).toBe("B");
    expect(left[0]!.players.every((p) => p.position === "B")).toBe(true);
  });

  it("bez dorovnání nevznikají prázdné řádky", () => {
    const sPatym = [...sestava(), hrac("Ú", 5)];
    const { left, right } = playerRows(sPatym);
    expect([...left, ...right].every((row) => row.players.length > 0)).toBe(true);
    expect(right).toHaveLength(5);
  });
});

describe("availableLines", () => {
  it("vrací jen lajny, které v sestavě jsou", () => {
    const bezO3 = sestava().filter((p) => !(p.position === "O" && p.line === 3));
    expect(availableLines(bezO3, "O")).toEqual([1, 2, 4]);
    expect(availableLines(bezO3, "Ú")).toEqual([1, 2, 3, 4]);
  });
});
