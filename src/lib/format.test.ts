import { describe, expect, it } from "vitest";
import { buildParticipants, normalizeClock, playerLabel } from "./format";
import type { Player, RosterEntry } from "./types";

const player = (over: Partial<Player> & Pick<Player, "id" | "fullName">): Player => ({
  jerseyNumber: null,
  position: "Ú",
  personType: "hrac",
  isActive: true,
  ...over,
});

const entry = (over: Partial<RosterEntry> & Pick<RosterEntry, "id">): RosterEntry => ({
  matchId: "m1",
  playerId: null,
  guestId: null,
  jerseyNumber: null,
  line: 0,
  position: "Ú",
  ...over,
});

const NOVAK = player({ id: "p1", fullName: "Jan Novák", jerseyNumber: 12 });
const GOLMAN = player({ id: "p2", fullName: "Petr Brána", jerseyNumber: 30, position: "B" });

describe("buildParticipants", () => {
  const players = new Map([NOVAK, GOLMAN].map((p) => [p.id, p]));

  it("bere číslo dresu ze sestavy zápasu, ne od hráče", () => {
    const [p] = buildParticipants(
      [entry({ id: "r1", playerId: "p1", jerseyNumber: 21, line: 2 })],
      players,
      new Map(),
    );
    expect(p!.jerseyNumber).toBe(21); // ne 12
    expect(p!.fullName).toBe("Jan Novák");
    expect(p!.isGuest).toBe(false);
  });

  it("bez čísla v sestavě padá zpět na číslo hráče", () => {
    const [p] = buildParticipants([entry({ id: "r1", playerId: "p1" })], players, new Map());
    expect(p!.jerseyNumber).toBe(12);
  });

  it("sjednotí kmenové i hostující hráče do jednoho seznamu", () => {
    const guests = new Map([["g1", { fullName: "Junior Malý" }]]);
    const list = buildParticipants(
      [
        entry({ id: "r1", playerId: "p1", jerseyNumber: 12 }),
        entry({ id: "r2", guestId: "g1", jerseyNumber: 21 }),
      ],
      players,
      guests,
    );
    expect(list).toHaveLength(2);
    const guest = list.find((p) => p.isGuest);
    expect(guest?.fullName).toBe("Junior Malý");
    expect(guest?.jerseyNumber).toBe(21);
    expect(guest?.id).toBe("g1"); // na tohle odkazují události
  });

  it("host smí nosit číslo zraněného kmenového hráče, když ten nehraje", () => {
    const guests = new Map([["g1", { fullName: "Junior Malý" }]]);
    const list = buildParticipants(
      [entry({ id: "r2", guestId: "g1", jerseyNumber: 12 })],
      players,
      guests,
    );
    expect(list[0]!.jerseyNumber).toBe(12);
    expect(list[0]!.isGuest).toBe(true);
  });

  it("přeskočí hráče, který se ještě nestáhl ze serveru", () => {
    const list = buildParticipants([entry({ id: "r9", playerId: "neznamy" })], players, new Map());
    expect(list).toEqual([]);
  });

  it("řadí brankáře první, pak podle pětky a čísla", () => {
    const list = buildParticipants(
      [
        entry({ id: "r1", playerId: "p1", jerseyNumber: 12, line: 2 }),
        entry({ id: "r2", playerId: "p2", jerseyNumber: 30, position: "B" }),
      ],
      players,
      new Map(),
    );
    expect(list.map((p) => p.position)).toEqual(["B", "Ú"]);
  });
});

describe("normalizeClock", () => {
  it("doplní tvar mm:ss", () => {
    expect(normalizeClock("123")).toBe("01:23");
    expect(normalizeClock("1234")).toBe("12:34");
    expect(normalizeClock("7")).toBe("00:07");
  });

  it("ořízne sekundy nad 59", () => {
    expect(normalizeClock("1299")).toBe("12:59");
  });

  it("prázdný vstup nechá bez času", () => {
    expect(normalizeClock("")).toBeNull();
  });
});

describe("playerLabel", () => {
  it("spojí číslo a jméno", () => {
    expect(playerLabel({ fullName: "Jan Novák", jerseyNumber: 12 })).toBe("#12 Jan Novák");
  });

  it("bez čísla vypíše jen jméno", () => {
    expect(playerLabel({ fullName: "Jan Novák", jerseyNumber: null })).toBe("Jan Novák");
  });
});
