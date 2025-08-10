// HOKEJOVÁ STATISTIKA – verze s kompaktním „Nastavení“ a velkým tlačítkem Ukončit zápas dole

const root = document.getElementById("root");

// === UNDO (posledních 5 kroků) ===
const UNDO_MAX = 5;
let undoStack = [];
function getSnapshot(){
  return JSON.stringify({
    hraci, statistiky, goloveUdalosti,
    infoZapasu, aktivniTretina, aktivniPetka,
    zamknuto, penaltyMode, showRosterAdmin, showSettings
  });
}
function applySnapshot(json){
  const s = JSON.parse(json);
  hraci = s.hraci || [];
  statistiky = s.statistiky || {};
  goloveUdalosti = s.goloveUdalosti || [];
  infoZapasu = s.infoZapasu || infoZapasu;
  aktivniTretina = s.aktivniTretina || "1";
  aktivniPetka = s.aktivniPetka ?? 0;
  zamknuto = !!s.zamknuto;
  penaltyMode = !!s.penaltyMode;
  showRosterAdmin = !!s.showRosterAdmin;
  showSettings = !!s.showSettings;
}
function checkpoint(){
  try{
    undoStack.push(getSnapshot());
    if(undoStack.length > UNDO_MAX) undoStack.shift();
  }catch{}
}
function undoLast(){
  if(!undoStack.length) return;
  const snap = undoStack.pop();
  applySnapshot(snap);
  saveState();
  render();
}

// ---- Stav aplikace ----
let hraci = [];                       // {id, jmeno:"12 Novák", typ:"B|O|Ú", petka:0..5, active:true/false}
let statistiky = {};                  // per hráč per třetina
let goloveUdalosti = [];             // {typ:"g"|"o", cas, tretina, strelec?, asistenti[], plus[], minus[], golman?}
let aktivniTretina = "1";            // "1"|"2"|"3"|"P"
let infoZapasu = { datum:"", cas:"", misto:"", tym:"domaci" }; // "domaci" | "host"
let aktivniPetka = 0;                // 0=vše, jinak 1..5
let zamknuto = false;                // Ukončený zápas → nelze editovat
let penaltyMode = false;             // ⛔ Trest – kliky zapisují tresty
let showRosterAdmin = false;         // Správa soupisky panel (uvnitř Nastavení)
let showSettings = false;            // Rozbalovací panel „Nastavení“

// ---- Overlay stav ----
let overlay = null;                   // {mode:"g"|"o", cas, shooter?, A:Set, plus:Set, goalie?, minus:Set, selectMode:"..." }
const OVERLAY_ID = "overlay-backdrop";

// ==== AUTOSAVE (localStorage) ====
const STORAGE_KEY = "hokej-stat-state-v2";
function saveState() {
  const state = {
    hraci, statistiky, goloveUdalosti,
    infoZapasu, aktivniTretina, aktivniPetka,
    zamknuto, penaltyMode, showRosterAdmin, showSettings, ts: Date.now()
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function loadStateRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function applyState(s) {
  hraci = s.hraci || [];
  statistiky = s.statistiky || {};
  goloveUdalosti = s.goloveUdalosti || [];
  infoZapasu = s.infoZapasu || infoZapasu;
  aktivniTretina = s.aktivniTretina || "1";
  aktivniPetka = s.aktivniPetka ?? 0;
  zamknuto = !!s.zamknuto;
  penaltyMode = !!s.penaltyMode;
  showRosterAdmin = !!s.showRosterAdmin;
  showSettings = !!s.showSettings;
}

// ================= Pomůcky =================
function pridejCas(popis) {
  const v = prompt(`${popis} (mm:ss)`, "00:00");
  return v || "00:00";
}
function hById(id){ return hraci.find(h=>h.id===id); }
function cisloZJmena(j){ return String(j||"").trim().split(/\s+/)[0] || "?"; }
function sortHraci(list){
  const poradi={B:0,O:1,Ú:2};
  return [...list].sort((a,b)=>(poradi[a.typ]-poradi[b.typ]) || ((a.petka||0)-(b.petka||0)));
}
function barvaPetky(p){
  switch(Number(p)){
    case 1:return "bg-blue-600";
    case 2:return "bg-green-600";
    case 3:return "bg-purple-600";
    case 4:return "bg-orange-600";
    case 5:return "bg-pink-600";
    default:return "bg-gray-600";
  }
}

// ================= Inicializace statistik =================
function initStatsFor(id){
  statistiky[id]={
    strely:{1:0,2:0,3:0,P:0},
    goly:{1:[],2:[],3:[],P:[]},
    asistence:{1:0,2:0,3:0,P:0},
    plus:{1:0,2:0,3:0,P:0},
    minus:{1:0,2:0,3:0,P:0},
    tresty:{1:[],2:[],3:[],P:[]},
    zasahy:{1:0,2:0,3:0,P:0},
    obdrzene:{1:[],2:[],3:[],P:[]}
  };
}
function resetStatistik(){
  statistiky={};
  for(const h of hraci) initStatsFor(h.id);
  goloveUdalosti=[];
}

// ================= Klik na hráče = akce podle typu =================
function klikHrac(h){
  if(zamknuto) return;
  if(!h || h.active===false) return;

  // Režim trestu: vyžádá čas a zapíše k vybranému hráči
  if(penaltyMode){
    checkpoint();
    const cas = pridejCas("Čas trestu");
    statistiky[h.id].tresty[aktivniTretina].push(cas);
    saveState();
    render();
    return;
  }

  // Standardní klik: brankář = zásah; hráč = střela
  checkpoint();
  if(h.typ==="B"){
    statistiky[h.id].zasahy[aktivniTretina]++;
  }else{
    statistiky[h.id].strely[aktivniTretina]++;
  }
  saveState();
  render();
}

// ================= Souhrn skóre + rychlé střely =================
function souhrnSkore(){
  let dom=0, hos=0;
  const map={"1":[0,0],"2":[0,0],"3":[0,0],"P":[0,0]};
  for(const e of goloveUdalosti){
    const d = infoZapasu.tym==="domaci";
    if(e.typ==="g") d ? map[e.tretina][0]++ : map[e.tretina][1]++;
    if(e.typ==="o") d ? map[e.tretina][1]++ : map[e.tretina][0]++;
  }
  Object.values(map).forEach(([d,h])=>{dom+=d;hos+=h;});
  const per = Object.entries(map).map(([_,[d,h]])=>`${d}:${h}`).join(";");
  return `${dom}:${hos} (${per})`;
}
function souhrnStrely(){
  const nasi={"1":0,"2":0,"3":0,"P":0};
  const soup={"1":0,"2":0,"3":0,"P":0};
  for(const h of hraci){
    if(h.active===false) continue;
    const s = statistiky[h.id];
    if(h.typ==="B"){
      for(const t of ["1","2","3","P"]){
        soup[t] += (s.zasahy[t]||0) + (s.obdrzene[t]?.length||0);
      }
    }else{
      for(const t of ["1","2","3","P"]){
        nasi[t] += (s.strely[t]||0);
      }
    }
  }
  const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
  const jeDomaci = infoZapasu.tym==="domaci";
  const dom = jeDomaci ? sum(nasi) : sum(soup);
  const hos = jeDomaci ? sum(soup) : sum(nasi);
  const per = ["1","2","3","P"].map(t=>{
    const d = jeDomaci ? nasi[t] : soup[t];
    const h = jeDomaci ? soup[t] : nasi[t];
    return `${d}:${h}`;
  }).join(";");
  return `${dom}:${hos} (${per})`;
}

// ================= Overlay – otevření =================
function otevriOverlayGolVstrel(){
  if(zamknuto) return;
  const cas = pridejCas("Čas vstřeleného gólu");
  overlay = { mode:"g", cas, A:new Set(), plus:new Set(), shooter:null, selectMode:"shooter" };
  render();
}
function otevriOverlayGolObdrz(){
  if(zamknuto) return;
  const cas = pridejCas("Čas obdrženého gólu");
  overlay = { mode:"o", cas, minus:new Set(), goalie:null, selectMode:"goalie" };
  render();
}

// ================= Overlay – DOM helpery =================
function removeOverlayDom() {
  const el = document.getElementById(OVERLAY_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
function zavriOverlay() {
  overlay = null;
  removeOverlayDom();
  render();
}

// === ULOŽIT OVERLAY (hlavní logika) ===
function ulozOverlay(){
  if(!overlay) return;
  checkpoint();
  removeOverlayDom();
  const t = aktivniTretina;

  if(overlay.mode==="g"){
    if(!overlay.shooter){ alert("Vyber střelce."); return; }

    // Střelec: gól + automatické +
    const sShooter = statistiky[overlay.shooter];
    sShooter.goly[t].push(overlay.cas);
    sShooter.plus[t]++;

    // Asistence (0–2): asistence + automatické +
    const asistArr = Array.from(overlay.A || []).slice(0,2);
    for(const id of asistArr){
      statistiky[id].asistence[t]++;
      statistiky[id].plus[t]++;
    }

    // + na ledě: jen těm, kteří ještě nedostali (střelec a asistenti už mají)
    const plusArr = Array.from(overlay.plus || []);
    for(const id of plusArr){
      if(id===overlay.shooter) continue;
      if(!asistArr.includes(id)) statistiky[id].plus[t]++;
    }

    // Zobrazení „+“: střelec + asistenti + vybrané plus (unikátně)
    const plusDisplay = Array.from(new Set([overlay.shooter, ...asistArr, ...plusArr]));

    goloveUdalosti.push({
      typ:"g",
      cas: overlay.cas,
      tretina: t,
      strelec: overlay.shooter,
      asistenti: asistArr,
      plus: plusDisplay
    });

  } else {
    // Obdržený gól – zapíše se jen do „obdrzene“ (žádná střela ani zásah)
    if(!overlay.goalie){ alert("Vyber brankáře."); return; }
    const sGoalie = statistiky[overlay.goalie];
    sGoalie.obdrzene[t].push(overlay.cas);

    const minusArr = Array.from(overlay.minus || []);
    for(const id of minusArr) statistiky[id].minus[t]++;

    goloveUdalosti.push({
      typ:"o",
      cas: overlay.cas,
      tretina: t,
      golman: overlay.goalie,
      minus: minusArr
    });
  }

  overlay = null;
  saveState();
  render();
}

// ================= UI: Hlavička =================
function renderHlavicka(){
  const wrap = document.createElement("div");
  wrap.className = "p-3 bg-gray-900 rounded mb-3 flex flex-col gap-3 border border-gray-700";

  const line = document.createElement("div");
  line.className = "flex flex-wrap gap-3 items-end";

  const pole = (label,key,type="text")=>{
    const w = document.createElement("div"); w.className="flex flex-col";
    const l = document.createElement("label"); l.className="text-xs text-gray-400"; l.textContent=label;
    const i = document.createElement("input");
    i.type=type; i.value=infoZapasu[key]||"";
    i.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
    i.oninput=()=>{infoZapasu[key]=i.value; saveState();};
    w.appendChild(l); w.appendChild(i); return w;
  };

  line.appendChild(pole("Datum","datum","date"));
  line.appendChild(pole("Čas","cas","time"));
  line.appendChild(pole("Místo","misto","text"));

  // Domácí/hosté
  const dWrap=document.createElement("div"); dWrap.className="flex flex-col";
  const dLbl=document.createElement("label"); dLbl.className="text-xs text-gray-400"; dLbl.textContent="Domácí / Hosté";
  const dSel=document.createElement("select"); dSel.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
  [["domaci","Jsme domácí"],["host","Jsme hosté"]].forEach(([v,t])=>{
    const o=document.createElement("option"); o.value=v; o.textContent=t; if(infoZapasu.tym===v) o.selected=true; dSel.appendChild(o);
  });
  dSel.onchange=()=>{ infoZapasu.tym=dSel.value; saveState(); render(); };
  dWrap.appendChild(dLbl); dWrap.appendChild(dSel);
  line.appendChild(dWrap);

  // Ovládání (kompaktní): Zpět, Nastavení (⚙️), Nový zápas
  const actions=document.createElement("div"); actions.className="flex gap-2 ml-auto items-end";

  // Zpět (Undo)
  const bUndo = document.createElement("button");
  bUndo.textContent = "↩︎ Zpět";
  bUndo.className = "px-3 py-1 rounded bg-gray-700";
  bUndo.disabled = undoStack.length === 0;
  bUndo.onclick = () => undoLast();
  actions.appendChild(bUndo);

  // ⚙️ Nastavení – rozbalí panel s importem, exportem, tiskem a správou soupisky
  const bSettings = document.createElement("button");
  bSettings.innerHTML = "⚙️";
  bSettings.title = "Nastavení";
  bSettings.className = (showSettings?"bg-blue-700":"bg-gray-700")+" px-3 py-1 rounded";
  bSettings.onclick = ()=>{ showSettings = !showSettings; saveState(); render(); };
  actions.appendChild(bSettings);

  const bNew=document.createElement("button");
  bNew.textContent="🆕 Nový zápas";
  bNew.className="px-3 py-1 rounded bg-gray-700";
  bNew.onclick=()=>{
    if(!confirm("Smazat aktuální zápas a začít nový?")) return;
    checkpoint();
    localStorage.removeItem(STORAGE_KEY);
    goloveUdalosti=[];
    // soupisku necháme – jen vynulujeme statistiky
    resetStatistik();
    zamknuto=false; penaltyMode=false; aktivniPetka=0;
    saveState();
    render();
  };
  actions.appendChild(bNew);

  line.appendChild(actions);

  // Skóre + rychlý přehled střel
  const score=document.createElement("div"); score.className="font-bold";
  score.textContent="Skóre: "+souhrnSkore();
  const shots=document.createElement("div"); shots.className="font-semibold text-sm text-gray-300";
  shots.textContent="Střely: "+souhrnStrely();

  wrap.appendChild(line);
  wrap.appendChild(score);
  wrap.appendChild(shots);
  root.appendChild(wrap);

  if(showSettings) renderSettingsPanel();
}

// ================= Panel: Nastavení (správa soupisky, import, tisk, export) =================
function renderSettingsPanel(){
  const box = document.createElement("div");
  box.className = "p-3 bg-gray-800 rounded mb-3 border border-gray-700";

  // Titulek a přepínač Správy soupisky
  const header = document.createElement("div");
  header.className = "flex items-center justify-between mb-3";
  const ttl = document.createElement("div");
  ttl.className = "font-bold";
  ttl.textContent = "Nastavení";
  header.appendChild(ttl);

  const right = document.createElement("div");
  right.className = "flex gap-2";

  // Import
  const fileLabel = document.createElement("label");
  fileLabel.className = "px-3 py-1 rounded bg-gray-700 cursor-pointer";
  fileLabel.textContent = "📥 Import .xlsx";
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = ".xlsx"; fileInput.className="hidden";
  fileInput.onchange = (e)=>{ if(e.target.files?.length){ importSoupiska(e.target.files[0]); } };
  fileLabel.appendChild(fileInput);
  right.appendChild(fileLabel);

  // Tisk
  const bPrint=document.createElement("button");
  bPrint.textContent="🖨️ Tisk"; bPrint.className="px-3 py-1 rounded bg-gray-700"; bPrint.onclick=()=>window.print();
  right.appendChild(bPrint);

  // Export
  const bExp=document.createElement("button");
  bExp.textContent="📤 Export XLSX"; bExp.className="px-3 py-1 rounded bg-green-700"; bExp.onclick=exportStatistiky;
  right.appendChild(bExp);

  header.appendChild(right);
  box.appendChild(header);

  // Přepínač správy soupisky
  const toggle = document.createElement("button");
  toggle.textContent = showRosterAdmin ? "✓ Správa soupisky" : "⚙️ Správa soupisky";
  toggle.className = (showRosterAdmin?"bg-blue-700":"bg-gray-700")+" px-3 py-1 rounded mb-3";
  toggle.onclick = ()=>{ showRosterAdmin = !showRosterAdmin; saveState(); render(); };
  box.appendChild(toggle);

  if(showRosterAdmin) renderRosterAdmin(box);

  root.appendChild(box);
}

// ================= Panel: Správa soupisky (vkládá se do Nastavení) =================
function renderRosterAdmin(container){
  const box = document.createElement("div");
  box.className = "p-3 bg-gray-900 rounded border border-gray-700";

  const title = document.createElement("div");
  title.className = "font-bold mb-2";
  title.textContent = "Správa soupisky – přidání / deaktivace / obnova";
  box.appendChild(title);

  // --- Formulář pro přidání hráče ---
  const form = document.createElement("div");
  form.className = "flex flex-wrap items-end gap-2 mb-3";

  const mk = (label, type="text", attrs={})=>{
    const w=document.createElement("div"); w.className="flex flex-col";
    const l=document.createElement("label"); l.className="text-xs text-gray-300"; l.textContent=label;
    const i=document.createElement("input"); i.type=type; i.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
    Object.assign(i, attrs);
    w.appendChild(l); w.appendChild(i);
    return [w,i];
  };

  const [wNum,inNum] = mk("Číslo","text",{placeholder:"např. 12"});
  const [wName,inName] = mk("Jméno","text",{placeholder:"Novák"});
  const selWrap = document.createElement("div"); selWrap.className="flex flex-col";
  const selLbl = document.createElement("label"); selLbl.className="text-xs text-gray-300"; selLbl.textContent="Typ (B/O/Ú)";
  const sel = document.createElement("select");
  sel.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
  ["B","O","Ú"].forEach(v=>{ const o=document.createElement("option"); o.value=v; o.textContent=v; sel.appendChild(o);});
  selWrap.appendChild(selLbl); selWrap.appendChild(sel);

  const [wLine,inLine] = mk("Pětka (1–5)","number",{min:0,max:5,placeholder:"1"});

  const addBtn=document.createElement("button");
  addBtn.textContent="➕ Přidat hráče";
  addBtn.className="px-3 py-1 rounded bg-green-700";
  addBtn.onclick = ()=>{
    addManualPlayer(inNum.value,inName.value,sel.value,inLine.value);
    inNum.value=""; inName.value=""; inLine.value="";
  };

  form.appendChild(wNum); form.appendChild(wName); form.appendChild(selWrap); form.appendChild(wLine); form.appendChild(addBtn);
  box.appendChild(form);

  // --- Seznam aktivních (s „odebrat“) ---
  const activeBox = document.createElement("div");
  activeBox.className="mb-2";
  activeBox.innerHTML = `<div class="font-semibold mb-1">Aktivní hráči</div>`;
  const actWrap=document.createElement("div"); actWrap.className="flex flex-wrap gap-2";
  sortHraci(hraci).filter(h=>h.active!==false).forEach(h=>{
    const chip=document.createElement("div");
    chip.className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700";
    chip.innerHTML = `<span>#${cisloZJmena(h.jmeno)} ${h.jmeno.split(" ").slice(1).join(" ")} (${h.typ}${h.petka?`, ${h.petka}.`:``})</span>`;
    const del=document.createElement("button");
    del.textContent="×";
    del.className="px-2 py-0.5 rounded bg-red-700";
    del.onclick=()=>softDeletePlayer(h.id);
    chip.appendChild(del);
    actWrap.appendChild(chip);
  });
  activeBox.appendChild(actWrap);
  box.appendChild(activeBox);

  // --- Seznam neaktivních (s „obnovit“) ---
  const inactive = hraci.filter(h=>h.active===false);
  if(inactive.length){
    const deadBox = document.createElement("div");
    deadBox.className="mt-2";
    deadBox.innerHTML = `<div class="font-semibold mb-1">Neaktivní hráči</div>`;
    const deadWrap=document.createElement("div"); deadWrap.className="flex flex-wrap gap-2";
    sortHraci(inactive).forEach(h=>{
      const chip=document.createElement("div");
      chip.className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700";
      chip.innerHTML = `<span>#${cisloZJmena(h.jmeno)} ${h.jmeno.split(" ").slice(1).join(" ")} (${h.typ}${h.petka?`, ${h.petka}.`:``})</span>`;
      const restore=document.createElement("button");
      restore.textContent="↺";
      restore.className="px-2 py-0.5 rounded bg-blue-700";
      restore.onclick=()=>restorePlayer(h.id);
      chip.appendChild(restore);
      deadWrap.appendChild(chip);
    });
    deadBox.appendChild(deadWrap);
    box.appendChild(deadBox);
  }

  container.appendChild(box);
}

// ====== Roster API (přidání/„smazání“/obnova) ======
function addManualPlayer(cislo, jmeno, typ, petka){
  checkpoint();
  const id = String(Date.now()); // jednoduché unikátní ID
  const fullName = `${String(cislo||"").trim()} ${String(jmeno||"").trim()}`.trim();
  const t = (typ||"").toUpperCase();
  const valid = ["B","O","Ú"];
  if(!fullName || !valid.includes(t)) { alert("Zkontroluj číslo/jméno a typ (B/O/Ú)."); return; }

  hraci.push({
    id, jmeno: fullName, typ: t, petka: Number(petka)||0, active: true
  });
  initStatsFor(id);
  saveState();
  render();
}
function softDeletePlayer(id){
  checkpoint();
  const h = hraci.find(x=>x.id===id);
  if(!h) return;
  if(!confirm(`Deaktivovat hráče ${h.jmeno}? Události v historii zůstanou, hráč zmizí z dlaždic.`)) return;
  h.active = false;
  saveState();
  render();
}
function restorePlayer(id){
  checkpoint();
  const h = hraci.find(x=>x.id===id);
  if(!h) return;
  h.active = true;
  saveState();
  render();
}

// ================= Třetiny + dlaždice pětek + akční lišta =================
function renderTretiny(){
  const box=document.createElement("div"); box.className="flex flex-wrap gap-2 mb-3";
  ["1","2","3","P"].forEach(t=>{
    const b=document.createElement("button");
    b.textContent = t==="P"?"🕐 Prodloužení":`${t}. třetina`;
    b.className = (aktivniTretina===t) ? "bg-blue-700 text-white px-2 py-1 rounded" : "bg-gray-300 text-black px-2 py-1 rounded";
    b.disabled = zamknuto;
    b.onclick=()=>{ aktivniTretina=t; saveState(); render(); };
    box.appendChild(b);
  });
  root.appendChild(box);
}

function seznamPeticKZobrazeni(){
  const set = new Set();
  hraci.forEach(h=>{
    if(h.active!==false && h.typ!=="B" && h.petka && h.petka>0) set.add(h.petka);
  });
  return Array.from(set).sort((a,b)=>a-b);
}

function renderDlazdicePatek(){
  const box=document.createElement("div");
  box.className="flex flex-wrap gap-2 mb-3";

  // „Vše“ vždy
  const bAll=document.createElement("button");
  bAll.textContent="Vše";
  bAll.className = (aktivniPetka===0 ? "bg-gray-700 text-white" : "bg-gray-300 text-black")+" px-3 py-2 rounded";
  bAll.onclick=()=>{ aktivniPetka=0; saveState(); render(); };
  box.appendChild(bAll);

  // jen pětky, kde je aspoň jeden aktivní hráč
  const seznam = seznamPeticKZobrazeni();
  seznam.forEach(p=>{
    const b=document.createElement("button");
    b.textContent=`${p}. pětka`;
    b.className = (aktivniPetka===p ? `${barvaPetky(p)} text-white` : "bg-gray-300 text-black")+" px-3 py-2 rounded";
    b.onclick=()=>{ aktivniPetka=p; saveState(); render(); };
    box.appendChild(b);
  });

  root.appendChild(box);
}

function renderAkce3(){
  const box=document.createElement("div"); box.className="flex flex-wrap gap-2 mb-3";
  const b1=document.createElement("button");
  b1.textContent="🥅 Gól vstřelený";
  b1.className="bg-yellow-600 text-white px-3 py-1 rounded";
  b1.disabled=zamknuto; b1.onclick=otevriOverlayGolVstrel; box.appendChild(b1);

  const b2=document.createElement("button");
  b2.textContent="💥 Gól obdržený";
  b2.className="bg-red-700 text-white px-3 py-1 rounded";
  b2.disabled=zamknuto; b2.onclick=otevriOverlayGolObdrz; box.appendChild(b2);

  const b3=document.createElement("button");
  b3.textContent = penaltyMode ? "⛔ Trest – AKTIVNÍ" : "⛔ Trest";
  b3.className = (penaltyMode?"bg-purple-700":"bg-gray-700")+" text-white px-3 py-1 rounded";
  b3.disabled=zamknuto; b3.onclick=()=>{penaltyMode=!penaltyMode; saveState(); render();}; box.appendChild(b3);

  root.appendChild(box);
}

// ================= Grid hráčů =================
function renderHraci(){
  const grid=document.createElement("div");
  grid.className="grid grid-cols-4 gap-2 mb-4";
  let list = sortHraci(hraci).filter(h => h.active !== false);
  if(aktivniPetka>0){
    const goalies=list.filter(h=>h.typ==="B");
    const active=list.filter(h=>h.petka===aktivniPetka && h.typ!=="B");
    list=[...goalies, ...active];
  }
  list.forEach(h=>{
    const b=document.createElement("button");
    b.textContent = `#${cisloZJmena(h.jmeno)}`;
    b.className = `py-3 rounded font-bold text-white ${h.typ==="B"?"bg-black":barvaPetky(h.petka)}` + (zamknuto?" opacity-60":"");
    b.onclick=()=>klikHrac(h);
    grid.appendChild(b);
  });
  root.appendChild(grid);
}

// ================= Gólové události =================
function renderUdalosti(){
  const box=document.createElement("div"); box.className="bg-gray-800 p-4 rounded mb-4";
  const h2=document.createElement("h2"); h2.className="text-xl font-bold mb-2"; h2.textContent="📈 Gólové události";
  box.appendChild(h2);

  goloveUdalosti.forEach(e=>{
    const div=document.createElement("div");
    div.className=(e.typ==="g"?"bg-green-200":"bg-red-200")+" p-2 rounded text-sm mb-2 text-black";
    const strelec = e.strelec ? (" – "+cisloZJmena(hById(e.strelec)?.jmeno)) : (e.golman ? (" – G:"+cisloZJmena(hById(e.golman)?.jmeno)) : "");
    const A = e.asistenti?.length ? "(A: "+e.asistenti.map(id=>cisloZJmena(hById(id)?.jmeno)).join(", ")+")" : "";
    const P = e.plus?.length ? " +: "+e.plus.map(id=>cisloZJmena(hById(id)?.jmeno)).join(", ") : "";
    const M = e.minus?.length ? " −: "+e.minus.map(id=>cisloZJmena(hById(id)?.jmeno)).join(", ") : "";
    div.innerHTML = `<strong>${e.tretina}. tř. ${e.cas}</strong>: ${e.typ==="g"?"Gól":"Obdržený gól"}${strelec} ${A} ${P} ${M}`;
    box.appendChild(div);
  });

  // skóre + střely
  const score=document.createElement("div"); score.className="mt-2 font-bold";
  score.textContent="Skóre: "+souhrnSkore();
  const shots=document.createElement("div"); shots.className="font-semibold text-sm text-gray-300";
  shots.textContent="Střely: "+souhrnStrely();

  box.appendChild(score);
  box.appendChild(shots);
  root.appendChild(box);
}

// ================= Statistiky po třetinách (Zásahy zvláštní sloupec) =================
function renderStatistiky(){
  const box=document.createElement("div"); box.className="bg-gray-800 p-4 rounded";
  const h2=document.createElement("h2"); h2.className="text-xl font-bold mb-2"; h2.textContent="📊 Statistiky po třetinách";
  box.appendChild(h2);

  const table=document.createElement("table"); table.className="w-full text-sm";
  table.innerHTML=`
    <thead>
      <tr class="text-left">
        <th>#</th><th>Jméno</th><th>Typ</th><th>Pětka</th>
        <th>1. tř.</th><th>2. tř.</th><th>3. tř.</th><th>P</th><th>Celkem</th>
        <th>Zásahy (1/2/3/P)</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody=table.querySelector("tbody");

  const sumStrely={"1":0,"2":0,"3":0,"P":0};
  const sumObdr ={"1":0,"2":0,"3":0,"P":0};
  const sumZasahy={"1":0,"2":0,"3":0,"P":0};

  sortHraci(hraci).forEach(h=>{
    if(h.active===false) return;
    const s=statistiky[h.id];
    const tr=document.createElement("tr");
    const cislo=cisloZJmena(h.jmeno);

    let row=`<td>${cislo}</td><td>${h.jmeno}</td><td>${h.typ}</td><td>${h.petka||"-"}</td>`;
    let total=0;
    const perZ=[];

    ["1","2","3","P"].forEach(t=>{
      if(h.typ==="B"){
        // Brankář: sloupce = obdržené góly; zásahy do posledního sloupce
        const ob = (s.obdrzene[t]||[]).length;
        const za = (s.zasahy[t]||0);
        sumObdr[t]+=ob; sumZasahy[t]+=za;
        total += ob; // u brankáře je "Celkem" = obdržené góly
        perZ.push(za);
        row += `<td class="text-center">${ob}</td>`;
      }else{
        // Hráč: sloupce = střely
        const st = (s.strely[t]||0);
        sumStrely[t]+=st;
        total += st;
        perZ.push(0);
        row += `<td class="text-center">${st}</td>`;
      }
    });

    row += `<td class="text-center font-bold">${total}</td>`;
    row += `<td class="text-center">${perZ.join("/")}</td>`;
    tr.innerHTML=row;
    tbody.appendChild(tr);
  });

  // Řádek Celkem: střely hráčů + obdržené góly gólmanů; zásahy zvlášť
  const trSum=document.createElement("tr"); trSum.className="font-bold";
  let r=`<td>–</td><td>Celkem</td><td>–</td><td>–</td>`;
  ["1","2","3","P"].forEach(t=>{
    r+=`<td class="text-center">${(sumStrely[t]||0)+(sumObdr[t]||0)}</td>`;
  });
  r+=`<td class="text-center">–</td><td class="text-center">${["1","2","3","P"].map(t=>sumZasahy[t]||0).join("/")}</td>`;
  trSum.innerHTML=r; tbody.appendChild(trSum);

  box.appendChild(table);
  root.appendChild(box);

  // === Velké tlačítko „Ukončit zápas“ (dole pod statistikami) ===
  const endWrap = document.createElement("div");
  endWrap.className = "mt-4 flex justify-center";
  const bEnd=document.createElement("button");
  bEnd.textContent = zamknuto ? "Zápas uzamčen" : "Ukončit zápas";
  bEnd.disabled = zamknuto;
  bEnd.className = (zamknuto?"bg-gray-700":"bg-red-700 hover:bg-red-800")+" text-white px-6 py-3 rounded text-lg font-bold";
  bEnd.onclick=()=>{ if(confirm("Ukončit zápas?")){ checkpoint(); zamknuto=true; saveState(); render(); } };
  endWrap.appendChild(bEnd);
  root.appendChild(endWrap);
}

// ================= Overlay UI (s režimy výběru) =================
function renderOverlay() {
  if (!overlay) return;

  const backdrop = document.createElement("div");
  backdrop.id = OVERLAY_ID;
  backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  backdrop.onclick = (e) => { if (e.target === backdrop) zavriOverlay(); };

  const card = document.createElement("div");
  card.className = "bg-white text-black rounded p-4 max-w-4xl w-[95%] relative";

  const close = document.createElement("button");
  close.textContent = "✕";
  close.className = "absolute right-2 top-2 px-2 py-1 bg-gray-200 rounded";
  close.onclick = () => zavriOverlay();
  card.appendChild(close);

  const title = document.createElement("h3");
  title.className = "text-lg font-bold mb-2";
  title.textContent = overlay.mode === "g"
    ? "Vstřelený gól – vyber střelce, asistence (0–2) a +"
    : "Obdržený gól – vyber brankáře a −";
  card.appendChild(title);

  const info = document.createElement("div");
  info.className = "mb-3 text-sm";
  info.textContent = `Čas: ${overlay.cas} • Třetina: ${aktivniTretina}`;
  card.appendChild(info);

  // Přepínače režimu
  const modes = document.createElement("div");
  modes.className = "flex gap-2 mb-3";
  const makeChip = (key, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    const active = overlay.selectMode === key;
    b.className = (active ? "bg-black text-white" : "bg-gray-200") + " px-3 py-1 rounded";
    b.onclick = () => { overlay.selectMode = key; removeOverlayDom(); render(); };
    return b;
  };
  if (overlay.mode === "g") {
    modes.appendChild(makeChip("shooter", "Střelec"));
    modes.appendChild(makeChip("assist", "Asistence (0–2)"));
    modes.appendChild(makeChip("plus", "+ na ledě"));
  } else {
    modes.appendChild(makeChip("goalie", "Brankář"));
    modes.appendChild(makeChip("minus", "− na ledě"));
  }
  card.appendChild(modes);

  // Grid hráčů
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-6 gap-2";

  sortHraci(hraci).forEach(h => {
    const isInactive = (h.active===false);
    const btn = document.createElement("button");
    btn.textContent = cisloZJmena(h.jmeno);
    btn.className = `px-2 py-2 rounded font-bold text-white ${h.typ === "B" ? "bg-black" : barvaPetky(h.petka)} ${isInactive?"opacity-40":""}`;
    btn.disabled = isInactive;

    // zvýraznění podle role
    if (overlay.mode === "g") {
      if (overlay.shooter === h.id) btn.classList.add("ring-4", "ring-yellow-300");
      if (overlay.A?.has(h.id)) btn.classList.add("ring-4", "ring-indigo-300");
      if (overlay.plus?.has(h.id)) btn.classList.add("opacity-80");
    } else {
      if (overlay.goalie === h.id) btn.classList.add("ring-4", "ring-yellow-300");
      if (overlay.minus?.has(h.id)) btn.classList.add("ring-4", "ring-red-300");
    }

    btn.onclick = () => {
      if (overlay.mode === "g") {
        if (overlay.selectMode === "shooter") {
          overlay.shooter = (overlay.shooter === h.id) ? null : h.id;
        } else if (overlay.selectMode === "assist") {
          if (h.id === overlay.shooter) return; // střelec nemůže být asistent
          if (overlay.A.has(h.id)) overlay.A.delete(h.id);
          else if (overlay.A.size < 2) overlay.A.add(h.id); // max 2
        } else {
          // plus
          if (overlay.plus.has(h.id)) overlay.plus.delete(h.id);
          else overlay.plus.add(h.id);
        }
      } else {
        if (overlay.selectMode === "goalie") {
          if (h.typ !== "B") return;
          overlay.goalie = (overlay.goalie === h.id) ? null : h.id;
        } else {
          // minus
          if (overlay.minus.has(h.id)) overlay.minus.delete(h.id);
          else overlay.minus.add(h.id);
        }
      }
      removeOverlayDom();
      render();
    };

    grid.appendChild(btn);
  });

  // Ovládací řádek
  const row = document.createElement("div");
  row.className = "flex justify-end gap-2 mt-3";
  const save = document.createElement("button");
  save.textContent = "Uložit";
  save.className = "px-3 py-1 rounded bg-green-600 text-white";
  save.onclick = () => ulozOverlay();
  const cancel = document.createElement("button");
  cancel.textContent = "Zavřít";
  cancel.className = "px-3 py-1 rounded bg-gray-300";
  cancel.onclick = () => zavriOverlay();

  row.appendChild(save);
  row.appendChild(cancel);

  card.appendChild(grid);
  card.appendChild(row);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// ================= Import/Export =================
async function importSoupiska(file){
  checkpoint();
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data);
  const sheet=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
  hraci=[];
  for(let i=1;i<rows.length;i++){
    const [cislo,jmeno,typ,petka]=rows[i];
    if(!cislo||!jmeno||!typ) continue;
    hraci.push({id:String(i), jmeno:`${cislo} ${jmeno}`, typ:String(typ).trim(), petka:Number(petka)||0, active:true});
  }
  resetStatistik(); zamknuto=false; penaltyMode=false; aktivniPetka=0;
  saveState();
  render();
}
function exportStatistiky(){
  const sum=(o)=>Object.values(o).reduce((a,b)=>a+(typeof b==="number"?b:(Array.isArray(b)?b.length:0)),0);
  const data=hraci.map(h=>{
    const s=statistiky[h.id];
    return {
      Cislo: cisloZJmena(h.jmeno),
      Jmeno: String(h.jmeno).split(" ").slice(1).join(" "),
      Typ: h.typ, Petka: h.petka||"",
      Aktivni: (h.active!==false)?"ano":"ne",
      Strely: sum(s.strely), Goly: sum(s.goly), Asistence: sum(s.asistence),
      Plus: sum(s.plus), Minus: sum(s.minus),
      Zasahy: sum(s.zasahy), Obdrzene: sum(s.obdrzene), Tresty: sum(s.tresty)
    };
  });
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Statistiky");
  XLSX.writeFile(wb,"statistiky_zapasu.xlsx");
}

// ================= Autosave intervaly =================
setInterval(saveState, 5000);
window.addEventListener("beforeunload", saveState);

// ================= Render =================
function render(){
  root.innerHTML="";
  renderHlavicka();
  renderTretiny();
  renderDlazdicePatek();   // dlaždice pětek nad akcemi (jen pětky s hráči)
  renderAkce3();
  renderHraci();
  renderUdalosti();
  renderStatistiky();
  if(overlay) renderOverlay();
  saveState(); // autosave po každém renderu
}

// ================= Start =================
const saved = loadStateRaw();
if (saved && confirm("Najít uložený rozpracovaný zápas a obnovit?")) {
  applyState(saved);
} else {
  // demo hráči (pro rychlé vyzkoušení; klidně smaž)
  if(hraci.length===0){
    hraci=[
      {id:"1", jmeno:"1 Brankář", typ:"B", petka:0, active:true},
      {id:"2", jmeno:"12 Novák", typ:"Ú", petka:1, active:true},
      {id:"3", jmeno:"22 Dvořák", typ:"Ú", petka:1, active:true},
      {id:"4", jmeno:"33 Svoboda", typ:"O", petka:1, active:true},
      {id:"5", jmeno:"44 Novotný", typ:"O", petka:1, active:true},
      {id:"6", jmeno:"55 Malý", typ:"Ú", petka:2, active:true},
    ];
    resetStatistik();
  }
}
render();
