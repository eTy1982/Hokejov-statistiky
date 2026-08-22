# Hokejové statistiky — pokyny pro Claude Code

Aplikace na zápis statistik hokejového zápasu z tabletu. Používá ji **jeden člověk během
utkání** — vedoucí mužstva HC Dynamo Pardubice B. Píše se česky: rozhraní, komentáře i commity.

**Přečti si nejdřív `README.md`** — je v něm datový model, ovládání a jak funguje synchronizace.
Tenhle soubor jen doplňuje to, co z kódu není vidět.

## Příkazy

```bash
npm run dev         # vývojový server
npm run test        # vitest, musí projít před každým nasazením
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
```

## Pasti, na které se dá naletět

**`src/lib/sync.ts` mapuje sloupce vyjmenovaně.** Nové pole v `MatchEvent` je nutné přidat
na tři místa: do typu `EventRow`, do `eventToRow` a do `rowToEvent`. Když se to neudělá,
hodnota se uloží lokálně, ale na server se nikdy nedostane — a lokálně přitom všechno
vypadá v pořádku. **Ověřuje se jedině na druhém zařízení.**

**Gól se už započítává jako střela.** `stats.ts` řádek 156, `bump(shooter.shots, p)`.
Totéž na druhé straně u obdrženého gólu. Vypadá to jako chyba, když se člověk dívá na surová
data v databázi, kde jsou `shot` a `goal_for` odděleně. Není. Neopravovat.

**`matches` nemají soft delete.** `match_events` ho mají (`deleted`), zápasy ne, takže se
mazání zápasu nepropíše mezi zařízeními ani mezi mobilem a serverem. Známá mezera,
oprava vyžaduje `matches.deleted` plus filtr v aplikaci — před zásahem se zeptej.

**Migrace nejsou v gitu.** Složka `supabase/` neexistuje, schéma se mění přímo v Supabase
mimo tenhle repozitář. Když změna potřebuje nový sloupec, **napiš to a počkej** — nespouštěj
migraci a nepiš kód, který na neexistující sloupec spoléhá.

**`legacy/app.js`** je předchozí jednosouborová verze bez Supabase. Needitovat, needitovat
ani nepoužívat jako vzor.

## Konvence datového modelu

- `match_roster.line = 0` jsou **brankáři**, 1–4 formace. Neúplné lajny jsou v pořádku.
- `position` jen `B` / `O` / `Ú`. `matches.status` jen `live` / `finished`.
- Pětka i číslo dresu patří k zápasu, ne k hráči.
- Události mimo řádné třetiny (`SO`) se do klasických statistik nezapočítávají.

## Hranice — na tohle se ptej, nedělej to sám

- **Nepřidávej pole, která musí zapisovatel vyplňovat během zápasu.** Zapisuje jeden člověk
  a má plné ruce; každé pole navíc jde na úkor přesnosti všeho ostatního. Rozsah zápisu
  je věcné rozhodnutí, ne technické.
- **Neměň schéma databáze.**
- **Nepřepisuj výpočty ve `stats.ts`** bez zadání — mají testy a stojí na nich čísla,
  kterými se u podpisu zápisu konfrontuje oficiální statistik.

## Nasazení

Netlify staví z GitHubu, `npm run build` → `dist`. **Merge do hlavní větve znamená nasazení.**
Service worker se necachuje (viz `netlify.toml`), takže zařízení dostanou novou verzi hned.

## Kde je „proč"

Rozhodnutí, zamítnuté nápady a hokejový kontext nejsou tady, ale v projektu
**„Hokejové statistiky"** na claude.ai — soubory `PROVOZ.md`, `ARCHITEKTURA.md`, `DATA.md`,
`STAV.md` a `DENIK.md`. Když něco v kódu vypadá jako zbytečné omezení, je pravděpodobné,
že důvod je zapsaný tam.
