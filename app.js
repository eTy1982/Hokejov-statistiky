// === HOKEJ STATISTIKY APP – FINÁLNÍ VERZE ===
const root = document.getElementById("root");

// ==== Stav ====
let hraci = []; // {id, jmeno: "12 Novák", typ: "B|O|Ú", petka: 1..5}
let aktivniTretina = "1";
let aktualniAkce = "strely";
let infoZapasu = { datum: "", cas: "", misto: "", tym: "domaci" }; // domaci|host
let statistiky = {}; // per hráč: strely/goly/asistence/plus/minus/tresty/zasahy/obdrzene po třetinách
let goloveUdalosti = []; // {typ:"g"|"o", cas, tretina, strelec?, asistenti[], plus[], minus[]}
let aktivniPetka = 0; // 0 = všichni, 1..5 = filtr
let zamknuto = false; // po ukončení zápasu read-only
let undoStack = []; // zásobník posledních akcí (max 10)
let overlay = null; // {mode: "g"|"o", eventIndex: number}
let wakelockSentinel = null;

// barvy pětek
function barvaPetky(p) {
  switch (Number(p)) {
    case 1: return "bg-blue-600";
    case 2: return "bg-green-600";
    case 3: return "bg-yellow-600";
    case 4: return "bg-red-600";
    case 5: return "bg-purple-600";
    default: return "bg-gray-600";
  }
}

// === Util ===
function pridejCas(popis) {
  const cas = prompt(`${popis} (mm:ss)`, "00:00");
  return cas || "00:00";
}
function ziskejCisloZJmena(j) {
  if (!j) return "?";
  const parts = j.trim().split(/\s+/);
  return parts[0] || "?";
}
function ziskejJmeno(id) {
  const h = hraci.find(x => x.id === id);
  return h ? ziskejCisloZJmena(h.jmeno) : "?";
}
function vibrate(ms = 30) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
}

// === Autosave ===
const LS_KEY = "hokej-statistiky:rozpracovano";
const LS_ARCH = "hokej-statistiky:archiv";

function saveState() {
  const data = {
    hraci, aktivniTretina, aktualniAkce, infoZapasu,
    statistiky, goloveUdalosti, aktivniPetka, zamknuto
  };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}
function tryLoadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    hraci = data.hraci || [];
    aktivniTretina = data.aktivniTretina || "1";
    aktualniAkce = data.aktualniAkce || "strely";
    infoZapasu = data.infoZapasu || infoZapasu;
    statistiky = data.statistiky || {};
    goloveUdalosti = data.goloveUdalosti || [];
    aktivniPetka = data.aktivniPetka || 0;
    zamknuto = !!data.zamknuto;
    return true;
  } catch { return false; }
}
function clearState() { localStorage.removeItem(LS_KEY); }

// === Archiv ===
function loadArchiv() {
  try { return JSON.parse(localStorage.getItem(LS_ARCH) || "[]"); } catch { return []; }
}
function saveArchiv(list) {
  localStorage.setItem(LS_ARCH, JSON.stringify(list));
}
function archivujZapasyAdd(zapis) {
  const arch = loadArchiv();
  arch.unshift(zapis);
  saveArchiv(arch);
}
function vytvorArchivZapis(nazev="") {
  return {
    id: Date.now(),
    nazev: nazev || `${infoZapasu.datum || "??"} ${infoZapasu.cas || ""} ${infoZapasu.misto || ""}`.trim(),
    infoZapasu: structuredClone(infoZapasu),
    hraci: structuredClone(hraci),
    statistiky: structuredClone(statistiky),
    goloveUdalosti: structuredClone(goloveUdalosti),
    zamknuto: true,
    createdAt: new Date().toISOString()
  };
}
function nactiArchivZapis(zapis, {duplicitne=false, jenSoupiska=false}={}) {
  if (jenSoupiska) {
    hraci = structuredClone(zapis.hraci || []);
    inicializujStatistiky();
    infoZapasu = { datum:"", cas:"", misto:"", tym:"domaci" };
    goloveUdalosti = [];
    aktivniTretina = "1"; aktualniAkce = "strely"; aktivniPetka = 0; zamknuto = false;
  } else if (duplicitne) {
    hraci = structuredClone(zapis.hraci || []);
    inicializujStatistiky();
    infoZapasu = structuredClone(zapis.infoZapasu || {tym:"domaci"});
    infoZapasu.datum = ""; infoZapasu.cas = ""; // nový zápas
    goloveUdalosti = [];
    aktivniTretina = "1"; aktualniAkce = "strely"; aktivniPetka = 0; zamknuto = false;
  } else {
    hraci = structuredClone(zapis.hraci || []);
    statistiky = structuredClone(zapis.statistiky || {});
    goloveUdalosti = structuredClone(zapis.goloveUdalosti || []);
    infoZapasu = structuredClone(zapis.infoZapasu || {tym:"domaci"});
    aktivniTretina = "1"; aktualniAkce = "strely"; aktivniPetka = 0; zamknuto = true;
  }
  saveState(); render();
}

// === Wake Lock ===
async function enableWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakelockSentinel = await navigator.wakeLock.request("screen");
      wakelockSentinel.addEventListener("release", ()=>{ wakelockSentinel=null; });
    }
  } catch {}
}

// === Statistiky init ===
function inicializujStatistiky() {
  statistiky = {};
  hraci.forEach(h => {
    statistiky[h.id] = {
      strely:    { "1":0, "2":0, "3":0, "P":0 },
      goly:      { "1":[], "2":[], "3":[], "P":[] },
      asistence: { "1":0, "2":0, "3":0, "P":0 },
      plus:      { "1":0, "2":0, "3":0, "P":0 },
      minus:     { "1":0, "2":0, "3":0, "P":0 },
      tresty:    { "1":[], "2":[], "3":[], "P":[] },
      zasahy:    { "1":0, "2":0, "3":0, "P":0 },
      obdrzene:  { "1":[], "2":[], "3":[], "P":[] }
    };
  });
  goloveUdalosti = [];
}

// === Import/Export ===
async function importSoupiska(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  hraci = [];
  for (let i=1;i<rows.length;i++){
    const [cislo, jmeno, typ, petka] = rows[i];
    if (!cislo || !jmeno || !typ) continue;
    const id = String(i);
    hraci.push({ id, jmeno: `${cislo} ${jmeno}`, typ: String(typ).trim(), petka: Number(petka)||0 });
  }
  inicializujStatistiky();
  zamknuto = false;
  saveState(); render();
}

function exportStatistiky() {
  const flattenSum = (obj) => Object.values(obj)
    .reduce((a,b)=> a + (typeof b==="number" ? b : (Array.isArray(b)? b.length:0)), 0);

  const data = hraci.map(h=>{
    const s = statistiky[h.id];
    return {
      Cislo: ziskejCisloZJmena(h.jmeno),
      Jmeno: (h.jmeno||"").split(" ").slice(1).join(" "),
      Typ: h.typ, Petka: h.petka||"",
      Strely: flattenSum(s.strely),
      Goly:   flattenSum(s.goly),
      Asistence: flattenSum(s.asistence),
      Plus:   flattenSum(s.plus),
      Minus:  flattenSum(s.minus),
      Zasahy: flattenSum(s.zasahy),
      Obdrzene: flattenSum(s.obdrzene),
      Tresty: flattenSum(s.tresty)
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statistiky");
  XLSX.writeFile(wb, "statistiky_zapasu.xlsx");
}

// === Undo ===
function pushUndo(action) {
  undoStack.unshift(action);
  if (undoStack.length > 10) undoStack.pop();
}
function undo() {
  const a = undoStack.shift();
  if (!a) return;
  a.undo();
  vibrate(15);
  saveState(); render();
}

// === Akce ===
function handleClick(id, typ) {
  if (zamknuto) return;
  const s = statistiky[id];
  if (!s) return;
  const t = aktivniTretina;

  switch (typ) {
    case "strely": {
      s.strely[t]++; vibrate();
      pushUndo({ undo: ()=>{ s.strely[t]--; }});
      break;
    }
    case "goly": {
      const casG = pridejCas("Čas gólu");
      s.goly[t].push(casG);
      s.plus[t]++;
      const ev = { typ:"g", cas:casG, tretina:t, strelec:id, asistenti:[], plus:[id] };
      goloveUdalosti.push(ev);
      const evIndex = goloveUdalosti.length - 1;
      vibrate();
      pushUndo({ undo: ()=>{
        s.goly[t].pop(); s.plus[t]--; goloveUdalosti.splice(evIndex,1);
      }});
      // otevři overlay pro A/+ rychlý výběr
      otevriOverlay("g", evIndex);
      break;
    }
    case "asistence": {
      s.asistence[t]++; s.plus[t]++; vibrate();
      const lastG = [...goloveUdalosti].reverse().find(e=>e.typ==="g" && e.tretina===t);
      pushUndo({ undo: ()=>{
        s.asistence[t]--; s.plus[t]--;
        if (lastG) lastG.asistenti = lastG.asistenti.filter(x=>x!==id);
      }});
      if (lastG && lastG.asistenti.length < 2) lastG.asistenti.push(id);
      break;
    }
    case "plus": {
      s.plus[t]++; vibrate();
      const lastG = [...goloveUdalosti].reverse().find(e=>e.typ==="g" && e.tretina===t);
      pushUndo({ undo: ()=>{
        s.plus[t]--;
        if (lastG) lastG.plus = lastG.plus.filter(x=>x!==id);
      }});
      if (lastG) lastG.plus.push(id);
      break;
    }
    case "obdrzene": {
      // zadává se u brankáře, čas jen jednou
      const casO = pridejCas("Čas obdrženého gólu");
      s.obdrzene[t].push(casO);
      const ev = { typ:"o", cas:casO, tretina:t, minus:[id] };
      goloveUdalosti.push(ev);
      const evIndex = goloveUdalosti.length - 1;
      vibrate();
      pushUndo({ undo: ()=>{
        s.obdrzene[t].pop(); goloveUdalosti.splice(evIndex,1);
      }});
      // overlay pro −
      otevriOverlay("o", evIndex);
      break;
    }
    case "minus": {
      s.minus[t]++; vibrate();
      const lastO = [...goloveUdalosti].reverse().find(e=>e.typ==="o" && e.tretina===t);
      pushUndo({ undo: ()=>{
        s.minus[t]--;
        if (lastO) lastO.minus = lastO.minus.filter(x=>x!==id);
      }});
      if (lastO) lastO.minus.push(id);
      break;
    }
    case "tresty": {
      const casT = pridejCas("Čas trestu");
      s.tresty[t].push(casT); vibrate();
      pushUndo({ undo: ()=>{ s.tresty[t].pop(); }});
      break;
    }
    case "zasahy": {
      s.zasahy[t]++; vibrate();
      pushUndo({ undo: ()=>{ s.zasahy[t]--; }});
      break;
    }
  }
  saveState(); render();
}

// === Overlay pro rychlé A/+ nebo − ===
function otevriOverlay(mod, evIndex) {
  overlay = { mode: mod, eventIndex: evIndex };
  render();
}
function zavriOverlay() { overlay = null; render(); }

// === UI ===
function renderHlavicka() {
  const box = document.createElement("div");
  box.className = "p-3 bg-white dark:bg-gray-900 rounded mb-3 flex flex-col gap-2";

  // řádek 1: info zápasu + domácí/hosté
  const r1 = document.createElement("div");
  r1.className = "flex flex-wrap gap-3 items-end";

  const pole = (label, key, type="text") => {
    const w = document.createElement("div");
    w.className = "flex flex-col";
    const l = document.createElement("label");
    l.className = "text-xs text-gray-500"; l.textContent = label;
    const i = document.createElement("input");
    i.type = type; i.value = infoZapasu[key] || "";
    i.className = "px-2 py-1 rounded bg-gray-100 dark:bg-gray-800";
    i.oninput = ()=>{ infoZapasu[key] = i.value; saveState(); };
    w.appendChild(l); w.appendChild(i);
    return w;
  };
  r1.appendChild(pole("Datum","datum","date"));
  r1.appendChild(pole("Čas","cas","time"));
  r1.appendChild(pole("Místo","misto","text"));

  const selWrap = document.createElement("div");
  selWrap.className = "flex flex-col";
  const lbl = document.createElement("label");
  lbl.className = "text-xs text-gray-500"; lbl.textContent="Domácí/Hosté";
  const sel = document.createElement("select");
  sel.className = "px-2 py-1 rounded bg-gray-100 dark:bg-gray-800";
  [["domaci","Jsme domácí"],["host","Jsme hosté"]].forEach(([v,t])=>{
    const o=document.createElement("option");
    o.value=v; o.textContent=t; if (infoZapasu.tym===v) o.selected=true;
    sel.appendChild(o);
  });
  sel.onchange=()=>{ infoZapasu.tym = sel.value; saveState(); render(); };
  selWrap.appendChild(lbl); selWrap.appendChild(sel);
  r1.appendChild(selWrap);

  // Aktivní pětka
  const petkaWrap = document.createElement("div");
  petkaWrap.className = "flex flex-col";
  const lp = document.createElement("label");
  lp.className = "text-xs text-gray-500"; lp.textContent="Aktivní pětka";
  const selP = document.createElement("select");
  selP.className = "px-2 py-1 rounded bg-gray-100 dark:bg-gray-800";
  [["0","Vše"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]].forEach(([v,t])=>{
    const o=document.createElement("option");
    o.value=v; o.textContent=t; if (String(aktivniPetka)===v) o.selected=true;
    selP.appendChild(o);
  });
  selP.onchange=()=>{ aktivniPetka = Number(selP.value); saveState(); render(); };
  petkaWrap.appendChild(lp); petkaWrap.appendChild(selP);
  r1.appendChild(petkaWrap);

  // tlačítka: Undo, Ukončit, Archiv, Tisk, Export
  const actions = document.createElement("div");
  actions.className = "flex gap-2 ml-auto no-print";

  const bUndo = document.createElement("button");
  bUndo.textContent="↶ Zpět";
  bUndo.className="px-3 py-1 rounded bg-gray-700";
  bUndo.onclick=()=>undo();
  actions.appendChild(bUndo);

  const bEnd = document.createElement("button");
  bEnd.textContent = zamknuto ? "Zápas uzamčen" : "Ukončit zápas";
  bEnd.disabled = zamknuto;
  bEnd.className = (zamknuto ? "bg-gray-500" : "bg-red-700 hover:bg-red-800") + " px-3 py-1 rounded";
  bEnd.onclick=()=>{
    if (!confirm("Ukončit zápas? Zadávání se uzamkne a zápas se uloží do archivu.")) return;
    zamknuto = true;
    const zapis = vytvorArchivZapis();
    archivujZapasyAdd(zapis);
    saveState(); render();
    alert("Zápas uložen do archivu. Nyní můžete exportovat XLSX nebo vytisknout přehled.");
  };
  actions.appendChild(bEnd);

  const bArch = document.createElement("button");
  bArch.textContent="📁 Archiv";
  bArch.className="px-3 py-1 rounded bg-blue-700";
  bArch.onclick=()=>otevriArchivModal();
  actions.appendChild(bArch);

  const bPrint = document.createElement("button");
  bPrint.textContent="🖨️ Tisk";
  bPrint.className="px-3 py-1 rounded bg-gray-700";
  bPrint.onclick=()=>window.print();
  actions.appendChild(bPrint);

  const bExp = document.createElement("button");
  bExp.textContent="📤 Export XLSX";
  bExp.className="px-3 py-1 rounded bg-green-700";
  bExp.onclick=exportStatistiky;
  actions.appendChild(bExp);

  r1.appendChild(actions);
  box.appendChild(r1);

  // skóre
  const score = document.createElement("div");
  score.className = "mt-1 font-bold";
  const poTretinach = { "1":[0,0], "2":[0,0], "3":[0,0], "P":[0,0] };
  for (const e of goloveUdalosti) {
    const domaci = infoZapasu.tym==="domaci";
    if (e.typ==="g") { domaci ? poTretinach[e.tretina][0]++ : poTretinach[e.tretina][1]++; }
    if (e.typ==="o") { domaci ? poTretinach[e.tretina][1]++ : poTretinach[e.tretina][0]++; }
  }
  const sum = Object.values(poTretinach).reduce((a,[d,h])=>[a[0]+d,a[1]+h],[0,0]);
  const per = Object.entries(poTretinach).map(([t,[d,h]])=>`${d}:${h}`).join(";");
  score.textContent = `Skóre: ${sum[0]}:${sum[1]} (${per})`;
  box.appendChild(score);

  root.appendChild(box);
}

function renderTretiny() {
  const box = document.createElement("div");
  box.className = "flex flex-wrap gap-2 mb-3 no-print";
  ["1","2","3","P"].forEach(t=>{
    const b=document.createElement("button");
    b.textContent = t==="P" ? "🕐 Prodloužení" : `${t}. třetina`;
    b.className = (aktivniTretina===t) ? "bg-blue-700 text-white px-2 py-1 rounded" : "bg-gray-300 text-black px-2 py-1 rounded";
    b.disabled = zamknuto;
    b.onclick=()=>{ aktivniTretina=t; saveState(); render(); };
    box.appendChild(b);
  });
  root.appendChild(box);
}

function renderAkcePanel() {
  const akcePanel = document.createElement("div");
  akcePanel.className = "flex flex-wrap gap-2 mb-3 no-print";
  [
    ["strely","🎯 Střela"],
    ["goly","🥅 Gól"],
    ["asistence","🅰️ Asistence"],
    ["plus","+ na ledě"],
    ["minus","− na ledě"],
    ["tresty","⛔ Trest"],
    ["zasahy","🧤 Zásah"],
    ["obdrzene","💥 Obdržený gól"]
  ].forEach(([typ,label])=>{
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = zamknuto;
    b.className = (aktualniAkce===typ) ? "bg-yellow-600 text-white px-2 py-1 rounded" : "bg-gray-700 px-2 py-1 rounded";
    b.onclick=()=>{ aktualniAkce=typ; render(); };
    akcePanel.appendChild(b);
  });
  root.appendChild(akcePanel);
}

function renderHraciGrid() {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-4 gap-2 mb-4";

  const poradi = { B:0, O:1, Ú:2 };
  let list = [...hraci].sort((a,b)=>(poradi[a.typ]-poradi[b.typ]) || ((a.petka||0)-(b.petka||0)));
  if (aktivniPetka>0) {
    const goalies = list.filter(h=>h.typ==="B");
    const active = list.filter(h=>h.petka===aktivniPetka && h.typ!=="B");
    list = [...goalies, ...active];
  }

  list.forEach(h=>{
    const cislo = ziskejCisloZJmena(h.jmeno);
    const b = document.createElement("button");
    b.textContent = `#${cislo}`;
    b.className = `py-3 rounded font-bold ${h.typ==="B" ? "bg-black" : barvaPetky(h.petka)} text-white`;
    if (zamknuto) b.classList.add("opacity-60");
    b.onclick = ()=>handleClick(h.id, aktualniAkce);
    grid.appendChild(b);
  });

  root.appendChild(grid);
}

function renderGoloveUdalosti() {
  const wrap = document.createElement("div");
  wrap.className = "bg-gray-800 p-4 rounded mb-4";
  const h2 = document.createElement("h2");
  h2.className = "text-xl font-bold mb-2";
  h2.textContent = "📈 Gólové události";
  wrap.appendChild(h2);

  goloveUdalosti.forEach(e=>{
    const barva = e.typ==="g" ? "bg-green-200 text-black" : "bg-red-200 text-black";
    const d = document.createElement("div");
    d.className = `${barva} p-2 rounded text-sm mb-2`;
    d.innerHTML = `<strong>${e.tretina}. tř. ${e.cas}</strong>: ${e.typ==="g"?"Gól":"Obdržený gól"} 
      ${e.strelec?(" – "+ziskejJmeno(e.strelec)):""}
      ${e.asistenti?.length ? "(A: " + e.asistenti.map(ziskejJmeno).join(", ") + ")" : ""} 
      ${e.plus?.length ? " +: " + e.plus.map(ziskejJmeno).join(", ") : ""} 
      ${e.minus?.length ? " −: " + e.minus.map(ziskejJmeno).join(", ") : ""}`;
    wrap.appendChild(d);
  });

  // skóre pod přehledem
  const score = document.createElement("div");
  score.className = "mt-2 font-bold";
  const poTretinach = { "1":[0,0], "2":[0,0], "3":[0,0], "P":[0,0] };
  for (const e of goloveUdalosti) {
    const domaci = infoZapasu.tym==="domaci";
    if (e.typ==="g") { domaci ? poTretinach[e.tretina][0]++ : poTretinach[e.tretina][1]++; }
    if (e.typ==="o") { domaci ? poTretinach[e.tretina][1]++ : poTretinach[e.tretina][0]++; }
  }
  const sum = Object.values(poTretinach).reduce((a,[d,h])=>[a[0]+d,a[1]+h],[0,0]);
  const per = Object.entries(poTretinach).map(([t,[d,h]])=>`${d}:${h}`).join(";");
  score.textContent = `Skóre: ${sum[0]}:${sum[1]} (${per})`;
  wrap.appendChild(score);

  root.appendChild(wrap);
}

function renderTabulkaStatistik() {
  const box = document.createElement("div");
  box.className = "bg-gray-800 p-4 rounded";

  const h2 = document.createElement("h2");
  h2.className = "text-xl font-bold mb-2";
  h2.textContent = "📊 Statistiky po třetinách";
  box.appendChild(h2);

  const table = document.createElement("table");
  table.className = "w-full text-sm";
  table.innerHTML = `
    <thead>
      <tr class="text-left">
        <th>#</th><th>Jméno</th><th>Typ</th><th>Pětka</th>
        <th>1. tř.</th><th>2. tř.</th><th>3. tř.</th><th>P</th><th>Celkem</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  const poradi = { B:0, O:1, Ú:2 };
  const list = [...hraci].sort((a,b)=>(poradi[a.typ]-poradi[b.typ]) || ((a.petka||0)-(b.petka||0)));

  const soucty = { strely:{ "1":0,"2":0,"3":0,"P":0 }, obdrzene:{ "1":0,"2":0,"3":0,"P":0 } };

  list.forEach(h=>{
    const s = statistiky[h.id];
    const tr = document.createElement("tr");
    const cislo = ziskejCisloZJmena(h.jmeno);

    let cells = `<td>${cislo}</td><td>${h.jmeno}</td><td>${h.typ}</td><td>${h.petka||"-"}</td>`;
    let total = 0;
    ["1","2","3","P"].forEach(t=>{
      let val = 0;
      if (h.typ==="B") {
        val = (s.obdrzene[t]||[]).length; soucty.obdrzene[t]+=val;
      } else {
        val = s.strely[t]||0; soucty.strely[t]+=val;
      }
      total += val;
      cells += `<td class="text-center">${val}</td>`;
    });
    cells += `<td class="text-center font-bold">${total}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });

  const sumTr = document.createElement("tr");
  let sumCells = `<td>–</td><td class="font-bold">Celkem</td><td>–</td><td>–</td>`;
  ["1","2","3","P"].forEach(t=>{
    const suma = (soucty.strely[t]||0) + (soucty.obdrzene[t]||0);
    sumCells += `<td class="text-center font-bold">${suma}</td>`;
  });
  sumCells += `<td class="text-center">–</td>`;
  sumTr.innerHTML = sumCells;
  tbody.appendChild(sumTr);

  box.appendChild(table);
  root.appendChild(box);
}

function renderPetky() {
  const container = document.createElement("div");
  container.className = "p-4 mt-4 bg-white dark:bg-gray-800 rounded";

  const h2 = document.createElement("h2");
  h2.className = "text-xl font-bold mb-2";
  h2.textContent = "Rozdělení hráčů do pětek";
  container.appendChild(h2);

  for (let i=1;i<=5;i++){
    const blk = document.createElement("div");
    blk.className = "mb-3";
    blk.innerHTML = `<h3 class='font-semibold mb-1'>${i}. pětka</h3>`;
    const v = hraci.filter(h=>h.petka==i && h.typ!=="B");
    if (v.length===0) {
      blk.innerHTML += `<p class='text-sm text-gray-500'>Žádní hráči</p>`;
    } else {
      blk.innerHTML += `<div class='flex flex-wrap gap-2'>` +
        v.map(h=>`<span class='bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded'>#${ziskejCisloZJmena(h.jmeno)} (${h.typ})</span>`).join("") +
        `</div>`;
    }
    container.appendChild(blk);
  }

  const brWrap = document.createElement("div");
  brWrap.className = "mb-2";
  brWrap.innerHTML = `<h3 class='font-semibold mb-1'>Brankáři</h3>`;
  const br = hraci.filter(h=>h.typ==="B");
  brWrap.innerHTML += `<div class='flex flex-wrap gap-2'>` +
    br.map(h=>`<span class='bg-blue-100 dark:bg-blue-600 px-2 py-1 rounded'>#${ziskejCisloZJmena(h.jmeno)} (B)</span>`).join("") +
    `</div>`;
  container.appendChild(brWrap);

  root.appendChild(container);
}

function renderImportExportControls() {
  const box = document.createElement("div");
  box.className = "flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded mt-4 no-print";

  const file = document.createElement("input");
  file.type = "file"; file.accept = ".xlsx";
  file.onchange = (e)=>{ if (e.target.files?.length) importSoupiska(e.target.files[0]); };

  const btnExp = document.createElement("button");
  btnExp.textContent = "📤 Export statistik (.xlsx)";
  btnExp.className = "bg-green-600 text-white px-3 py-2 rounded";
  btnExp.onclick = exportStatistiky;

  const btnSaveArch = document.createElement("button");
  btnSaveArch.textContent = "💾 Uložit do archivu";
  btnSaveArch.className = "bg-blue-700 text-white px-3 py-2 rounded";
  btnSaveArch.onclick = ()=>{
    const nazev = prompt("Název zápasu pro archiv:", `${infoZapasu.datum||""} ${infoZapasu.cas||""} ${infoZapasu.misto||""}`.trim());
    if (nazev===null) return;
    const zapis = vytvorArchivZapis(nazev);
    archivujZapasyAdd(zapis);
    alert("Zápas uložen do archivu.");
  };

  box.appendChild(file);
  box.appendChild(btnExp);
  box.appendChild(btnSaveArch);
  root.appendChild(box);
}

// === Archiv modal ===
function otevriArchivModal() {
  const arch = loadArchiv();

  const backdrop = document.createElement("div");
  backdrop.className = "overlay-backdrop";
  backdrop.onclick = (e)=>{ if (e.target===backdrop) document.body.removeChild(backdrop); };

  const card = document.createElement("div");
  card.className = "bg-white text-black rounded p-4 max-w-3xl w-full";
  card.innerHTML = `<h3 class="text-xl font-bold mb-3">📁 Archiv zápasů</h3>`;

  const list = document.createElement("div");
  list.className = "flex flex-col gap-2 max-h-[60vh] overflow-auto";

  if (arch.length===0) {
    list.innerHTML = `<div class="text-sm text-gray-600">Archiv je prázdný.</div>`;
  } else {
    arch.forEach((zapis, idx)=>{
      const row = document.createElement("div");
      row.className = "border rounded p-2 flex flex-wrap items-center gap-2";
      const meta = document.createElement("div");
      meta.className = "flex-1";
      meta.innerHTML = `<div class="font-semibold">${zapis.nazev || "(bez názvu)"}</div>
        <div class="text-xs text-gray-600">${new Date(zapis.createdAt).toLocaleString()}</div>`;
      row.appendChild(meta);

      const btnLoad = document.createElement("button");
      btnLoad.textContent = "Načíst (read-only)";
      btnLoad.className = "px-2 py-1 rounded bg-gray-700 text-white";
      btnLoad.onclick = ()=>{
        nactiArchivZapis(zapis, {duplicitne:false, jenSoupiska:false});
        document.body.removeChild(backdrop);
      };
      row.appendChild(btnLoad);

      const btnDup = document.createElement("button");
      btnDup.textContent = "Duplikovat jako nový";
      btnDup.className = "px-2 py-1 rounded bg-blue-700 text-white";
      btnDup.onclick = ()=>{
        nactiArchivZapis(zapis, {duplicitne:true});
        document.body.removeChild(backdrop);
      };
      row.appendChild(btnDup);

      const btnSoup = document.createElement("button");
      btnSoup.textContent = "Použít soupisku";
      btnSoup.className = "px-2 py-1 rounded bg-green-700 text-white";
      btnSoup.onclick = ()=>{
        nactiArchivZapis(zapis, {jenSoupiska:true});
        document.body.removeChild(backdrop);
      };
      row.appendChild(btnSoup);

      const btnDel = document.createElement("button");
      btnDel.textContent = "Smazat";
      btnDel.className = "px-2 py-1 rounded bg-red-700 text-white";
      btnDel.onclick = ()=>{
        if (!confirm("Opravdu smazat tento zápis z archivu?")) return;
        const a = loadArchiv();
        a.splice(idx,1);
        saveArchiv(a);
        document.body.removeChild(backdrop);
        otevriArchivModal();
      };
      row.appendChild(btnDel);

      list.appendChild(row);
    });
  }

  const rowClose = document.createElement("div");
  rowClose.className = "flex justify-end mt-2";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Zavřít";
  closeBtn.className = "px-3 py-1 rounded bg-gray-200";
  closeBtn.onclick = ()=>document.body.removeChild(backdrop);
  rowClose.appendChild(closeBtn);

  card.appendChild(list);
  card.appendChild(rowClose);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// === Overlay UI ===
function renderOverlay() {
  if (!overlay) return;
  const { mode, eventIndex } = overlay;
  const ev = goloveUdalosti[eventIndex];
  if (!ev) return;

  const backdrop = document.createElement("div");
  backdrop.className = "overlay-backdrop";
  backdrop.onclick = (e)=>{ if (e.target===backdrop) zavriOverlay(); };

  const card = document.createElement("div");
  card.className = "bg-white text-black rounded p-4 max-w-3xl w-full";
  const title = mode==="g" ? "Rychlé zadání asistencí (+) pro gól" : "Rychlé zadání (−) pro obdržený gól";
  card.innerHTML = `<h3 class="text-xl font-bold mb-2">${title}</h3>`;

  // výchozí: zobrazíme hráče aktivní pětky + tlačítko „Všichni“
  const filterRow = document.createElement("div");
  filterRow.className = "flex gap-2 mb-2";
  const btnOnlyLine = document.createElement("button");
  btnOnlyLine.textContent = "Aktivní pětka";
  btnOnlyLine.className = "px-2 py-1 rounded bg-blue-600 text-white";
  const btnAll = document.createElement("button");
  btnAll.textContent = "Všichni";
  btnAll.className = "px-2 py-1 rounded bg-gray-700 text-white";

  let showAll = false;
  btnOnlyLine.onclick = ()=>{ showAll=false; rerenderList(); };
  btnAll.onclick = ()=>{ showAll=true; rerenderList(); };

  filterRow.appendChild(btnOnlyLine); filterRow.appendChild(btnAll);
  card.appendChild(filterRow);

  const listWrap = document.createElement("div");
  card.appendChild(listWrap);

  function getList() {
    const poradi = { B:0, O:1, Ú:2 };
    let list = [...hraci].sort((a,b)=>(poradi[a.typ]-poradi[b.typ]) || ((a.petka||0)-(b.petka||0)));
    if (!showAll && aktivniPetka>0) {
      const goalies = list.filter(h=>h.typ==="B");
      const active = list.filter(h=>h.petka===aktivniPetka && h.typ!=="B");
      list = [...goalies, ...active];
    }
    return list;
  }

  function rerenderList() {
    listWrap.innerHTML = "";
    const list = getList();
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-6 gap-2";

    list.forEach(h=>{
      const cislo = ziskejCisloZJmena(h.jmeno);
      const b = document.createElement("button");
      b.textContent = cislo;
      b.className = `px-2 py-2 rounded font-bold text-white ${h.typ==="B"?"bg-black":barvaPetky(h.petka)}`;
      b.onclick = ()=>{
        if (mode==="g") {
          // nejdřív A (max 2), poté plus
          if (ev.asistenti.length < 2 && !ev.asistenti.includes(h.id) && h.id !== ev.strelec) {
            ev.asistenti.push(h.id);
            const s = statistiky[h.id]; s.asistence[ev.tretina]++; s.plus[ev.tretina]++;
          } else if (!ev.plus.includes(h.id)) {
            ev.plus.push(h.id);
            const s = statistiky[h.id]; s.plus[ev.tretina]++;
          }
        } else {
          if (!ev.minus.includes(h.id)) {
            ev.minus.push(h.id);
            const s = statistiky[h.id]; s.minus[ev.tretina]++;
          }
        }
        saveState(); render(); // aktualizuj i pozadí
      };
      grid.appendChild(b);
    });

    listWrap.appendChild(grid);
  }
  rerenderList();

  const row = document.createElement("div");
  row.className = "flex justify-end gap-2 mt-3";
  const done = document.createElement("button");
  done.textContent = "Hotovo";
  done.className = "px-3 py-1 rounded bg-green-600 text-white";
  done.onclick = ()=>{ zavriOverlay(); };
  const cancel = document.createElement("button");
  cancel.textContent = "Zavřít";
  cancel.className = "px-3 py-1 rounded bg-gray-300";
  cancel.onclick = ()=>{ zavriOverlay(); };

  row.appendChild(done); row.appendChild(cancel);
  card.appendChild(row);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// === Hlavní render ===
function render() {
  root.innerHTML = "";
  renderHlavicka();
  renderTretiny();
  renderAkcePanel();
  renderHraciGrid();
  renderGoloveUdalosti();
  renderTabulkaStatistik();
  renderPetky();
  renderImportExportControls();

  if (overlay) renderOverlay();
}

// === Start ===
(function init(){
  // nabídka pokračovat v rozpracovaném
  if (tryLoadState()) {
    const cont = confirm("Nalezen rozpracovaný zápis. Chceš pokračovat?");
    if (!cont) { clearState(); hraci=[]; statistiky={}; goloveUdalosti=[]; }
  }
  enableWakeLock();
  render();
})();
