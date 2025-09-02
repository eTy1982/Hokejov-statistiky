// --- DIAGNOSTIKA (vložit úplně nahoru app.js) ---
(function bootstrapDiag(){
  window.addEventListener('error', function (e) {
    try {
      const msg = (e && e.message) ? e.message : String(e);
      const root = document.getElementById('root') || (function () {
        const d = document.createElement('div'); d.id = 'root'; document.body.appendChild(d); return d;
      })();
      const box = document.createElement('div');
      box.style.cssText = 'background:#7f1d1d;color:#fff;padding:12px;border-radius:8px;margin:12px 0;font-family:system-ui,Arial';
      box.innerHTML = '<strong>Chyba v app.js:</strong> ' + msg + '<br><small>Podrobnosti jsou v konzoli (F12 → Console).</small>';
      root.prepend(box);
      console.error('[APP ERROR]', e.error || e);
    } catch (_) {}
  });

  // základní sanity check
  const root = document.getElementById('root');
  if (!root) {
    const div = document.createElement('div');
    div.innerHTML = '<div style="background:#7f1d1d;color:#fff;padding:12px;border-radius:8px">Chybí &lt;div id="root"&gt; v index.html</div>';
    document.body.appendChild(div);
  }
  if (!window.XLSX) {
    console.warn('XLSX není dostupné. Zkontroluj <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"> v <head>.');
  }
})();

// HOKEJOVÁ STATISTIKA – verze s nájezdy (SO) + odstraněné tlačítko „Trest“ + export soupisky
// - Klik hráč = střela, klik gólman = zásah, dlouhý stisk (≥450 ms) = trest
// - Gólové overlaye (vstřelený/obdržený), auto+ pro střelce i asistenty
// - Undo 20 kroků, pětky (včetně barvy 4. pětky), aktivní gólman, detail hráče
// - Správa soupisky (přidat, deaktivovat, obnovit, trvale smazat, změnit číslo)
// - Archiv (filtrování, duplikace soupisky), export XLSX + CSV (transakční události)
// - Nájezdy (SO) – samostatná logika/overlay, skóre, export, archiv
// - NOVĚ: odstraněn režim tlačítka Trest; přidán export soupisky (.xlsx) ve formátu importu

const root = document.getElementById("root");

// ==== UNDO (20 kroků) ====
const UNDO_MAX = 20;
let undoStack = [];
function getSnapshot(){
  return JSON.stringify({
    hraci, statistiky, goloveUdalosti,
    infoZapasu, aktivniTretina, aktivniPetka,
    zamknuto, showRosterAdmin, showSettings,
    activeGoalieId, tilesCompact,
    shootoutAttempts
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
  showRosterAdmin = !!s.showRosterAdmin;
  showSettings = !!s.showSettings;
  activeGoalieId = s.activeGoalieId || null;
  tilesCompact = !!s.tilesCompact;
  shootoutAttempts = s.shootoutAttempts || [];
}
function checkpoint(){ try{ undoStack.push(getSnapshot()); if(undoStack.length>UNDO_MAX) undoStack.shift(); }catch{} }
function undoLast(){ if(!undoStack.length) return; const snap=undoStack.pop(); applySnapshot(snap); saveState(); render(); }

// ==== STAV ====
let hraci = [];    // {id, jmeno:"12 Novák", typ:"B|O|Ú", petka:0..5, active:true/false}
let statistiky = {};
let goloveUdalosti = []; // {typ:"g"|"o", cas, tretina, strelec?, asistenti[], plus[], minus[], golman?}
let aktivniTretina = "1";
let infoZapasu = { datum:"", cas:"", misto:"", tym:"domaci", soutez:"", stitky:"" };
let aktivniPetka = 0;
let zamknuto = false;
let showRosterAdmin = false;
let showSettings = false;
let activeGoalieId = null;
let tilesCompact = false;

// ==== NÁJEZDY (SO) ====
let shootoutAttempts = []; // {team:"us"|"opp", round:1.., shooterId?, goalieId?, result:"goal"|"miss"|"save"}

// Overlay (góly)
let overlay = null; // {mode:"g"|"o", cas, shooter?, A:Set, plus:Set, goalie?, minus:Set, selectMode:"..."}
const OVERLAY_ID = "overlay-backdrop";

// Overlay (nájezdy)
let soOverlay = null; // {view:"menu"|"us"|"opp", round:number, shooterId?, goalieId?, result?:string}

// Autosave
const STORAGE_KEY = "hokej-stat-state-v5";
const ARCHIVE_KEY = "hokej-stat-archive-v2";

function saveState(){
  const state = {
    hraci, statistiky, goloveUdalosti,
    infoZapasu, aktivniTretina, aktivniPetka,
    zamknuto, showRosterAdmin, showSettings,
    activeGoalieId, tilesCompact,
    shootoutAttempts, ts: Date.now()
  };
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{}
}
function loadStateRaw(){ try{ const raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):null; }catch{ return null; } }
function applyState(s){ applySnapshot(JSON.stringify(s)); }

// ==== Pomůcky ====
function pridejCas(popis){ const v=prompt(`${popis} (mm:ss)`,"00:00"); return v||"00:00"; }
function hById(id){ return hraci.find(h=>h.id===id); }
function cisloZJmena(j){ return String(j||"").trim().split(/\s+/)[0]||"?"; }
function jmenoBezCisla(j){ return String(j||"").trim().split(/\s+/).slice(1).join(" "); }
function sortHraci(list){
  const poradi={B:0,O:1,Ú:2};
  return [...list].sort((a,b)=>(poradi[a.typ]-poradi[b.typ])||((a.petka||0)-(b.petka||0))|| (cisloZJmena(a.jmeno).localeCompare(cisloZJmena(b.jmeno),'cs')));
}
function barvaPetky(p){
  switch(Number(p)){
    case 1:return "bg-blue-600";
    case 2:return "bg-green-600";
    case 3:return "bg-purple-600";
    case 4:return "bg-yellow-600"; // 4. pětka
    case 5:return "bg-pink-600";
    default:return "bg-gray-600";
  }
}
function hasAnyStats(id){
  const s = statistiky[id]; if(!s) return false;
  const sum = (o)=>Object.values(o).reduce((a,b)=>a+(Array.isArray(b)?b.length:b),0);
  return sum(s.strely)+sum(s.goly)+sum(s.asistence)+sum(s.plus)+sum(s.minus)+sum(s.tresty)+sum(s.zasahy)+sum(s.obdrzene) > 0;
}

// ==== Inicializace statistik ====
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
function resetStatistik(){ statistiky={}; for(const h of hraci) initStatsFor(h.id); goloveUdalosti=[]; shootoutAttempts=[]; }

// ==== Klik hráč (krátký/long press) ====
function recordPenaltyFor(h){
  const cas = pridejCas(`Čas trestu hráče #${cisloZJmena(h.jmeno)}`);
  if(!cas) return;
  checkpoint();
  statistiky[h.id].tresty[aktivniTretina].push(cas);
  saveState(); render();
}
function klikHracShort(h){
  if(zamknuto || !h || h.active===false) return;
  checkpoint();
  if(h.typ==="B"){ 
    statistiky[h.id].zasahy[aktivniTretina]++; 
  } else { 
    statistiky[h.id].strely[aktivniTretina]++; 
  }
  saveState(); render();
}
// pouze Pointer Events (bez touch/mouse duplicit)
function attachPressHandlers(btn, h){
  let timer = null;
  let longFired = false;
  const LONG_MS = 450;

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longFired = false;
    if (timer) { clearTimeout(timer); timer = null; }
    timer = setTimeout(() => {
      longFired = true;
      recordPenaltyFor(h);   // dlouhý stisk = trest
      timer = null;
    }, LONG_MS);
  };
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const onPointerUp = () => { if (!longFired) klikHracShort(h); clearTimer(); };
  const onPointerCancel = () => { clearTimer(); };

  btn.addEventListener("pointerdown", onPointerDown);
  btn.addEventListener("pointerup", onPointerUp);
  btn.addEventListener("pointercancel", onPointerCancel);
  btn.addEventListener("pointerleave", onPointerCancel);
}

// ==== Souhrn skóre + střely ====
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

// ==== Overlay – Góly ====
function otevriOverlayGolVstrel(){
  if(zamknuto) return;
  const cas = pridejCas("Čas vstřeleného gólu");
  overlay = { mode:"g", cas, A:new Set(), plus:new Set(), shooter:null, selectMode:"shooter" };
  render();
}
function otevriOverlayGolObdrz(){
  if(zamknuto) return;
  const cas = pridejCas("Čas obdrženého gólu");
  overlay = { mode:"o", cas, minus:new Set(), goalie: activeGoalieId || null, selectMode:"goalie" };
  render();
}
function removeOverlayDom(){ const el=document.getElementById(OVERLAY_ID); if(el&&el.parentNode) el.parentNode.removeChild(el); }
function zavriOverlay(){ overlay=null; removeOverlayDom(); render(); }

function ulozOverlay(){
  if(!overlay) return;
  checkpoint();
  removeOverlayDom();
  const t = aktivniTretina;

  if(overlay.mode==="g"){
    if(!overlay.shooter){ alert("Vyber střelce."); return; }
    const sShooter = statistiky[overlay.shooter];
    sShooter.goly[t].push(overlay.cas);
    sShooter.plus[t]++; // auto+

    const asistArr = Array.from(overlay.A||[]).slice(0,2);
    for(const id of asistArr){ statistiky[id].asistence[t]++; statistiky[id].plus[t]++; } // auto+ i pro A

    const plusArr = Array.from(overlay.plus||[]);
    for(const id of plusArr){ if(id!==overlay.shooter && !asistArr.includes(id)) statistiky[id].plus[t]++; }

    const plusDisplay = Array.from(new Set([overlay.shooter, ...asistArr, ...plusArr]));
    goloveUdalosti.push({ typ:"g", cas:overlay.cas, tretina:t, strelec:overlay.shooter, asistenti:asistArr, plus:plusDisplay });

  } else {
    if(!overlay.goalie){ alert("Vyber brankáře."); return; }
    const sGoalie = statistiky[overlay.goalie];
    sGoalie.obdrzene[t].push(overlay.cas); // nepočítat jako střelu/zásah
    const minusArr = Array.from(overlay.minus||[]);
    for(const id of minusArr){ statistiky[id].minus[t]++; }
    goloveUdalosti.push({ typ:"o", cas:overlay.cas, tretina:t, golman:overlay.goalie, minus:minusArr });
  }

  overlay=null; saveState(); render();
}

// ==== Edit poslední gólové události ====
function revertEventEffects(e){
  const t=e.tretina;
  if(e.typ==="g"){
    const sShooter=statistiky[e.strelec];
    if(sShooter){
      const arr=sShooter.goly[t]; const idx=arr.lastIndexOf(e.cas); if(idx>-1) arr.splice(idx,1);
      if(sShooter.plus[t]>0) sShooter.plus[t]--;
    }
    (e.asistenti||[]).forEach(id=>{
      const s=statistiky[id]; if(!s) return;
      if(s.asistence[t]>0) s.asistence[t]--;
      if(s.plus[t]>0) s.plus[t]--;
    });
    (e.plus||[]).forEach(id=>{
      if(id===e.strelec) return;
      if((e.asistenti||[]).includes(id)) return;
      const s=statistiky[id]; if(s && s.plus[t]>0) s.plus[t]--;
    });
  } else {
    const sG=statistiky[e.golman];
    if(sG){
      const arr=sG.obdrzene[t]; const idx=arr.lastIndexOf(e.cas); if(idx>-1) arr.splice(idx,1);
    }
    (e.minus||[]).forEach(id=>{ const s=statistiky[id]; if(s && s.minus[t]>0) s.minus[t]--; });
  }
}
function editLastEvent(){
  if(!goloveUdalosti.length){ alert("Žádná událost k úpravě."); return; }
  checkpoint();
  const last = goloveUdalosti.pop();
  revertEventEffects(last);
  if(last.typ==="g"){
    overlay = { mode:"g", cas:last.cas, A:new Set(last.asistenti||[]), plus:new Set((last.plus||[]).filter(id=>id!==last.strelec && !(last.asistenti||[]).includes(id))), shooter:last.strelec||null, selectMode:"shooter" };
  }else{
    overlay = { mode:"o", cas:last.cas, minus:new Set(last.minus||[]), goalie:last.golman||activeGoalieId||null, selectMode:"goalie" };
  }
  render();
}

// ==== NÁJEZDY – logika ====
function shootoutCounts(){
  const us = shootoutAttempts.filter(a=>a.team==="us").length;
  const opp = shootoutAttempts.filter(a=>a.team==="opp").length;
  return {us, opp};
}
function shootoutScore(){
  const usGoals = shootoutAttempts.filter(a=>a.team==="us" && a.result==="goal").length;
  const oppGoals = shootoutAttempts.filter(a=>a.team==="opp" && a.result==="goal").length;
  const rounds = Math.max(shootoutCounts().us, shootoutCounts().opp);
  return {us:usGoals, opp:oppGoals, rounds};
}
function nextRound(team){
  const {us, opp} = shootoutCounts();
  if(team==="us") return us+1 > opp ? us : us+1;
  return opp+1 > us ? opp : opp+1;
}
function addShootoutAttempt(a){
  checkpoint();
  const round = nextRound(a.team);
  shootoutAttempts.push({...a, round});
  saveState(); render();
}
function undoLastShootout(){
  if(!shootoutAttempts.length) return;
  checkpoint();
  shootoutAttempts.pop();
  saveState(); render();
}
function clearShootout(){
  if(!shootoutAttempts.length) return;
  if(!confirm("Vymazat všechny nájezdy?")) return;
  checkpoint(); shootoutAttempts=[]; saveState(); render();
}

// ==== Overlay – NÁJEZDY ====
function openShootoutOverlay(){
  if(zamknuto) return;
  soOverlay = { view:"menu" };
  render();
}
function closeShootoutOverlay(){
  soOverlay = null;
  const el = document.getElementById("so-overlay");
  if(el && el.parentNode) el.parentNode.removeChild(el);
  render();
}
function renderShootoutOverlay(){
  if(!soOverlay) return;
  const backdrop=document.createElement("div");
  backdrop.id="so-overlay";
  backdrop.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  backdrop.onclick=(e)=>{ if(e.target===backdrop) closeShootoutOverlay(); };

  const card=document.createElement("div");
  card.className="bg-white text-black rounded p-4 max-w-4xl w-[95%] relative";

  const close=document.createElement("button");
  close.textContent="✕";
  close.className="absolute right-2 top-2 px-2 py-1 bg-gray-200 rounded";
  close.onclick=()=>closeShootoutOverlay();
  card.appendChild(close);

  const h=document.createElement("h3");
  h.className="text-lg font-bold mb-2";
  h.textContent="Samostatné nájezdy";
  card.appendChild(h);

  const sc = shootoutScore();
  const sum=document.createElement("div");
  sum.className="mb-3 font-semibold";
  sum.textContent=`Nájezdy: ${sc.us}:${sc.opp} (${sc.rounds} kol)`;
  card.appendChild(sum);

  const bar=document.createElement("div");
  bar.className="flex flex-wrap gap-2 mb-3";
  const bUndo=document.createElement("button"); bUndo.textContent="↩︎ Vrátit poslední pokus"; bUndo.className="px-3 py-1 rounded bg-gray-300"; bUndo.onclick=undoLastShootout;
  const bClear=document.createElement("button"); bClear.textContent="🧹 Vymazat vše"; bClear.className="px-3 py-1 rounded bg-gray-300"; bClear.onclick=clearShootout;
  bar.appendChild(bUndo); bar.appendChild(bClear);
  card.appendChild(bar);

  if(soOverlay.view==="menu"){
    const menu=document.createElement("div");
    menu.className="grid grid-cols-2 gap-3";
    const bUs=document.createElement("button"); bUs.textContent="🥅 Náš pokus"; bUs.className="px-4 py-6 rounded text-white bg-green-600 text-xl font-bold";
    bUs.onclick=()=>{ soOverlay={view:"us", shooterId:null, result:null}; closeShootoutOverlay(); render(); };
    const bOpp=document.createElement("button"); bOpp.textContent="💥 Soupeřův pokus"; bOpp.className="px-4 py-6 rounded text-white bg-red-600 text-xl font-bold";
    bOpp.onclick=()=>{ soOverlay={view:"opp", goalieId:activeGoalieId||null, result:null}; closeShootoutOverlay(); render(); };
    menu.appendChild(bUs); menu.appendChild(bOpp);
    card.appendChild(menu);

  }else if(soOverlay.view==="us"){
    const row=document.createElement("div"); row.className="mb-2 font-semibold"; row.textContent="Vyber střelce a výsledek:";
    card.appendChild(row);

    const grid=document.createElement("div"); grid.className="grid grid-cols-6 gap-2 mb-3";
    sortHraci(hraci).filter(h=>h.active!==false && h.typ!=="B").forEach(h=>{
      const b=document.createElement("button");
      b.textContent=cisloZJmena(h.jmeno);
      b.className=`px-2 py-2 rounded font-bold text-white ${barvaPetky(h.petka)} ${soOverlay.shooterId===h.id?"ring-4 ring-yellow-300":""}`;
      b.onclick=()=>{ soOverlay.shooterId = (soOverlay.shooterId===h.id?null:h.id); closeShootoutOverlay(); render(); };
      grid.appendChild(b);
    });
    card.appendChild(grid);

    const res=document.createElement("div"); res.className="flex gap-2";
    const g=document.createElement("button"); g.textContent="Gól"; g.className="px-3 py-2 rounded bg-green-700 text-white";
    g.onclick=()=>{ if(!soOverlay.shooterId){ alert("Vyber střelce."); return; } addShootoutAttempt({team:"us", shooterId:soOverlay.shooterId, result:"goal"}); closeShootoutOverlay(); };
    const m=document.createElement("button"); m.textContent="Neúspěch"; m.className="px-3 py-2 rounded bg-gray-600 text-white";
    m.onclick=()=>{ if(!soOverlay.shooterId){ alert("Vyber střelce."); return; } addShootoutAttempt({team:"us", shooterId:soOverlay.shooterId, result:"miss"}); closeShootoutOverlay(); };
    const back=document.createElement("button"); back.textContent="Zpět do menu"; back.className="px-3 py-2 rounded bg-gray-300"; back.onclick=()=>{ soOverlay={view:"menu"}; closeShootoutOverlay(); render(); };
    res.appendChild(g); res.appendChild(m); res.appendChild(back);
    card.appendChild(res);

  }else if(soOverlay.view==="opp"){
    const row=document.createElement("div"); row.className="mb-2 font-semibold"; row.textContent="Vyber našeho gólmana a výsledek:";
    card.appendChild(row);

    const grid=document.createElement("div"); grid.className="grid grid-cols-6 gap-2 mb-3";
    sortHraci(hraci).filter(h=>h.active!==false && h.typ==="B").forEach(h=>{
      const b=document.createElement("button");
      b.textContent=cisloZJmena(h.jmeno);
      b.className=`px-2 py-2 rounded font-bold text-white bg-black ${soOverlay.goalieId===h.id?"ring-4 ring-yellow-300":""}`;
      b.onclick=()=>{ soOverlay.goalieId=(soOverlay.goalieId===h.id?null:h.id); closeShootoutOverlay(); render(); };
      grid.appendChild(b);
    });
    card.appendChild(grid);

    const res=document.createElement("div"); res.className="flex gap-2";
    const g=document.createElement("button"); g.textContent="Gól soupeře"; g.className="px-3 py-2 rounded bg-red-700 text-white";
    g.onclick=()=>{ if(!soOverlay.goalieId){ alert("Vyber gólmana."); return; } addShootoutAttempt({team:"opp", goalieId:soOverlay.goalieId, result:"goal"}); closeShootoutOverlay(); };
    const s=document.createElement("button"); s.textContent="Zákrok (save)"; s.className="px-3 py-2 rounded bg-green-700 text-white";
    s.onclick=()=>{ if(!soOverlay.goalieId){ alert("Vyber gólmana."); return; } addShootoutAttempt({team:"opp", goalieId:soOverlay.goalieId, result:"save"}); closeShootoutOverlay(); };
    const back=document.createElement("button"); back.textContent="Zpět do menu"; back.className="px-3 py-2 rounded bg-gray-300"; back.onclick=()=>{ soOverlay={view:"menu"}; closeShootoutOverlay(); render(); };
    res.appendChild(g); res.appendChild(s); res.appendChild(back);
    card.appendChild(res);
  }

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// ==== HLAVIČKA ====
function renderHlavicka(){
  const wrap=document.createElement("div");
  wrap.className="p-3 bg-gray-900 rounded mb-3 flex flex-col gap-3 border border-gray-700";

  const line=document.createElement("div");
  line.className="flex flex-wrap gap-3 items-end";

  const pole=(label,key,type="text")=>{
    const w=document.createElement("div"); w.className="flex flex-col";
    const l=document.createElement("label"); l.className="text-xs text-gray-400"; l.textContent=label;
    const i=document.createElement("input"); i.type=type; i.value=infoZapasu[key]||""; i.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
    i.oninput=()=>{ infoZapasu[key]=i.value; saveState(); };
    w.appendChild(l); w.appendChild(i); return w;
  };

  line.appendChild(pole("Datum","datum","date"));
  line.appendChild(pole("Čas","cas","time"));
  line.appendChild(pole("Místo","misto","text"));

  const dWrap=document.createElement("div"); dWrap.className="flex flex-col";
  const dLbl=document.createElement("label"); dLbl.className="text-xs text-gray-400"; dLbl.textContent="Domácí / Hosté";
  const dSel=document.createElement("select"); dSel.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
  [["domaci","Jsme domácí"],["host","Jsme hosté"]].forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; if(infoZapasu.tym===v) o.selected=true; dSel.appendChild(o); });
  dSel.onchange=()=>{ infoZapasu.tym=dSel.value; saveState(); render(); };
  dWrap.appendChild(dLbl); dWrap.appendChild(dSel);
  line.appendChild(dWrap);

  // Gólman na ledě
  const gWrap=document.createElement("div"); gWrap.className="flex flex-col";
  const gLbl=document.createElement("label"); gLbl.className="text-xs text-gray-400"; gLbl.textContent="Gólman na ledě";
  const gSel=document.createElement("select"); gSel.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
  const goalies=hraci.filter(h=>h.active!==false && h.typ==="B");
  const optNone=document.createElement("option"); optNone.value=""; optNone.textContent="— nevybrán —"; gSel.appendChild(optNone);
  goalies.forEach(g=>{ const o=document.createElement("option"); o.value=g.id; o.textContent=`#${cisloZJmena(g.jmeno)} ${jmenoBezCisla(g.jmeno)}`; if(activeGoalieId===g.id) o.selected=true; gSel.appendChild(o); });
  gSel.onchange=()=>{ activeGoalieId = gSel.value||null; saveState(); render(); };
  gWrap.appendChild(gLbl); gWrap.appendChild(gSel);
  line.appendChild(gWrap);

  const actions=document.createElement("div"); actions.className="flex gap-2 ml-auto items-end";

  const bUndo=document.createElement("button");
  bUndo.textContent="↩︎ Zpět";
  bUndo.className="px-3 py-1 rounded bg-gray-700";
  bUndo.disabled=undoStack.length===0;
  bUndo.onclick=()=>undoLast();
  actions.appendChild(bUndo);

  const bSettings=document.createElement("button");
  bSettings.innerHTML="⚙️";
  bSettings.title="Nastavení";
  bSettings.className=(showSettings?"bg-blue-700":"bg-gray-700")+" px-3 py-1 rounded";
  bSettings.onclick=()=>{ showSettings=!showSettings; saveState(); render(); };
  actions.appendChild(bSettings);

  const bNew=document.createElement("button");
  bNew.textContent="🆕 Nový zápas";
  bNew.className="px-3 py-1 rounded bg-gray-700";
  bNew.onclick=()=>{
    if(!confirm("Smazat statistiky a začít nový zápas? Soupiska zůstane.")) return;
    checkpoint(); goloveUdalosti=[]; resetStatistik(); zamknuto=false; aktivniPetka=0; activeGoalieId=null; saveState(); render();
  };
  actions.appendChild(bNew);

  line.appendChild(actions);

  const score=document.createElement("div"); score.className="font-bold"; score.textContent="Skóre: "+souhrnSkore();
  const shots=document.createElement("div"); shots.className="font-semibold text-sm text-gray-300"; shots.textContent="Střely: "+souhrnStrely();

  wrap.appendChild(line);
  wrap.appendChild(score);
  wrap.appendChild(shots);
  root.appendChild(wrap);

  if(showSettings) renderSettingsPanel();
}

// ==== Nastavení (vč. správy a archivu) ====
function renderSettingsPanel(){
  const box=document.createElement("div"); box.className="p-3 bg-gray-800 rounded mb-3 border border-gray-700";

  const top=document.createElement("div"); top.className="flex flex-wrap gap-3 items-end mb-3";
  const tWrap=document.createElement("div"); tWrap.className="flex items-center gap-2";
  const tLbl=document.createElement("label"); tLbl.textContent="Dlaždice:"; tLbl.className="text-sm";
  const tBtn=document.createElement("button"); tBtn.textContent = tilesCompact ? "Kompakt" : "Velké"; tBtn.className="px-3 py-1 rounded "+(tilesCompact?"bg-gray-600":"bg-gray-700"); tBtn.onclick=()=>{ tilesCompact=!tilesCompact; saveState(); render(); };
  tWrap.appendChild(tLbl); tWrap.appendChild(tBtn); top.appendChild(tWrap);

  const sWrap=document.createElement("div"); sWrap.className="flex flex-col";
  const sLbl=document.createElement("label"); sLbl.className="text-xs text-gray-300"; sLbl.textContent="Soutěž";
  const sInp=document.createElement("input"); sInp.className="px-2 py-1 rounded bg-gray-900 border border-gray-700"; sInp.value=infoZapasu.soutez||""; sInp.oninput=()=>{ infoZapasu.soutez=sInp.value; saveState(); };
  sWrap.appendChild(sLbl); sWrap.appendChild(sInp); top.appendChild(sWrap);

  const tagWrap=document.createElement("div"); tagWrap.className="flex flex-col";
  const tagLbl=document.createElement("label"); tagLbl.className="text-xs text-gray-300"; tagLbl.textContent="Štítky (čárkou)";
  const tagInp=document.createElement("input"); tagInp.className="px-2 py-1 rounded bg-gray-900 border border-gray-700"; tagInp.value=infoZapasu.stitky||""; tagInp.oninput=()=>{ infoZapasu.stitky=tagInp.value; saveState(); };
  tagWrap.appendChild(tagLbl); tagWrap.appendChild(tagInp); top.appendChild(tagWrap);

  const right=document.createElement("div"); right.className="flex gap-2 ml-auto";
  const fileLabel=document.createElement("label"); fileLabel.className="px-3 py-1 rounded bg-gray-700 cursor-pointer"; fileLabel.textContent="📥 Import .xlsx";
  const fileInput=document.createElement("input"); fileInput.type="file"; fileInput.accept=".xlsx"; fileInput.className="hidden"; fileInput.onchange=(e)=>{ if(e.target.files?.length) importSoupiska(e.target.files[0]); };
  fileLabel.appendChild(fileInput); right.appendChild(fileLabel);
  const bPrint=document.createElement("button"); bPrint.textContent="🖨️ Tisk"; bPrint.className="px-3 py-1 rounded bg-gray-700"; bPrint.onclick=()=>window.print(); right.appendChild(bPrint);
  const bExp=document.createElement("button"); bExp.textContent="📤 Export XLSX"; bExp.className="px-3 py-1 rounded bg-green-700"; bExp.onclick=exportStatistiky; right.appendChild(bExp);
  const bCSV=document.createElement("button"); bCSV.textContent="📄 Export CSV (události)"; bCSV.className="px-3 py-1 rounded bg-green-700"; bCSV.onclick=exportCSVUdalosti; right.appendChild(bCSV);
  const bRoster=document.createElement("button"); bRoster.textContent="📦 Export soupisky (.xlsx)"; bRoster.className="px-3 py-1 rounded bg-blue-700"; bRoster.onclick=exportSoupiska; right.appendChild(bRoster);

  top.appendChild(right);
  box.appendChild(top);

  const toggle=document.createElement("button"); toggle.textContent = showRosterAdmin ? "✓ Správa soupisky" : "⚙️ Správa soupisky"; toggle.className=(showRosterAdmin?"bg-blue-700":"bg-gray-700")+" px-3 py-1 rounded mb-3"; toggle.onclick=()=>{ showRosterAdmin=!showRosterAdmin; saveState(); render(); };
  box.appendChild(toggle);
  if(showRosterAdmin) renderRosterAdmin(box);

  renderArchiv(box);
  root.appendChild(box);
}

// ==== Správa soupisky ====
function addManualPlayer(cislo, jmeno, typ, petka){
  checkpoint();
  const id=String(Date.now());
  const fullName=`${String(cislo||"").trim()} ${String(jmeno||"").trim()}`.trim();
  const t=(typ||"").toUpperCase(); const valid=["B","O","Ú"];
  if(!fullName || !valid.includes(t)){ alert("Zkontroluj číslo/jméno a typ (B/O/Ú)."); return; }
  hraci.push({id, jmeno:fullName, typ:t, petka:Number(petka)||0, active:true});
  initStatsFor(id); saveState(); render();
}
function softDeletePlayer(id){
  checkpoint();
  const h=hraci.find(x=>x.id===id); if(!h) return;
  if(!confirm(`Deaktivovat hráče ${h.jmeno}? Události v historii zůstanou.`)) return;
  h.active=false; saveState(); render();
}
function restorePlayer(id){
  checkpoint();
  const h=hraci.find(x=>x.id===id); if(!h) return;
  h.active=true; saveState(); render();
}
function deletePlayerHard(id){
  const h=hraci.find(x=>x.id===id); if(!h) return;
  if(hasAnyStats(id)){ alert("Nelze smazat – hráč má záznamy. Použij deaktivaci."); return; }
  checkpoint();
  hraci = hraci.filter(x=>x.id!==id);
  delete statistiky[id];
  if(activeGoalieId===id) activeGoalieId=null;
  saveState(); render();
}
function editPlayerNumber(id){
  const h=hraci.find(x=>x.id===id); if(!h) return;
  const current = cisloZJmena(h.jmeno);
  const nov = prompt(`Nové číslo hráče ${h.jmeno}`, current);
  if(nov===null) return;
  const jmeno = jmenoBezCisla(h.jmeno);
  h.jmeno = `${String(nov).trim()} ${jmeno}`.trim();
  saveState(); render();
}
function renderRosterAdmin(container){
  const box=document.createElement("div");
  box.className="p-3 bg-gray-900 rounded border border-gray-700";
  const title=document.createElement("div"); title.className="font-bold mb-2"; title.textContent="Správa soupisky – přidání / deaktivace / obnova / smazání / úprava čísla"; box.appendChild(title);

  const form=document.createElement("div"); form.className="flex flex-wrap items-end gap-2 mb-3";
  const mk=(label,type="text",attrs={})=>{ const w=document.createElement("div"); w.className="flex flex-col"; const l=document.createElement("label"); l.className="text-xs text-gray-300"; l.textContent=label; const i=document.createElement("input"); i.type=type; i.className="px-2 py-1 rounded bg-gray-800 border border-gray-700"; Object.assign(i,attrs); w.appendChild(l); w.appendChild(i); return [w,i]; };
  const [wNum,inNum]=mk("Číslo","text",{placeholder:"např. 12"});
  const [wName,inName]=mk("Jméno","text",{placeholder:"Novák"});
  const selW=document.createElement("div"); selW.className="flex flex-col"; const selL=document.createElement("label"); selL.className="text-xs text-gray-300"; selL.textContent="Typ (B/O/Ú)";
  const sel=document.createElement("select"); sel.className="px-2 py-1 rounded bg-gray-800 border border-gray-700"; ["B","O","Ú"].forEach(v=>{ const o=document.createElement("option"); o.value=v; o.textContent=v; sel.appendChild(o);}); selW.appendChild(selL); selW.appendChild(sel);
  const [wLine,inLine]=mk("Pětka (1–5)","number",{min:0,max:5,placeholder:"1"});
  const addBtn=document.createElement("button"); addBtn.textContent="➕ Přidat hráče"; addBtn.className="px-3 py-1 rounded bg-green-700";
  addBtn.onclick=()=>{ addManualPlayer(inNum.value,inName.value,sel.value,inLine.value); inNum.value=""; inName.value=""; inLine.value=""; };
  form.appendChild(wNum); form.appendChild(wName); form.appendChild(selW); form.appendChild(wLine); form.appendChild(addBtn);
  box.appendChild(form);

  const activeBox=document.createElement("div"); activeBox.className="mb-2"; activeBox.innerHTML=`<div class="font-semibold mb-1">Aktivní hráči</div>`;
  const actWrap=document.createElement("div"); actWrap.className="flex flex-wrap gap-2";
  sortHraci(hraci).filter(h=>h.active!==false).forEach(h=>{
    const chip=document.createElement("div"); chip.className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700";
    chip.innerHTML=`<span>#${cisloZJmena(h.jmeno)} ${jmenoBezCisla(h.jmeno)} (${h.typ}${h.petka?`, ${h.petka}.`:``})</span>`;
    const edit=document.createElement("button"); edit.textContent="č."; edit.className="px-2 py-0.5 rounded bg-blue-700"; edit.onclick=()=>editPlayerNumber(h.id);
    const del=document.createElement("button"); del.textContent="×"; del.className="px-2 py-0.5 rounded bg-red-700"; del.onclick=()=>softDeletePlayer(h.id);
    chip.appendChild(edit); chip.appendChild(del); actWrap.appendChild(chip);
  });
  activeBox.appendChild(actWrap); box.appendChild(activeBox);

  const inactive=hraci.filter(h=>h.active===false);
  if(inactive.length){
    const deadBox=document.createElement("div"); deadBox.className="mt-2"; deadBox.innerHTML=`<div class="font-semibold mb-1">Neaktivní hráči</div>`;
    const deadWrap=document.createElement("div"); deadWrap.className="flex flex-wrap gap-2";
    sortHraci(inactive).forEach(h=>{
      const chip=document.createElement("div"); chip.className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700";
      chip.innerHTML=`<span>#${cisloZJmena(h.jmeno)} ${jmenoBezCisla(h.jmeno)} (${h.typ}${h.petka?`, ${h.petka}.`:``})</span>`;
      const restore=document.createElement("button"); restore.textContent="↺"; restore.className="px-2 py-0.5 rounded bg-blue-700"; restore.onclick=()=>restorePlayer(h.id);
      const hard=document.createElement("button"); hard.textContent="🗑️"; hard.className="px-2 py-0.5 rounded bg-red-800"; hard.title="Smazat natrvalo (jen bez záznamů)"; hard.onclick=()=>deletePlayerHard(h.id);
      chip.appendChild(restore); chip.appendChild(hard); deadWrap.appendChild(chip);
    });
    deadBox.appendChild(deadWrap); box.appendChild(deadBox);
  }

  container.appendChild(box);
}

// ==== Třetiny / pětky / akce ====
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
  const set=new Set();
  hraci.forEach(h=>{ if(h.active!==false && h.typ!=="B" && h.petka && h.petka>0) set.add(h.petka); });
  return Array.from(set).sort((a,b)=>a-b);
}
function renderDlazdicePatek(){
  const box=document.createElement("div"); box.className="flex flex-wrap gap-2 mb-3";
  const bAll=document.createElement("button"); bAll.textContent="Vše"; bAll.className=(aktivniPetka===0?"bg-gray-700 text-white":"bg-gray-300 text-black")+" px-3 py-2 rounded"; bAll.onclick=()=>{ aktivniPetka=0; saveState(); render(); }; box.appendChild(bAll);
  seznamPeticKZobrazeni().forEach(p=>{
    const b=document.createElement("button"); b.textContent=`${p}. pětka`; b.className=(aktivniPetka===p?`${barvaPetky(p)} text-white`:"bg-gray-300 text-black")+" px-3 py-2 rounded"; b.onclick=()=>{ aktivniPetka=p; saveState(); render(); }; box.appendChild(b);
  });
  root.appendChild(box);
}
function renderAkce3(){
  const box=document.createElement("div"); box.className="flex flex-wrap gap-2 mb-3";
  const b1=document.createElement("button"); b1.textContent="🥅 Gól vstřelený"; b1.className="bg-yellow-600 text-white px-3 py-1 rounded"; b1.disabled=zamknuto; b1.onclick=otevriOverlayGolVstrel; box.appendChild(b1);
  const b2=document.createElement("button"); b2.textContent="💥 Gól obdržený"; b2.className="bg-red-700 text-white px-3 py-1 rounded"; b2.disabled=zamknuto; b2.onclick=otevriOverlayGolObdrz; box.appendChild(b2);
  const bEdit=document.createElement("button"); bEdit.textContent="✏️ Upravit poslední"; bEdit.className="bg-gray-700 text-white px-3 py-1 rounded"; bEdit.disabled=goloveUdalosti.length===0; bEdit.onclick=editLastEvent; box.appendChild(bEdit);
  const bSO=document.createElement("button"); bSO.textContent="⚔️ Nájezdy"; bSO.className="bg-gray-700 text-white px-3 py-1 rounded"; bSO.onclick=openShootoutOverlay; box.appendChild(bSO);
  root.appendChild(box);
}

// ==== Grid hráčů ====
function renderHraci(){
  const grid=document.createElement("div");
  grid.className=`grid ${tilesCompact?"grid-cols-5":"grid-cols-4"} gap-2 mb-4`;
  let list=sortHraci(hraci).filter(h=>h.active!==false);
  if(aktivniPetka>0){
    const goalies=list.filter(h=>h.typ==="B");
    const active=list.filter(h=>h.petka===aktivniPetka && h.typ!=="B");
    list=[...goalies,...active];
  }
  list.forEach(h=>{
    const b=document.createElement("button");
    const isGoalie = h.typ==="B";
    const size = tilesCompact ? "py-2 text-base" : "py-4 text-xl";
    b.textContent=`#${cisloZJmena(h.jmeno)}`;
    b.className=`${size} rounded font-bold text-white ${isGoalie?"bg-black":barvaPetky(h.petka)} ` + (zamknuto?"opacity-60":"");
    if(isGoalie && activeGoalieId===h.id) b.classList.add("ring-4","ring-yellow-300");
    attachPressHandlers(b,h);
    grid.appendChild(b);
  });
  root.appendChild(grid);
}

// ==== Gólové události + SO řádek ====
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
    div.innerHTML=`<strong>${e.tretina}. tř. ${e.cas}</strong>: ${e.typ==="g"?"Gól":"Obdržený gól"}${strelec} ${A} ${P} ${M}`;
    box.appendChild(div);
  });

  // skóre + střely
  const score=document.createElement("div"); score.className="mt-2 font-bold"; score.textContent="Skóre: "+souhrnSkore();
  const shots=document.createElement("div"); shots.className="font-semibold text-sm text-gray-300"; shots.textContent="Střely: "+souhrnStrely();
  box.appendChild(score); box.appendChild(shots);

  // Nájezdy – souhrn (jen když existují)
  if(shootoutAttempts.length){
    const sc=shootoutScore();
    const so=document.createElement("div"); so.className="font-bold mt-1";
    so.textContent=`Nájezdy: ${sc.us}:${sc.opp} (${sc.rounds} kol)`;
    box.appendChild(so);
  }

  root.appendChild(box);
}

// ==== Statistiky (po třetinách + součty + detail hráče) ====
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
        <th>G</th><th>A</th><th>+</th><th>−</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody=table.querySelector("tbody");

  const sumStrely={"1":0,"2":0,"3":0,"P":0};
  const sumObdr ={"1":0,"2":0,"3":0,"P":0};
  const sumZasahy={"1":0,"2":0,"3":0,"P":0};
  let sumG=0,sumA=0,sumPlus=0,sumMinus=0;

  sortHraci(hraci).forEach(h=>{
    if(h.active===false) return;
    const s=statistiky[h.id];
    const tr=document.createElement("tr");
    const cislo=cisloZJmena(h.jmeno);

    const td=(html)=>{ const el=document.createElement("td"); el.innerHTML=html; return el; };

    tr.appendChild(td(cislo));
    const nameTd=td(h.jmeno);
    nameTd.style.cursor="pointer";
    nameTd.onclick=()=>openPlayerDetail(h.id);
    tr.appendChild(nameTd);

    tr.appendChild(td(h.typ));
    tr.appendChild(td(h.petka||"-"));

    let total=0;
    const zasahyPer=["1","2","3","P"].map(t=> (h.typ==="B") ? (s.zasahy[t]||0) : 0 );

    ["1","2","3","P"].forEach(t=>{
      if(h.typ==="B"){
        const ob=(s.obdrzene[t]||[]).length; const za=(s.zasahy[t]||0);
        sumObdr[t]+=ob; sumZasahy[t]+=za; total+=ob;
        tr.appendChild(td(`<div class="text-center">${ob}</div>`));
      }else{
        const st=(s.strely[t]||0);
        sumStrely[t]+=st; total+=st;
        tr.appendChild(td(`<div class="text-center">${st}</div>`));
      }
    });

    tr.appendChild(td(`<div class="text-center font-bold">${total}</div>`));
    tr.appendChild(td(`<div class="text-center">${zasahyPer.join("/")}</div>`));

    const G = h.typ==="B" ? Object.values(s.obdrzene).reduce((a,arr)=>a+arr.length,0) : Object.values(s.goly).reduce((a,arr)=>a+arr.length,0);
    const A = Object.values(s.asistence).reduce((a,b)=>a+b,0);
    const P = Object.values(s.plus).reduce((a,b)=>a+b,0);
    const M = Object.values(s.minus).reduce((a,b)=>a+b,0);
    sumG+=G; sumA+=A; sumPlus+=P; sumMinus+=M;

    tr.appendChild(td(`<div class="text-center">${G}</div>`));
    tr.appendChild(td(`<div class="text-center">${A}</div>`));
    tr.appendChild(td(`<div class="text-center">${P}</div>`));
    tr.appendChild(td(`<div class="text-center">${M}</div>`));

    tbody.appendChild(tr);
  });

  // řádek Celkem
  const trSum=document.createElement("tr"); trSum.className="font-bold";
  let r=`<td>–</td><td>Celkem</td><td>–</td><td>–</td>`;
  ["1","2","3","P"].forEach(t=>{ r+=`<td class="text-center">${(sumStrely[t]||0)+(sumObdr[t]||0)}</td>`; });
  r+=`<td class="text-center">–</td>`;
  r+=`<td class="text-center">${sumG}</td><td class="text-center">${sumA}</td><td class="text-center">${sumPlus}</td><td class="text-center">${sumMinus}</td>`;
  trSum.innerHTML=r; tbody.appendChild(trSum);

  box.appendChild(table);
  root.appendChild(box);

  // velké tlačítko „Ukončit zápas“
  const endWrap=document.createElement("div"); endWrap.className="mt-4 flex justify-center";
  const bEnd=document.createElement("button");
  bEnd.textContent=zamknuto?"Zápas uzamčen":"Ukončit zápas";
  bEnd.disabled=zamknuto;
  bEnd.className=(zamknuto?"bg-gray-700":"bg-red-700 hover:bg-red-800")+" text-white px-6 py-3 rounded text-lg font-bold";
  bEnd.onclick=()=>{ if(confirm("Ukončit zápas a uložit do archivu?")){ checkpoint(); zamknuto=true; ulozDoArchivu(); saveState(); render(); } };
  endWrap.appendChild(bEnd); root.appendChild(endWrap);
}

// ==== Detail hráče ====
function openPlayerDetail(id){
  const h=hById(id); if(!h) return;
  const s=statistiky[id];

  const backdrop=document.createElement("div"); backdrop.id="player-detail"; backdrop.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  backdrop.onclick=(e)=>{ if(e.target===backdrop) document.body.removeChild(backdrop); };

  const card=document.createElement("div"); card.className="bg-white text-black rounded p-4 max-w-3xl w-[95%] relative";
  const close=document.createElement("button"); close.textContent="✕"; close.className="absolute right-2 top-2 px-2 py-1 bg-gray-200 rounded"; close.onclick=()=>document.body.removeChild(backdrop);
  card.appendChild(close);

  const title=document.createElement("h3"); title.className="text-lg font-bold mb-2"; title.textContent=`#${cisloZJmena(h.jmeno)} ${jmenoBezCisla(h.jmeno)} – detail`;
  card.appendChild(title);

  const grid=document.createElement("div"); grid.className="grid grid-cols-2 gap-3 text-sm";
  const add=(label,content)=>{ const b=document.createElement("div"); b.innerHTML=`<div class="font-semibold">${label}</div><div>${content||"—"}</div>`; grid.appendChild(b); };

  const times=(obj)=>["1","2","3","P"].map(t=>`${t}: ${(obj[t]||[]).join(", ")||"—"}`).join("<br>");
  const num=(obj)=>["1","2","3","P"].map(t=>`${t}: ${obj[t]||0}`).join("<br>");

  if(h.typ==="B"){
    add("Obdržené góly (časy)", times(s.obdrzene));
    add("Zásahy", num(s.zasahy));
  }else{
    add("Góly (časy)", times(s.goly));
    add("Střely", num(s.strely));
  }
  add("Asistence (součet)", Object.values(s.asistence).reduce((a,b)=>a+b,0));
  add("+ (součet)", Object.values(s.plus).reduce((a,b)=>a+b,0));
  add("− (součet)", Object.values(s.minus).reduce((a,b)=>a+b,0));
  add("Tresty (časy)", times(s.tresty));

  card.appendChild(grid);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// ==== Overlay UI (góly) ====
function renderOverlay(){
  if(!overlay) return;
  const backdrop=document.createElement("div"); backdrop.id=OVERLAY_ID; backdrop.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  backdrop.onclick=(e)=>{ if(e.target===backdrop) zavriOverlay(); };

  const card=document.createElement("div"); card.className="bg-white text-black rounded p-4 max-w-4xl w-[95%] relative";
  const close=document.createElement("button"); close.textContent="✕"; close.className="absolute right-2 top-2 px-2 py-1 bg-gray-200 rounded"; close.onclick=()=>zavriOverlay(); card.appendChild(close);

  const title=document.createElement("h3"); title.className="text-lg font-bold mb-2"; title.textContent=overlay.mode==="g"?"Vstřelený gól – vyber střelce, asistence (0–2) a +":"Obdržený gól – vyber brankáře a −"; card.appendChild(title);
  const info=document.createElement("div"); info.className="mb-3 text-sm"; info.textContent=`Čas: ${overlay.cas} • Třetina: ${aktivniTretina}`; card.appendChild(info);

  const modes=document.createElement("div"); modes.className="flex flex-wrap gap-2 mb-3";
  const chip=(key,label)=>{ const b=document.createElement("button"); const act=overlay.selectMode===key; b.textContent=label; b.className=(act?"bg-black text-white":"bg-gray-200")+" px-3 py-1 rounded"; b.onclick=()=>{ overlay.selectMode=key; removeOverlayDom(); render(); }; return b; };
  if(overlay.mode==="g"){ modes.appendChild(chip("shooter","Střelec")); modes.appendChild(chip("assist","Asistence (0–2)")); modes.appendChild(chip("plus","+ na ledě")); }
  else { modes.appendChild(chip("goalie","Brankář")); modes.appendChild(chip("minus","− na ledě")); }
  card.appendChild(modes);

  const bar=document.createElement("div"); bar.className="flex flex-wrap gap-2 mb-3";
  const bClear=document.createElement("button"); bClear.textContent="🧹 Vymazat volby"; bClear.className="px-3 py-1 rounded bg-gray-300"; bClear.onclick=()=>{ if(overlay.mode==="g"){ overlay.shooter=null; overlay.A=new Set(); overlay.plus=new Set(); } else { overlay.goalie=null; overlay.minus=new Set(); } removeOverlayDom(); render(); };
  bar.appendChild(bClear);
  if(overlay.mode==="g"){
    const bNoA=document.createElement("button"); bNoA.textContent="💾 Uložit bez asistentů"; bNoA.className="px-3 py-1 rounded bg-green-600 text-white"; bNoA.onclick=()=>{ const bak=overlay.A; overlay.A=new Set(); ulozOverlay(); overlay.A=bak; }; bar.appendChild(bNoA);
  }
  const bSave=document.createElement("button"); bSave.textContent="💾 Uložit"; bSave.className="px-3 py-1 rounded bg-green-700 text-white"; bSave.onclick=()=>ulozOverlay();
  const bCancel=document.createElement("button"); bCancel.textContent="Zavřít"; bCancel.className="px-3 py-1 rounded bg-gray-300"; bCancel.onclick=()=>zavriOverlay();
  bar.appendChild(bSave); bar.appendChild(bCancel);
  card.appendChild(bar);

  const grid=document.createElement("div"); grid.className="grid grid-cols-6 gap-2";
  sortHraci(hraci).forEach(h=>{
    if(h.active===false) return;
    const btn=document.createElement("button");
    btn.textContent=cisloZJmena(h.jmeno);
    btn.className=`px-2 py-2 rounded font-bold text-white ${h.typ==="B"?"bg-black":barvaPetky(h.petka)}`;
    if(overlay.mode==="g"){
      if(overlay.shooter===h.id) btn.classList.add("ring-4","ring-yellow-300");
      if(overlay.A?.has(h.id)) btn.classList.add("ring-4","ring-indigo-300");
      if(overlay.plus?.has(h.id)) btn.classList.add("opacity-80");
    }else{
      if(overlay.goalie===h.id) btn.classList.add("ring-4","ring-yellow-300");
      if(overlay.minus?.has(h.id)) btn.classList.add("ring-4","ring-red-300");
    }
    btn.onclick=()=>{
      if(overlay.mode==="g"){
        if(overlay.selectMode==="shooter"){ overlay.shooter=(overlay.shooter===h.id?null:h.id); }
        else if(overlay.selectMode==="assist"){
          if(h.id===overlay.shooter) return;
          if(overlay.A.has(h.id)) overlay.A.delete(h.id); else if(overlay.A.size<2) overlay.A.add(h.id);
        }else{
          if(overlay.plus.has(h.id)) overlay.plus.delete(h.id); else overlay.plus.add(h.id);
        }
      }else{
        if(overlay.selectMode==="goalie"){ if(h.typ!=="B") return; overlay.goalie=(overlay.goalie===h.id?null:h.id); }
        else{ if(overlay.minus.has(h.id)) overlay.minus.delete(h.id); else overlay.minus.add(h.id); }
      }
      removeOverlayDom(); render();
    };
    grid.appendChild(btn);
  });
  card.appendChild(grid);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// ==== Import/Export ====
async function importSoupiska(file){
  checkpoint();
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data); const sheet=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
  hraci=[];
  for(let i=1;i<rows.length;i++){
    const [cislo,jmeno,typ,petka]=rows[i];
    if(!cislo||!jmeno||!typ) continue;
    hraci.push({id:String(Date.now()+i), jmeno:`${cislo} ${jmeno}`, typ:String(typ).trim(), petka=Number(petka)||0, active=true});
  }
  resetStatistik(); zamknuto=false; aktivniPetka=0; activeGoalieId=null;
  saveState(); render();
}
function exportSoupiska(){
  // Formát: číslo, jméno, pozice, pětka  (hlavička + data)
  const header = [["číslo","jméno","pozice","pětka"]];
  const rows = sortHraci(hraci).map(h=>[
    cisloZJmena(h.jmeno),
    jmenoBezCisla(h.jmeno),
    h.typ,
    h.petka||""
  ]);
  const ws = XLSX.utils.aoa_to_sheet(header.concat(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Soupiska");
  XLSX.writeFile(wb, "soupiska.xlsx");
}
function exportStatistiky(){
  const sum=(o)=>Object.values(o).reduce((a,b)=>a+(Array.isArray(b)?b.length:b),0);
  const data=hraci.map(h=>{
    const s=statistiky[h.id];
    return {
      Cislo: cisloZJmena(h.jmeno),
      Jmeno: jmenoBezCisla(h.jmeno),
      Typ: h.typ, Petka: h.petka||"",
      Aktivni: (h.active!==false)?"ano":"ne",
      Strely: sum(s.strely), Goly: sum(h.typ==="B"?s.obdrzene:s.goly), Asistence: sum(s.asistence),
      Plus: sum(s.plus), Minus: sum(s.minus),
      Zasahy: sum(s.zasahy), Obdrzene: sum(s.obdrzene), Tresty: sum(s.tresty)
    };
  });
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Statistiky");
  XLSX.writeFile(wb,"statistiky_zapasu.xlsx");
}
function exportCSVUdalosti(){
  const rows=[];
  const add=(obj)=>rows.push(obj);

  // metadata – komentářový header (pro přehled)
  add({period:"#", match_time:"#", event:"meta", team:infoZapasu.tym, date:infoZapasu.datum, start:infoZapasu.cas, place:infoZapasu.misto, soutez:infoZapasu.soutez, tags:infoZapasu.stitky});

  // góly / obdržené
  goloveUdalosti.forEach((e,idx)=>{
    const base={period:e.tretina, match_time:e.cas, event_id:idx+1};
    if(e.typ==="g"){
      add({...base, event:"goal", player: e.strelec, num: cisloZJmena(hById(e.strelec)?.jmeno), line: hById(e.strelec)?.petka||0});
      (e.asistenti||[]).forEach(id=> add({...base, event:"assist", player:id, num:cisloZJmena(hById(id)?.jmeno), line:hById(id)?.petka||0}) );
      (e.plus||[]).forEach(id=> add({...base, event:"plus", player:id, num:cisloZJmena(hById(id)?.jmeno), line:hById(id)?.petka||0}) );
    }else{
      add({...base, event:"goal_against", goalie:e.golman, num:cisloZJmena(hById(e.golman)?.jmeno), line:hById(e.golman)?.petka||0});
      (e.minus||[]).forEach(id=> add({...base, event:"minus", player:id, num:cisloZJmena(hById(id)?.jmeno), line:hById(id)?.petka||0}) );
    }
  });

  // tresty (mají čas)
  hraci.forEach(h=>{
    const s=statistiky[h.id];
    ["1","2","3","P"].forEach(t=>{
      (s.tresty[t]||[]).forEach(cas=> add({period:t, match_time:cas, event:"penalty", player:h.id, num:cisloZJmena(h.jmeno), line:h.petka||0}));
    });
  });

  // NÁJEZDY – period = "SO", round + typy
  shootoutAttempts.forEach((a,idx)=>{
    const base={period:"SO", round:a.round, event_id:`SO-${idx+1}`};
    if(a.team==="us"){
      if(a.result==="goal") add({...base, event:"shootout_goal_for", player:a.shooterId, num:cisloZJmena(hById(a.shooterId)?.jmeno)});
      else add({...base, event:"shootout_miss_for", player:a.shooterId, num:cisloZJmena(hById(a.shooterId)?.jmeno)});
    }else{
      if(a.result==="goal") add({...base, event:"shootout_goal_against", goalie:a.goalieId, num:cisloZJmena(hById(a.goalieId)?.jmeno)});
      else add({...base, event:"shootout_save", goalie:a.goalieId, num:cisloZJmena(hById(a.goalieId)?.jmeno)});
    }
  });

  const headers=["period","match_time","round","event_id","event","player","goalie","num","line","team","date","start","place","soutez","tags"];
  const csv = [headers.join(",")].concat(
    rows.map(r=>headers.map(h=> (r[h]!==undefined ? String(r[h]).replace(/"/g,'""') : "") ).map(v=>`"${v}"`).join(","))
  ).join("\n");

  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="udalosti.csv"; a.click();
  URL.revokeObjectURL(a.href);
}

// ==== ARCHIV ====
function nactiArchiv(){ try{ const raw=localStorage.getItem(ARCHIVE_KEY); return raw?JSON.parse(raw):[]; }catch{return[];} }
function ulozArchiv(arr){ try{ localStorage.setItem(ARCHIVE_KEY, JSON.stringify(arr)); }catch{} }
function ulozDoArchivu(){
  const scoreText=souhrnSkore().split(" ")[0]||"";
  const so=scshoot();
  const entry={
    id:String(Date.now()),
    meta:{...infoZapasu, score: scoreText, shootout: so.text},
    hraci,
    shootoutAttempts,
    ts: Date.now()
  };
  const a=nactiArchiv(); a.unshift(entry); ulozArchiv(a);
}
function scshoot(){ const s=shootoutScore(); return {us:s.us, opp:s.opp, rounds:s.rounds, text: (s.rounds?`SO ${s.us}:${s.opp} (${s.rounds} kol)`:"")}; }
function renderArchiv(container){
  const box=document.createElement("div"); box.className="p-3 bg-gray-900 rounded border border-gray-700 mt-3";
  const ttl=document.createElement("div"); ttl.className="font-bold mb-2"; ttl.textContent="Archiv zápasů";
  box.appendChild(ttl);

  const filter=document.createElement("div"); filter.className="flex flex-wrap gap-2 mb-2";
  const inp=document.createElement("input"); inp.placeholder="Hledat (místo, soutěž, štítky)"; inp.className="px-2 py-1 rounded bg-gray-800 border border-gray-700 flex-1";
  filter.appendChild(inp);
  box.appendChild(filter);

  const list=document.createElement("div"); list.className="flex flex-col gap-2";
  const renderList=()=>{
    list.innerHTML="";
    const q=(inp.value||"").toLowerCase();
    nactiArchiv().filter(e=>{
      const m=e.meta||{};
      const hay = `${m.misto||""} ${m.soutez||""} ${m.stitky||""}`.toLowerCase();
      return hay.includes(q);
    }).forEach(e=>{
      const row=document.createElement("div"); row.className="flex flex-wrap items-center gap-2 bg-gray-800 border border-gray-700 rounded p-2";
      const when=new Date(e.ts).toLocaleString();
      const meta=e.meta||{};
      const span=document.createElement("div"); span.className="flex-1";
      const soText = meta.shootout ? ` • ${meta.shootout}` : "";
      span.innerHTML=`<strong>${meta.score||"?"}</strong>${soText} • ${meta.datum||"?"} ${meta.cas||""} • ${meta.misto||""} • ${meta.soutez||""} • ${meta.stitky||""} <span class="text-xs text-gray-400">(${when})</span>`;
      row.appendChild(span);

      const bLoad=document.createElement("button"); bLoad.textContent="Načíst"; bLoad.className="px-2 py-1 rounded bg-blue-700";
      bLoad.onclick=()=>{ if(!confirm("Načíst tento zápas? Přepíše aktuální stav.")) return; checkpoint(); applyState({hraci:e.hraci, statistiky:{}, goloveUdalosti:[], infoZapasu:meta, aktivniTretina:"1", aktivniPetka:0, zamknuto:false, showRosterAdmin:false, showSettings:true, activeGoalieId:null, tilesCompact, shootoutAttempts: e.shootoutAttempts||[] }); resetStatistik(); saveState(); render(); };
      row.appendChild(bLoad);

      const bDup=document.createElement("button"); bDup.textContent="Duplikovat soupisku"; bDup.className="px-2 py-1 rounded bg-gray-700";
      bDup.onclick=()=>{ if(!confirm("Převzít soupisku z tohoto zápasu do nového?")) return; checkpoint(); hraci=e.hraci.map(h=>({...h, active:true})); resetStatistik(); zamknuto=false; infoZapasu={datum:meta.datum||"",cas:meta.cas||"",misto:meta.misto||"",tym:meta.tym||"domaci", soutez:meta.soutez||"", stitky:meta.stitky||""}; activeGoalieId=null; shootoutAttempts=[]; saveState(); render(); };
      row.appendChild(bDup);

      list.appendChild(row);
    });
  };
  inp.oninput=renderList;
  renderList();
  container.appendChild(box);
  container.appendChild(list);
}

// ==== Render ====
function render(){
  root.innerHTML="";
  renderHlavicka();
  renderTretiny();
  renderDlazdicePatek();
  renderAkce3();
  renderHraci();
  renderUdalosti();
  renderStatistiky();
  if(overlay) renderOverlay();
  if(soOverlay) renderShootoutOverlay();
  saveState();
}

// ==== Start ====
setInterval(saveState, 5000);
window.addEventListener("beforeunload", saveState);

const saved=loadStateRaw();
if(saved && confirm("Najít uložený rozpracovaný zápas a obnovit?")) applyState(saved);
else{
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
