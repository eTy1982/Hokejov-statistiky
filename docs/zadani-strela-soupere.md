# Zadání pro Claude Code — střela soupeře místo dlaždic brankářů

Navazuje na `docs/zadani-zapis-v2.md` (nasazeno 9. 10. 2026, merge `25cd1e1`). Nápad od Libora
9. 10. večer při zkoušení na Foldu, odsouhlaseno. **Databáze se nemění** — zápis zůstává
událost `save` s `goalie_id`.

## Proč

1. **Brankáři v levém sloupci posouvají obrany o řádek dolů** — O1 stojí vedle Ú2, ne vedle Ú1.
   Oko pak hledá řadu, která neodpovídá. Bez brankářů jsou řádky O1–Ú1, O2–Ú2… v jedné výšce.
2. **Brankář se během zápasu mění jednou, dvakrát** — nepotřebuje dvě dlaždice v mřížce.
   Stačí určit, kdo je na ledě.
3. **Zákrok je spolu s naší střelou nejčastější ťuknutí** (25–35× za zápas) — zaslouží si velké
   tlačítko na pevném místě u palce, ne dlaždici v rohu mřížky.

## Co udělat

### 1. Mřížka bez brankářů (`playerRows.ts`, `PlayerGrid.tsx`)

- `playerRows` brankáře do levého sloupce nedává (`position === "B"` vynechat).
- **Oba sloupce mají stejný počet řádků** = větší z obou (typicky 4, s pátým útokem 5).
  Kratší sloupec dostane na konci prázdný řádek, ať O1 stojí přesně vedle Ú1 atd.
  Řádek „–" (hráči bez lajny) se do počtu započítá.
- Dialogy (`ParticipantPicker`) brankáře **dál ukazují** — u obdrženého gólu a u trestu brankáře
  vybrat jde. Týká se to jen hlavní obrazovky zápasu.

### 2. Lišta brankáře nad spodní lištou (`MatchScreen.tsx`)

Nový pevný řádek mezi mřížkou a spodní lištou, přes celou šířku:

```
┌──────────────┬─────────────────────────────────────────────┐
│ ⇄ B #33      │        Střela soupeře                       │
│   Matěcha    │        zákrok · #33 Matěcha · 14            │
└──────────────┴─────────────────────────────────────────────┘
[ Gól ] [ Obdržený gól ] [ Trest ] [ Vrátit · … ]
```

- **Vlevo přepínač brankáře** (zhruba ¼ šířky): číslo a příjmení brankáře na ledě, ikona výměny.
  Ťuk = na led jde druhý brankář. Jsou-li v soupisce tři, otevře se malý výběr. Výměna dál jde
  vrátit tlačítkem Vrátit (dnešní `undoStack` s `kind: "goalie"`) a ukáže oznámení
  „Na ledě #30 Tuláček".
- **Vpravo velké tlačítko „Střela soupeře"** (zbytek šířky, výška jako řádek dlaždic, nejméně
  56 px). Ťuk = událost `save` s `goalieId` brankáře na ledě — totéž, co dnes ťuk na dlaždici
  brankáře. Druhý řádek popisku: „zákrok · #33 Matěcha · 14" (počet zákroků toho brankáře).
  Oznámení po ťuku jako dnes („Zákrok #33 Matěcha").
- **Barva:** tmavá jako dosavadní dlaždice brankáře (`lineColor(0, true)`), ať se nesplete
  s Gólem a Obdrženým. Mimo běžící třetinu ztlumené stejně jako dlaždice.
- **Výchozí brankář na ledě:** soupiska neříká, kdo chytá (oba brankáři mají `line = 0`
  a `sortParticipants` je řadí podle čísla dresu). Proto: když v `localStorage` nic není,
  ťuk na **„Buly – 1. třetina"** se nejdřív zeptá **„Kdo chytá?"** — dvě velké dlaždice
  brankářů, výběr rovnou uloží značku třetiny. Je-li v soupisce jen jeden brankář, neptej se.
  Bez brankáře v soupisce je tlačítko neaktivní s popiskem „Chybí brankář v sestavě".
- **Trest brankáři:** dlouhý stisk na přepínači brankáře otevře dialog trestu s tímhle brankářem
  (náhrada za dlouhý stisk jeho dlaždice). Jinak přes tlačítko Trest a výběr v dialogu.
- **Zavřený Fold (cover):** stejné rozvržení, přepínač zkrátit na „⇄ 33".

### 3. Co zůstává

- Nápověda pod mřížkou (wide): „Ťuk = střela / zákrok…" → „Ťuk = naše střela · podržet = trest".
- Statistiky a výpočty beze změny — zákroky se počítají z `save` jako dosud.
- Gól do naší branky se zapisuje dál přes „Obdržený gól", ne přes „Střela soupeře" (gól se
  jako střela započítá sám). Střely mimo branku se nezapisují.

## Hotovo, když

- [ ] Na Foldu zavřeném (476×708), rozloženém (933×664) i na tabletu stojí O1 vedle Ú1, O2 vedle
      Ú2 atd., i když je v sestavě pátý útok.
- [ ] Ťuk na „Střela soupeře" zapíše `save` s brankářem na ledě; po výměně brankáře jde další
      zákrok novému brankáři; Vrátit vrátí výměnu i zákrok.
- [ ] Nový zápas bez uloženého brankáře se při prvním buly zeptá, kdo chytá; se dvěma brankáři
      je to jediný ťuk navíc za celý zápas.
- [ ] `npm run test` a `npm run typecheck` projdou; test pro `playerRows` (bez brankářů,
      vyrovnaný počet řádků).
