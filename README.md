# Dynamo – hokejové statistiky

Zápis statistik hokejového zápasu z tabletu nebo telefonu. Funguje i bez signálu,
data se synchronizují do sdílené databáze a jsou dostupná ze všech zařízení.

## Jak to funguje

**Zdrojem pravdy jsou události, ne součty.** Každé ťuknutí uloží jednu událost
(střela, zákrok, gól, trest, nájezd) a všechny statistiky – včetně skóre, střel
a SV% – se z nich pokaždé znovu dopočítají ([`src/lib/stats.ts`](src/lib/stats.ts)).
Díky tomu nemůže oprava ani smazání události rozhodit součty, což byla hlavní
slabina předchozí verze.

**Zapisuje se lokálně, synchronizuje na pozadí.** Zápis jde vždy do IndexedDB
([`src/lib/db.ts`](src/lib/db.ts)) a nikdy nečeká na síť. Synchronizace
([`src/lib/sync.ts`](src/lib/sync.ts)) běží po startu, při návratu signálu a jinak
každých 30 s. Každý záznam má UUID vygenerované v zařízení, takže opakované
odeslání po výpadku data přepíše, nikdy nezduplikuje.

## Ovládání

| Akce | Ovládání |
| --- | --- |
| Střela hráče / zákrok brankáře | krátké ťuknutí na dlaždici |
| Trest | dlouhý stisk dlaždice (0,5 s) |
| Gól vstřelený / obdržený | tlačítko pod dlaždicemi |
| Oprava poslední události | tlačítko **Zpět** |
| Oprava libovolného gólu | ✏️ u události v průběhu zápasu |

Gól se počítá **i jako střela na branku** – stejně jako se obdržený gól počítá do
střel soupeře. Obě strany ukazatele „Střely“ tak měří totéž.

## Databáze

Aplikace sdílí Supabase projekt `dynamo-b-sklad` se skladovou aplikací:

- **sdílí** `players` (kmenové hráče stačí založit jednou) a `seasons`
- **přidává** `matches`, `match_roster`, `match_events`, `guest_players`

Přístup hlídá RLS přes `is_authorized_user()` – stejný model jako zbytek projektu.
Přihlašuje se stejným účtem jako do skladu; e-mail musí být v `app_users` s `active = true`.

### Sestava, čísla dresů a výpomoc

**Pětka i číslo dresu patří k zápasu** (`match_roster`), ne k hráči. Při marodce si
výpomoc bere dres zraněného a přečíslují se i kmenoví hráči, takže jedině takhle
zůstane historie věrná tomu, kdo v jakém čísle skutečně hrál. Databáze hlídá, že
jedno číslo nosí v zápase právě jeden hráč.

**Hostující hráči** (výpomoc z juniorky) jsou v `guest_players`, ne v `players` –
skladová aplikace dělá `from('players').select('*')` bez filtru, takže cokoliv
přidaného do `players` by se jí objevilo v seznamu pro výdej vybavení. Do dalšího
zápasu se výpomoc nepřebírá; sestava se jinak nabízí podle minulého zápasu.

Události proto odkazují na `players.id` i `guest_players.id` a jedním cizím klíčem
je pokrýt nejde – členství v zápase drží `match_roster`, integritu hlídá aplikace.

## Vývoj

```bash
npm install
npm run dev
```

Další příkazy: `npm test` (testy výpočtu statistik), `npm run typecheck`, `npm run build`.

Publikovatelný Supabase klíč je v [`src/lib/config.ts`](src/lib/config.ts). Do klientského
kódu patří – data chrání RLS, ne utajení klíče. Jde přebít proměnnými
`VITE_SUPABASE_URL` a `VITE_SUPABASE_KEY`.

> SheetJS se instaluje z `cdn.sheetjs.com`, ne z npm – verze na npm (0.18.5) má
> neopravené zranitelnosti. Build tedy potřebuje přístup na tuto doménu.

## Nasazení

Push do `main` spustí [workflow](.github/workflows/deploy.yml), který zkontroluje typy,
pustí testy a nasadí na GitHub Pages. Jednorázově je potřeba v repozitáři zapnout
**Settings → Pages → Source: GitHub Actions**.

Na tabletu pak stačí web otevřít a dát *Přidat na plochu* – aplikace se nainstaluje
jako PWA a funguje offline.

## Původní verze

Aplikace v jednom souboru je zachovaná v [`legacy/`](legacy/). Data z ní se
automaticky nepřenášejí – běžela jen v `localStorage` daného zařízení.
