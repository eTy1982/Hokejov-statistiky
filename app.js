// HOKEJOVÁ STATISTIKA – zrychlené ovládání (klik hráč=střela, brankář=zásah)
// Góly přes overlay, trest jako režim. Statistiky mají sloupec Zásahy. Přehled střel pod skóre.

const root = document.getElementById("root");

// ---- Stav aplikace ----
let hraci = [];                       // {id, jmeno: "12 Novák", typ: "B|O|Ú", petka: 0..5}
let statistiky = {};                  // per hráč per třetina
let goloveUdalosti = [];             // {typ:"g"|"o", cas, tretina, strelec?, asistenti[], plus[], minus[], golman?}
let aktivniTretina = "1";            // "1"|"2"|"3"|"P"
let infoZapasu = { datum:"", cas:"", misto:"", tym:"domaci" }; // domaci|host
let aktivniPetka = 0;                // 0=vše
let zamknuto = false;                // po ukončení zápasu nelze editovat
let penaltyMode = false;             // ⛔ Trest – zap/vyp

// ---- Nápovědné funkce ----
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
function resetStatistik(){
  statistiky={};
  for(const h of hraci){
    statistiky[h.id]={
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
  goloveUdalosti=[];
}

// ---- Klik na hráče = akce podle typu ----
function klikHrac(h){
  if(zamknuto) return;

  // Režim trestu: vyžádá čas a zapíše k vybranému hráči
  if(penaltyMode){
    const cas = pridejCas("Čas trestu");
    statistiky[h.id].tresty[aktivniTretina].push(cas);
    render();
    return;
  }

  if(h.typ==="B"){
    // brankář = zásah
    statistiky[h.id].zasahy[aktivniTretina]++;
  }else{
    // hráč = střela
    statistiky[h.id].strely[aktivniTretina]++;
  }
  render();
}

// ---- Souhrn skóre + rychlé střely ----
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
// naše střely = součet střel všech ne–B hráčů;
// soupeřovy střely = zásahy našich gólmanů + obdržené góly (u našich gólmanů)
function souhrnStrely(){
  const nasi={"1":0,"2":0,"3":0,"P":0};
  const soup={"1":0,"2":0,"3":0,"P":0};
  for(const h of hraci){
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
  const nasiSum = Object.values(nasi).reduce((a,b)=>a+b,0);
  const soupSum = Object.values(soup).reduce((a,b)=>a+b,0);
  const per = ["1","2","3","P"].map(t=>`${nasi[t]}:${soup[t]}`).join(";");
  return `${nasiSum}:${soupSum} (${per})`;
}

// ---- Overlay (vstřelený / obdržený) ----
let overlay = null; // {mode:"g"|"o", cas, shooter?, goalie?, A:Set, plus:Set, minus:Set}

function otevriOverlayGolVstrel(){
  if(zamknuto) return;
  const cas = pridejCas("Čas vstřeleného gólu");
  overlay = { mode:"g", cas, A:new Set(), plus:new Set() };
  render();
}
function otevriOverlayGolObdrz(){
  if(zamknuto) return;
  const cas = pridejCas("Čas obdrženého gólu");
  overlay = { mode:"o", cas, minus:new Set() };
  render();
}
function zavriOverlay(){ overlay=null; render(); }
function ulozOverlay(){
  if(!overlay) return;
  const t = aktivniTretina;

  if(overlay.mode==="g"){
    // vyžadujeme střelce
    if(!overlay.shooter){ alert("Vyber střelce."); return; }
    const sShooter = statistiky[overlay.shooter];
    sShooter.goly[t].push(overlay.cas);
    sShooter.plus[t]++; // střelec má +

    // asistence (max 2)
    const asistArr = Array.from(overlay.A).slice(0,2);
    for(const id of asistArr){
      statistiky[id].asistence[t]++;
      statistiky[id].plus[t]++;
    }
    // plus – libovolní (střelec se přidá automaticky, i kdyby nebyl kliknut)
    const plusArr = Array.from(overlay.plus);
    for(const id of plusArr){
      // už jsme přidali + za asistenci i střelce; aby se nezdvojovalo, přidej jen pokud ještě nebylo
      if(id===overlay.shooter) continue;
      // pokud je současně v asistencích, + už má
      if(!asistArr.includes(id)) statistiky[id].plus[t]++;
    }

    goloveUdalosti.push({
      typ:"g",
      cas: overlay.cas,
      tretina: t,
      strelec: overlay.shooter,
      asistenti: asistArr,
      plus: [overlay.shooter, ...plusArr.filter(id=>id!==overlay.shooter && !asistArr.includes(id))]
    });

  }else{
    // obdržený gól – vyžadujeme brankáře
    if(!overlay.goalie){ alert("Vyber brankáře."); return; }
    const sGoalie = statistiky[overlay.goalie];
    sGoalie.obdrzene[t].push(overlay.cas);

    const minusArr = Array.from(overlay.minus);
    for(const id of minusArr){
      statistiky[id].minus[t]++;
    }
    goloveUdalosti.push({
      typ:"o",
      cas: overlay.cas,
      tretina: t,
      golman: overlay.goalie,
      minus: minusArr
    });
  }
  overlay=null;
  render();
}

// ---- UI: Hlavička ----
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
    i.oninput=()=>{infoZapasu[key]=i.value;};
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
  dSel.onchange=()=>{ infoZapasu.tym=dSel.value; render(); };
  dWrap.appendChild(dLbl); dWrap.appendChild(dSel);
  line.appendChild(dWrap);

  // Aktivní pětka filtr
  const pWrap=document.createElement("div"); pWrap.className="flex flex-col";
  const pLbl=document.createElement("label"); pLbl.className="text-xs text-gray-400"; pLbl.textContent="Aktivní pětka";
  const pSel=document.createElement("select"); pSel.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
  [["0","Vše"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]].forEach(([v,t])=>{
    const o=document.createElement("option"); o.value=v; o.textContent=t; if(String(aktivniPetka)===v) o.selected=true; pSel.appendChild(o);
  });
  pSel.onchange=()=>{ aktivniPetka=Number(pSel.value); render(); };
  pWrap.appendChild(pLbl); pWrap.appendChild(pSel);
  line.appendChild(pWrap);

  // Import soupisky nahoře
  const imp=document.createElement("div"); imp.className="flex flex-col";
  const iLbl=document.createElement("label"); iLbl.className="text-xs text-gray-400"; iLbl.textContent="Import soupisky (.xlsx)";
  const file=document.createElement("input");
  file.type="file"; file.accept=".xlsx";
  file.className="px-2 py-1 rounded bg-gray-800 border border-gray-700";
  file.onchange=(e)=>{ if(e.target.files?.length){ importSoupiska(e.target.files[0]); } };
  imp.appendChild(iLbl); imp.appendChild(file);
  line.appendChild(imp);

  // Ovládání
  const actions=document.createElement("div"); actions.className="flex gap-2 ml-auto";
  const bEnd=document.createElement("button");
  bEnd.textContent = zamknuto ? "Zápas uzamčen" : "Ukončit zápas";
  bEnd.disabled = zamknuto;
  bEnd.className = (zamknuto?"bg-gray-700":"bg-red-700 hover:bg-red-800")+" px-3 py-1 rounded";
  bEnd.onclick=()=>{ if(confirm("Ukončit zápas?")){ zamknuto=true; render(); } };
  actions.appendChild(bEnd);

  const bPrint=document.createElement("button");
  bPrint.textContent="🖨️ Tisk"; bPrint.className="px-3 py-1 rounded bg-gray-700"; bPrint.onclick=()=>window.print();
  actions.appendChild(bPrint);

  const bExp=document.createElement("button");
  bExp.textContent="📤 Export XLSX"; bExp.className="px-3 py-1 rounded bg-green-700"; bExp.onclick=exportStatistiky;
  actions.appendChild(bExp);

  line.appendChild(actions);

  // Skóre + rychlé střely
  const score=document.createElement("div"); score.className="font-bold";
  score.textContent="Skóre: "+souhrnSkore();
  const shots=document.createElement("div"); shots.className="font-semibold text-sm text-gray-300";
  shots.textContent="Střely: "+souhrnStrely();

  wrap.appendChild(line);
  wrap.appendChild(score);
  wrap.appendChild(shots);
  root.appendChild(wrap);
}

// ---- Třetiny + akční lišta (jen 3 tlačítka) ----
function renderTretiny(){
  const box=document.createElement("div"); box.className="flex flex-wrap gap-2 mb-3";
  ["1","2","3","P"].forEach(t=>{
    const b=document.createElement("button");
    b.textContent = t==="P"?"🕐 Prodloužení":`${t}. třetina`;
    b.className = (aktivniTretina===t) ? "bg-blue-700 text-white px-2 py-1 rounded" : "bg-gray-300 text-black px-2 py-1 rounded";
    b.disabled = zamknuto;
    b.onclick=()=>{ aktivniTretina=t; render(); };
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
  b3.disabled=zamknuto; b3.onclick=()=>{penaltyMode=!penaltyMode; render();}; box.appendChild(b3);

  root.appendChild(box);
}

// ---- Grid hráčů ----
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
function renderHraci(){
  const grid=document.createElement("div");
  grid.className="grid grid-cols-4 gap-2 mb-4";
  let list = sortHraci(hraci);
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

// ---- Gólové události ----
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

  // skóre + střely (znovu pro jistotu pod událostmi)
  const score=document.createElement("div"); score.className="mt-2 font-bold";
  score.textContent="Skóre: "+souhrnSkore();
  const shots=document.createElement("div"); shots.className="font-semibold text-sm text-gray-300";
  shots.textContent="Střely: "+souhrnStrely();

  box.appendChild(score);
  box.appendChild(shots);
  root.appendChild(box);
}

// ---- Statistiky po třetinách: sloupec Zásahy (1/2/3/P) ----
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
  const sumObdr={"1":0,"2":0,"3":0,"P":0};
  const sumZasahy={"1":0,"2":0,"3":0,"P":0};

  sortHraci(hraci).forEach(h=>{
    const s=statistiky[h.id];
    const tr=document.createElement("tr");
    const cislo=cisloZJmena(h.jmeno);

    let row=`<td>${cislo}</td><td>${h.jmeno}</td><td>${h.typ}</td><td>${h.petka||"-"}</td>`;
    let total=0;
    const per=[], perZ=[];

    ["1","2","3","P"].forEach(t=>{
      if(h.typ==="B"){
        const ob = (s.obdrzene[t]||[]).length;
        const za = (s.zasahy[t]||0);
        sumObdr[t]+=ob;
        sumZasahy[t]+=za;
        per.push(ob);
        perZ.push(za);
        total += ob; // pro gólmany v „Celkem“ dává smysl obdržené (ne zásahy)
        row += `<td class="text-center">${ob}</td>`;
      }else{
        const st = (s.strely[t]||0);
        sumStrely[t]+=st;
        per.push(st);
        perZ.push(0);
        total += st;
        row += `<td class="text-center">${st}</td>`;
      }
    });

    row += `<td class="text-center font-bold">${total}</td>`;
    row += `<td class="text-center">${perZ.join("/")}</td>`;
    tr.innerHTML=row;
    tbody.appendChild(tr);
  });

  // Řádek zásahy – už jsou v samostatném sloupci u hráčů, ale přidáme info: součtový řádek Celkem (střely hráčů + obdržené góly gólmanů)
  const trSum=document.createElement("tr"); trSum.className="font-bold";
  let r=`<td>–</td><td>Celkem</td><td>–</td><td>–</td>`;
  ["1","2","3","P"].forEach(t=>{
    r+=`<td class="text-center">${(sumStrely[t]||0)+(sumObdr[t]||0)}</td>`;
  });
  r+=`<td class="text-center">–</td><td class="text-center">${["1","2","3","P"].map(t=>sumZasahy[t]||0).join("/")}</td>`;
  trSum.innerHTML=r; tbody.appendChild(trSum);

  box.appendChild(table);
  root.appendChild(box);
}

// ---- Overlay UI ----
function renderOverlay(){
  if(!overlay) return;
  const backdrop=document.createElement("div");
  backdrop.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  backdrop.onclick=(e)=>{ if(e.target===backdrop) zavriOverlay(); };

  const card=document.createElement("div");
  card.className="bg-white text-black rounded p-4 max-w-4xl w-[95%] relative";
  const close=document.createElement("button");
  close.textContent="✕"; close.className="absolute right-2 top-2 px-2 py-1 bg-gray-200 rounded";
  close.onclick=zavriOverlay; card.appendChild(close);

  const title=document.createElement("h3");
  title.className="text-lg font-bold mb-2";
  title.textContent=overlay.mode==="g" ? "Vstřelený gól – vyber střelce, asistence (0–2) a +"
                                       : "Obdržený gól – vyber brankáře a −";
  card.appendChild(title);

  const info=document.createElement("div");
  info.className="mb-3 text-sm";
  info.textContent=`Čas: ${overlay.cas} • Třetina: ${aktivniTretina}`;
  card.appendChild(info);

  const grid=document.createElement("div");
  grid.className="grid grid-cols-6 gap-2";

  sortHraci(hraci).forEach(h=>{
    const b=document.createElement("button");
    b.textContent=cisloZJmena(h.jmeno);
    b.className = `px-2 py-2 rounded font-bold text-white ${h.typ==="B"?"bg-black":barvaPetky(h.petka)}`;

    if(overlay.mode==="g"){
      const isShooter = overlay.shooter===h.id;
      const isA = overlay.A?.has(h.id);
      const isP = overlay.plus?.has(h.id);
      if(isShooter) b.classList.add("ring-4","ring-yellow-300");
      else if(isA) b.classList.add("ring-4","ring-indigo-300");
      else if(isP) b.classList.add("opacity-80");

      b.onclick=()=>{
        // cyklus kliků: (není nic) => (střelec) => (A) => (+) => (nic)
        if(isShooter){
          overlay.shooter=null;
        }else if(!overlay.shooter){
          overlay.shooter=h.id;
        }else if(!isA){
          // nepovolit asistenci pro střelce
          if(h.id!==overlay.shooter){
            if(overlay.A.size<2) overlay.A.add(h.id);
            else overlay.plus.add(h.id);
          }
        }else if(isA){
          overlay.A.delete(h.id);
          overlay.plus.add(h.id);
        }
        render();
      };

    }else{ // obdržený
      const isG = overlay.goalie===h.id;
      const isM = overlay.minus?.has(h.id);
      if(isG) b.classList.add("ring-4","ring-yellow-300");
      else if(isM) b.classList.add("ring-4","ring-red-300");

      b.onclick=()=>{
        if(h.typ==="B"){
          overlay.goalie = isG ? null : h.id;
        }else{
          if(isM) overlay.minus.delete(h.id); else overlay.minus.add(h.id);
        }
        render();
      };
    }

    grid.appendChild(b);
  });

  const row=document.createElement("div");
  row.className="flex justify-end gap-2 mt-3";
  const save=document.createElement("button");
  save.textContent="Uložit";
  save.className="px-3 py-1 rounded bg-green-600 text-white";
  save.onclick=ulozOverlay;
  const cancel=document.createElement("button");
  cancel.textContent="Zavřít";
  cancel.className="px-3 py-1 rounded bg-gray-300";
  cancel.onclick=zavriOverlay;

  card.appendChild(grid);
  card.appendChild(row);
  row.appendChild(save); row.appendChild(cancel);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

// ---- Import/Export ----
async function importSoupiska(file){
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data);
  const sheet=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
  hraci=[];
  for(let i=1;i<rows.length;i++){
    const [cislo,jmeno,typ,petka]=rows[i];
    if(!cislo||!jmeno||!typ) continue;
    hraci.push({id:String(i), jmeno:`${cislo} ${jmeno}`, typ:String(typ).trim(), petka:Number(petka)||0});
  }
  resetStatistik(); zamknuto=false; penaltyMode=false;
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
      Strely: sum(s.strely), Goly: sum(s.goly), Asistence: sum(s.asistence),
      Plus: sum(s.plus), Minus: sum(s.minus),
      Zasahy: sum(s.zasahy), Obdrzene: sum(s.obdrzene), Tresty: sum(s.tresty)
    };
  });
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Statistiky");
  XLSX.writeFile(wb,"statistiky_zapasu.xlsx");
}

// ---- Render ----
function render(){
  root.innerHTML="";
  renderHlavicka();
  renderTretiny();
  renderAkce3();
  renderHraci();
  renderUdalosti();
  renderStatistiky();
  if(overlay) renderOverlay();
}

// ---- Demo hráči (můžeš vyhodit) ----
if(hraci.length===0){
  hraci=[
    {id:"1", jmeno:"1 Brankář", typ:"B", petka:0},
    {id:"2", jmeno:"12 Novák", typ:"Ú", petka:1},
    {id:"3", jmeno:"22 Dvořák", typ:"Ú", petka:1},
    {id:"4", jmeno:"33 Svoboda", typ:"O", petka:1},
    {id:"5", jmeno:"44 Novotný", typ:"O", petka:1},
    {id:"6", jmeno:"55 Malý", typ:"Ú", petka:2},
  ];
  resetStatistik();
}

render();
