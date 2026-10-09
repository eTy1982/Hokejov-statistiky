# Zadání pro Claude Code — zápis zápasu v2

Projekt: `Hokejov-statistiky` (Vite + React + TS + Tailwind 4, Supabase, PWA, nasazení Netlify).
Vzniklo 7. 10. 2026 v sezení nad projektem „Hokejové statistiky". Odsouhlaseno Liborem.
**Migrace databáze je hotová** (viz Krok 0), kód na ni může rovnou stavět.

**Maketa (klikací, platí jako vizuální předloha):** Design artefakt „Zápis zápasu – maketa",
`https://claude.ai/artifact/MQzKorGGj3jh9fzjLygc5T` — tři obrazovky (tablet, Fold rozložený,
Fold zavřený). Pokud ji z Code neotevřeš, stačí tenhle dokument; je v něm všechno podstatné.

## Proč se to dělá

Zapisuje jeden člověk (vedoucí mužstva) během zápasu, na tabletu nebo na **Samsung Galaxy
Z Fold 8** (rozložený i zavřený). Má plné ruce. Cíle:

1. **Méně doteků a žádné počítání z hlavy.** Tabule v halách odpočítává (20:00 → 0:00),
   Libor dnes čas gólu přepočítává na odehraný čas sám. Nově opíše tabuli, přepočet udělá aplikace.
2. **Stav hry u gólu se navrhne sám z trestů** — proto se nově zapisují tresty obou stran s časem.
3. **Časy začátků a konců třetin ve skutečném čase** — Libor je předává kondičnímu trenérovi
   kvůli datům z Catapultu (GPS/IMU jednotky hráčů běží ve skutečném čase).
4. **Obrazovka zápasu bez rolování** během hry, s okamžitou odezvou a bezpečným vracením.

## Co se NEMÁ dělat

- **Žádná běžící časomíra v aplikaci.** Libor nechce nic spouštět a zastavovat.
- **Nezapisovat střídání** ani čas na ledě. Jeden člověk to neuhlídá.
- **Nerozlišovat 5:3 / 5:4 / 4:4** — zůstává čtveřice `ev / pp / sh / en` (zamítnuto 22. 8.).
- **Needitovat ani nedoplňovat staré záznamy** (góly bez času, tresty bez času a kódu).
- **Nepřepočítávat existující výpočty v `stats.ts`** — jen přidat trestné minuty (viz Fáze 1).
- **Neřadit dlaždice do pětek.** Útoky a obranné dvojice se točí nezávisle (hlavní trenér
  točí útoky, asistent obrany), běžně 4 útoky a 3–4 dvojice. Proto dva nezávislé sloupce.

---

## Krok 0 — databáze (HOTOVO 7. 10. 2026, migrace `match_events_recorded_at_penalty_code_period_marks`)

```sql
alter table public.match_events
  add column if not exists recorded_at timestamptz,
  add column if not exists penalty_code text;

-- nové typy událostí
check (type = any (array['shot','save','goal_for','goal_against','penalty','so_attempt',
                         'period_start','period_end']))

-- skladba trestu
check (penalty_code is null or penalty_code ~ '^((2|2\+2|5)(\+(10|OK))?|10|OK)$')

-- značka třetiny musí mít skutečný čas
check (type not in ('period_start','period_end') or recorded_at is not null)
```

Ověřeno vložením a vrácením zkušebních řádků (4/4 kontroly). Stará verze aplikace běží dál:
nové sloupce nezná a `stats.ts` neznámé typy ve `switch` ignoruje.

Význam sloupců:

| Sloupec | Význam |
|---|---|
| `recorded_at` | skutečný čas ťuknutí na zařízení (ISO, `new Date().toISOString()`). Plní se u **každé nové** události. U `period_start` / `period_end` povinný. |
| `clock` | **odehraný** čas v třetině `mm:ss` — beze změny významu. Nikdy ne to, co ukazuje odpočítávající tabule. |
| `penalty_code` | `2`, `2+2`, `5`, `10`, `OK`, `2+10`, `2+OK`, `5+10`, `5+OK`, `2+2+10`, `2+2+OK`. NULL = starý záznam. |
| `penalty_min` | **trestné minuty celkem** (PIM). OK = 20. Tabulka níže. U starých záznamů 2 nebo 5. |
| `period` | beze změny: `1`, `2`, `3`, `P` (prodloužení), `SO`. Značky třetin mají period dané třetiny. |

| Kód | 2 | 2+2 | 5 | 10 | OK | 2+10 | 2+OK | 5+10 | 5+OK | 2+2+10 | 2+2+OK |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `penalty_min` | 2 | 4 | 5 | 10 | 20 | 12 | 22 | 15 | 25 | 14 | 24 |
| mění počet hráčů | 2 min | 2+2 min | 5 min | ne | ne | 2 min | 2 min | 5 min | 5 min | 2+2 min | 2+2 min |

*(Že se OK do trestných minut počítá jako 20, je běžná statistická konvence — Libor to nepotvrdil;
když bude u stolu nesoulad se svazem, je to první místo, kam se podívat.)*

---

## Fáze 1 — datová vrstva a logika (bez viditelných změn, s testy)

1. **`types.ts`:** `EventType` + `"period_start" | "period_end"`. `MatchEvent` + `recordedAt: string | null`,
   `penaltyCode: string | null`. `makeEvent` nastaví `recordedAt: new Date().toISOString()`,
   pokud není zadán. Konvence `Strength` v komentáři platí dál a je potvrzená: **vždy náš
   početní stav** (Libor 7. 10.: „dostali jsme góly i v naší přesilovce" = `goal_against + pp`).
2. **`sync.ts` — tři místa** (viz past v `CLAUDE.md`): `EventRow`, `eventToRow`, `rowToEvent`
   pro `recorded_at` a `penalty_code`. Lokální záznamy z IndexedDB, které pole nemají,
   čti jako `null` (`?? null`). Verzi IndexedDB není potřeba zvedat — ukládá celé objekty.
   **Ověřit na druhém zařízení**, že se oba sloupce dostanou na server a zpět.
3. **`src/lib/clock.ts` (nový, čisté funkce + testy):**
   - `periodLength(period)` → 1200 pro `1`/`2`/`3`, **300 pro `P`** (prodloužení v Maxa lize má 5 minut).
   - `boardToElapsed(boardDigits, period, countsDown)` → odehrané sekundy, nebo `null` když je
     čas na tabuli neplatný (sekundy ≥ 60, víc než délka třetiny). Číslice se zadávají jako na
     kalkulačce: `438` = `04:38`.
   - `elapsedToBoard(sec, period, countsDown)` pro zobrazení konce trestu.
   - `absoluteTime(period, sec)` → `1`–`3`: `(n−1)·1200 + sec`, `P`: `3600 + sec`.
4. **`src/lib/strength.ts` (nový, čistá funkce + testy):**
   `strengthAt(events, period, elapsedSec)` → `{ strength: "ev"|"pp"|"sh", ours: Penalty[], theirs: Penalty[] }`
   — návrh stavu hry z pohledu Dynama a seznam běžících trestů (pro vysvětlení a pro horní lištu).
   Pravidla (od Libora, hokejová pravidla):
   - Do početního stavu vstupují jen tresty **s časem** (`clock`) a jen jejich část 2 / 2+2 / 5.
     `10` a `OK` samotné stav nemění; `2+10` se chová jako `2`, `5+OK` jako `5`.
   - Starý záznam bez `penalty_code`: kód = `String(penalty_min)` (2 nebo 5).
   - **Gól týmu v přesilovce ukončí menší trest soupeře** (2 min). Když má soupeř víc trestů
     (5:3), ukončí **ten nejdřív udělený**. **Velký trest (5) běží dál** i po gólu.
   - **2+2** = dva menší tresty za sebou; gól ukončí ten právě běžící, druhý začne v čase gólu.
   - **Stejné tresty obou stran ve stejném čase se vzájemně ruší** (početní stav nemění, gól je neukončí).
   - Trest se stejným časem jako gól se v okamžiku gólu ještě nepočítá (odložený trest —
     Libor ho v takovém případě nezapisuje vůbec).
   - Tresty přecházejí přes konec třetiny (počítá se v absolutním čase).
   - Hráčů v poli nejméně 3: `max(3, 5 − počet běžících)`. Víc našich než jejich = `pp`,
     méně = `sh`, jinak `ev`. `en` se nikdy nenavrhuje — vybírá se ručně.
   Testovací případy (všechny musí projít):

   | # | Tresty | Gól / dotaz | Očekáváno |
   |---|---|---|---|
   | 1 | soupeř 2 v 1. tř. 03:10 | náš gól 1. tř. 04:40 | `pp`; trest soupeře končí 04:40 |
   | 2 | náš #7 2 v 1. tř. 09:30 | gól soupeře 11:00 | `sh`; náš trest končí 11:00 |
   | 3 | soupeř 2 v 05:00 a 2 v 06:00 | náš gól 06:30 → dotaz 06:45 | gól `pp`, skončí trest z 05:00; v 06:45 stále `pp` |
   | 4 | soupeř 5 v 10:00 | náš gól 11:00, další 12:00 | oba `pp` (velký trest běží dál) |
   | 5 | náš 2 + soupeř 2, oba 08:00 | gól 09:00 | `ev` |
   | 6 | náš `10` v 05:00 | gól soupeře 05:30 | `ev` |
   | 7 | soupeř `2+10` v 05:00 | náš gól 06:00 | `pp` (jako 2 min) |
   | 8 | soupeř `2+2` v 01:00 | náš gól 02:00, dotazy 03:30 a 04:30 | `pp`, `pp`, `ev` |
   | 9 | soupeř 2 v 1. tř. 19:30 | dotaz 2. tř. 01:00 | `pp` |
   | 10 | soupeř 2 v 08:00 | gól v 08:00 | `ev` |
   | 11 | trest bez `clock` | jakýkoli | trest se ignoruje |
   | 12 | soupeř 2 v `P` 01:00 | dotaz `P` 02:00 | `pp` |

5. **`stats.ts`:** přidat k hráči **trestné minuty** (`pim`, součet `penalty_min` u `side ≠ "opp"`),
   s testem. Do `StatsTable` a exportu jako sloupec „TM". Ostatní výpočty beze změny;
   `period_start` / `period_end` se ve statistikách neprojeví (ověřit testem).
6. **Odvozený stav třetiny** (`src/lib/periods.ts` nebo v `MatchScreen`): z neodstraněných
   značek seřazených podle `seq` → aktuální třetina, `running` / `break` / `pre`, seznam
   `{ period, start, end }` pro panel časů.

## Fáze 2 — obrazovka zápasu (`MatchScreen`, `PlayerTile`)

**Rozvržení** (bez rolování během hry; průběh, tabulka a exporty zůstávají pod tím):

```
┌ horní lišta (pevná) ─────────────────────────────────────────────┐
│ Dynamo B 2 : 1 Litoměřice │ 2. třetina [běží od 18:58:40] │ Střely 14:15 │ [Konec třetiny] │
│                           │ Přesilovka · soupeř 2, konec na tabuli 10:30   (nebo: odkaz „Časy třetin") │
├──────────────────────────────┬─────────────────────────────────────────┤
│ B  [33 na ledě] [30 střídačka]│ Ú1 [15] [22] [61]                        │
│ O1 [23] [29]                  │ Ú2 [59] [62] [93]                        │
│ O2 [7] [11]                   │ Ú3 [51] [67] [87]                        │
│ O3 [12] [53]                  │ Ú4 [4] [66] [86]                         │
│ O4 [43]                       │ (Ú5, když je v soupisce)                 │
├ spodní lišta (pevná) ────────────────────────────────────────────┤
│ [ Gól ] [ Obdržený gól ] [ Trest ] [ Vrátit · Střela #61 Rákos ] │
└──────────────────────────────────────────────────────────────────┘
```

- Sloupce v poměru **2fr : 3fr**. Řádky = `match_roster.line` podle postu **pro tento zápas**
  (`position` `O` → levý sloupec, `Ú` → pravý). Kolik dvojic/útoků je v soupisce, tolik řádků
  (běžně O1–O4, Ú1–Ú5). Hráč s `line = 0` mimo brankáře → řádek „bez lajny" na konci sloupce.
  Šířka dlaždice = 1/2 sloupce u obrany, 1/3 u útoků, i když je řádek neúplný (O4 s jedním hráčem).
- Barvy dlaždic podle čísla lajny zůstávají (`lineColor`).
- **Dlaždice:** velké číslo + **celé příjmení, nikdy neořezávat** (nejdelší v kádru
  „Pochobradský", 12 znaků). Písmo **Barlow Condensed** pro čísla a jména, Barlow pro UI —
  **zabalit do aplikace (`@fontsource/barlow-condensed`, `@fontsource/barlow`), ne z Google
  Fonts**: PWA musí fungovat offline v hale.
- **Ťuk** = střela / zákrok (jako dnes). **Podržení 550 ms** = dialog trestu pro toho hráče.
- **Brankáři jako dvě dlaždice** místo rozbalovacího seznamu „Brankář na ledě": ten na ledě
  má zelený rámeček a štítek „na ledě", druhý je ztlumený se štítkem „střídačka".
  Ťuk na brankáře na střídačce = **výměna brankáře** (jde vrátit tlačítkem Vrátit). Uložení
  aktivního brankáře zůstává v `localStorage` (`dynamo-stats-goalie-<matchId>`).
- **Oznámení po každém zápisu** (dole nad lištou, 3,5 s): „Střela #61 Rákos · [Vrátit]".
  Totéž po gólu, trestu, výměně brankáře i značce třetiny. iPad nevibruje, takže to je jediná
  jistá odezva.
- **Vrátit** ve spodní liště nese popisek poslední události („Vrátit · Trest soupeře 2 · 07:30").
  Dnešní „↩︎ Zpět" se pletlo s „← Zpět" na přehled.
- **Mimo běžící třetinu** jsou dlaždice ztlumené, ťuk ukáže „Třetina neběží – nejdřív ťukni
  Buly" a nic nezapíše; Gól / Obdržený / Trest jsou neaktivní. Vrátit funguje vždy.
- **Pryč:** přepínač třetin 1/2/3/P (nahrazen značkami, viz Fáze 3), filtr „Pětka",
  řádek „Gól se počítá i jako střela", emoji v tlačítkách.

**Tři velikosti** (změřeno na Liborově Foldu 7. 10. 2026, CSS px, hustota 2,625):

| Zařízení | Displej | Pro aplikaci zbývá zhruba | Rozvržení |
|---|---|---|---|
| Tablet na šířku | — | 1280 × 800 (předpoklad) | `wide`: popisky sloupců, nápověda, dialog vedle sebe |
| Fold rozložený | 933 × 704 | 933 × 664 | `fold`: menší písmo, dialog vedle sebe |
| Fold zavřený | 476 × 752 | 476 × 708 | `cover`: dvouřádková horní lišta, bez popisků řádků, dialog po krocích |

Přepínat podle šířky okna (≥ 1100 wide, ≥ 700 fold, jinak cover), ne podle zařízení.
Konkrétní rozměry písma a mezer jsou v maketě (`Z` v `Main.dc.html`); cover: číslo 25 px,
jméno 12 px, mezera 5 px.

## Fáze 3 — třetiny a jejich časy

- V horní liště jedno tlačítko podle stavu: **„Buly – 1. třetina"** (před zápasem),
  **„Konec třetiny"** (běží), **„Buly – 2. třetina" / „3. třetina" / „prodloužení"** (přestávka).
  Ťuk zapíše `period_start` / `period_end` s `recorded_at` = teď a tím **sám přepne třetinu**.
  Ručně se třetina už nepřepíná. Omylem ťuknutou značku vrátí Vrátit.
- Vedle názvu třetiny štítek „běží od 18:58:40" / „přestávka".
- **Panel „Časy třetin"** (odkaz pod třetinou; v zavřeném Foldu jen „Časy třetin"): každá
  třetina začátek – konec a délka v minutách, tlačítko **„Zkopírovat časy"** (text pro
  kondičního: `Dynamo B – Litoměřice 7. 10. 2026` + řádek na třetinu). Panel jde otevřít
  i po skončení zápasu.
- **XLSX export:** nový list „Časy třetin" (třetina, začátek, konec, délka).
- **Staré zápasy bez značek** (a odemčený ukončený zápas bez značek): zobraz původní ruční
  přepínač třetin, ať jdou dodatečně opravit. Jakmile zápas značky má, přepínač zmizí.

## Fáze 4 — dialog gólu (`GoalDialog`)

- **Čas z tabule:** velký displej „Na tabuli 04:38", klávesnice 1–9, C, 0, ⌫. Pod tím zeleně
  „= 15:22 odehraného času ve 2. třetině", červeně „Takový čas na tabuli být nemůže".
  Přepínač **„Tabule odpočítává / přičítá"**, výchozí odpočítává; pamatovat si ho v
  `localStorage` **podle haly** (`matches.venue`). Ukládá se odehraný čas do `clock`.
- **Upozornění (neblokuje):** když je odehraný čas dřív než předchozí gól ve stejné třetině —
  „Nezačala už další třetina, nebo je překlep?".
- **Stav hry:** tlačítka „5:5 / Přesilovka / Oslabení / Prázdná", nad nimi „Stav hry z pohledu
  Dynama". Po zadání platného času se **předvybere návrh ze `strengthAt`** a pod tlačítky je
  důvod („Podle trestů: přesilovka – soupeř 2 min od 07:30"). Ruční volba návrh přebije
  a zůstane, i když se pak změní čas.
- **Střelec → Asistence → Plus** s automatickým posunem: po výběru střelce se přepne na
  asistence, po druhé asistenci na plus. **Asistence nejsou povinné.** Uložit jde, jakmile je
  platný čas a střelec (u obdrženého: čas a brankář). Tlačítko „Uložit bez asistencí" zrušit.
- **Plus / minus po formacích:** řada tlačítek **Ú1–Ú4 (Ú5) a O1–O4 zvlášť** — jedním ťukem se
  označí celá formace, druhým odznačí; jednotlivé hráče (kdo zrovna střídal) jde odkliknout.
  Útok a obrana se míchají (3. útok s 1. obranou = dva ťuky). Střelec a asistenti mají plus
  vždy a odkliknout nejdou.
- Mřížka hráčů v dialogu má **stejné dvousloupcové rozvržení** jako hlavní obrazovka.
- **Zavřený Fold:** dialog přes celou obrazovku, záložky „Čas → Střelec → Asistence → Plus",
  na záložce Čas klávesnice, stav hry a tlačítko „Dál".

## Fáze 5 — dialog trestu (nahrazuje `PenaltyDialog` i `OpponentPenaltyDialog`)

- Otevírá se tlačítkem **Trest** ve spodní liště nebo **podržením dlaždice** (hráč předvybraný).
- Přepínač **Dynamo / Soupeř**.
- **Dynamo:** dvě řady — „Trest – mění počet hráčů": *žádný / 2 / 2+2 / 5*;
  „Osobní trest – počet hráčů nemění": *žádný / 10 / do konce* (= `OK`). Kód se složí
  (`2+10`, `5+OK`, `10` …); obojí „žádný" uložit nejde. Hráč povinný (mřížka jako u gólu,
  včetně brankářů). Pod tím věta, co se zapíše („Zapíše se 2+10. Gól soupeře v přesilovce
  trest ukončí.").
- **Soupeř:** jen *2 / 2+2 / 5*, hráč se nevybírá (`player_id = null`, jako dnes).
- **Čas z tabule povinný** u obou stran (stejný ovládací prvek jako u gólu) — bez času nejde
  spočítat stav hry. *Vědomá změna rozhodnutí z 22. 8. („trest soupeře na dva doteky, bez
  času") — Libor 7. 10. sám chce čas kvůli automatickému stavu hry.*
- Zápis: `type = "penalty"`, `side`, `player_id`, `clock`, `penalty_code`, `penalty_min` (PIM
  z tabulky výše), `recorded_at`.
- **Horní lišta** ukazuje běžící tresty k času posledního zapsaného gólu/trestu v třetině:
  „Přesilovka · soupeř 2, konec na tabuli 10:30" (konec přepočtený do formátu tabule; když
  trest přechází do další třetiny, napiš to). Neběží-li nic, je tam odkaz „Časy třetin".

## Hotovo, když

- [ ] `npm run test` a `npm run typecheck` projdou; nové testy pro `clock.ts`, `strength.ts`
      (všech 12 případů) a trestné minuty ve `stats.ts`.
- [ ] Na druhém zařízení se po synchronizaci objeví `recorded_at`, `penalty_code` i značky třetin
      (ověřit dotazem do `match_events`).
- [ ] Ve všech třech velikostech (1280×800, 933×664, 476×708) je obrazovka zápasu bez rolování,
      celé příjmení „Pochobradský" je vidět.
- [ ] Gól zadaný z tabule 11:15 ve 2. třetině se uloží jako `clock = 08:45`.
- [ ] Staré zápasy (bez značek, bez kódů trestů) se otevřou a statistiky vyjdou stejně jako dnes.
- [ ] Aplikace funguje offline (písma zabalená, žádné externí CSS).

Po nasazení se ozvi do projektu — Claude ověří data v Supabase a opraví `ARCHITEKTURA.md`.
