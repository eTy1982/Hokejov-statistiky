const root = document.getElementById("root");

let hraci = [];
let aktivniTretina = "1";
let startujiciBrankar = null;
let stridaniBrankaru = [];
let statistiky = {};
let rezim = "rychly";
let infoZapasu = { datum: "", cas: "", misto: "" };
let aktualniAkce = "strely";
let goloveUdalosti = [];

function pridejCas(popis) {
  const cas = prompt(`${popis} (formát mm:ss)`);
  return cas || "";
}

function ziskejJmeno(id) {
  const h = hraci.find(h => h.id === id);
  return h ? (h.jmeno.includes("#") ? h.jmeno.split("#")[0] : h.jmeno) : "?";
}

function ziskejPetku(id) {
  const h = hraci.find(h => h.id === id);
  return h && h.petka ? h.petka : "-";
}

function inicializujStatistiky() {
  hraci.forEach(h => {
    statistiky[h.id] = {
      strely: { "1": 0, "2": 0, "3": 0, "P": 0 },
      goly: { "1": [], "2": [], "3": [], "P": [] },
      asistence: { "1": 0, "2": 0, "3": 0, "P": 0 },
      plus: { "1": 0, "2": 0, "3": 0, "P": 0 },
      minus: { "1": 0, "2": 0, "3": 0, "P": 0 },
      tresty: { "1": [], "2": [], "3": [], "P": [] },
      zasahy: { "1": 0, "2": 0, "3": 0, "P": 0 },
      obdrzene: { "1": [], "2": [], "3": [], "P": [] }
    };
  });
}

function nastavHlavičku() {
  const hlavicka = document.createElement("div");
  hlavicka.className = "bg-gray-800 p-4 rounded mb-4";
  hlavicka.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <label class="block text-sm text-gray-400">Datum</label>
        <input type="date" value="${infoZapasu.datum}" onchange="infoZapasu.datum = this.value; render();" class="bg-gray-700 px-2 py-1 rounded w-full sm:w-auto"/>
      </div>
      <div>
        <label class="block text-sm text-gray-400">Čas</label>
        <input type="time" value="${infoZapasu.cas}" onchange="infoZapasu.cas = this.value; render();" class="bg-gray-700 px-2 py-1 rounded w-full sm:w-auto"/>
      </div>
      <div>
        <label class="block text-sm text-gray-400">Místo</label>
        <input type="text" value="${infoZapasu.misto}" onchange="infoZapasu.misto = this.value; render();" class="bg-gray-700 px-2 py-1 rounded w-full sm:w-auto"/>
      </div>
    </div>
  `;
  root.appendChild(hlavicka);
}
function nastavTretinu() {
  const panel = document.createElement("div");
  panel.className = "flex gap-2 items-center mb-4";
  ["1", "2", "3", "P"].forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t === "P" ? "🕐 Prodloužení" : `${t}. třetina`;
    btn.className = aktivniTretina === t ? "bg-blue-700 text-white px-2 py-1 rounded" : "bg-gray-300 text-black px-2 py-1 rounded";
    btn.onclick = () => {
      aktivniTretina = t;
      render();
    };
    panel.appendChild(btn);
  });
  root.appendChild(panel);
}

function nastavRezim() {
  const panel = document.createElement("div");
  panel.className = "flex gap-2 items-center mb-4";
  ["rychly", "detail"].forEach(r => {
    const btn = document.createElement("button");
    btn.textContent = r === "rychly" ? "⚡ Rychlý režim" : "📋 Detailní statistiky";
    btn.className = rezim === r ? "bg-blue-700 text-white px-2 py-1 rounded" : "bg-gray-300 text-black px-2 py-1 rounded";
    btn.onclick = () => {
      rezim = r;
      render();
    };
    panel.appendChild(btn);
  });
  root.appendChild(panel);
}

function nastavAkcePanel() {
  const akcePanel = document.createElement("div");
  akcePanel.className = "flex flex-wrap gap-2 mb-4";
  const typy = [
    ["strely", "🎯 Střela"],
    ["goly", "🥅 Gól"],
    ["asistence", "🅰️ Asistence"],
    ["plus", "+ na ledě"],
    ["minus", "− na ledě"],
    ["tresty", "⛔ Trest"],
    ["zasahy", "🧤 Zásah"],
    ["obdrzene", "💥 Obdržený gól"]
  ];
  typy.forEach(([typ, label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = aktualniAkce === typ ? "bg-yellow-600 text-white px-2 py-1 rounded" : "bg-gray-700 px-2 py-1 rounded";
    btn.onclick = () => {
      aktualniAkce = typ;
      render();
    };
    akcePanel.appendChild(btn);
  });
  root.appendChild(akcePanel);
}
function handleClick(id, typ) {
  const s = statistiky[id];
  if (!s) return;
  const t = aktivniTretina;
  switch (typ) {
    case "strely":
      s.strely[t]++;
      break;
    case "goly":
      const casG = pridejCas("Čas gólu");
      s.goly[t].push(casG);
      s.plus[t]++;
      goloveUdalosti.push({ typ: "g", cas: casG, tretina: t, strelec: id, asistenti: [], plus: [id] });
      break;
    case "asistence":
      s.asistence[t]++;
      s.plus[t]++;
      const posledniGol = goloveUdalosti.slice().reverse().find(e => e.typ === "g" && e.tretina === t);
      if (posledniGol && posledniGol.asistenti.length < 2) {
        posledniGol.asistenti.push(id);
      }
      break;
    case "plus":
      s.plus[t]++;
      const lastPlus = goloveUdalosti.slice().reverse().find(e => e.typ === "g" && e.tretina === t);
      if (lastPlus) lastPlus.plus.push(id);
      break;
    case "minus":
      s.minus[t]++;
      const casO = pridejCas("Čas obdrženého gólu");
      s.obdrzene[t].push(casO);
      goloveUdalosti.push({ typ: "o", cas: casO, tretina: t, minus: [id] });
      break;
    case "tresty":
      const casT = pridejCas("Čas trestu");
      s.tresty[t].push(casT);
      break;
    case "zasahy":
      s.zasahy[t]++;
      break;
    case "obdrzene":
      const casOb = pridejCas("Čas obdrženého gólu");
      s.obdrzene[t].push(casOb);
      break;
  }
  render();
}

function vykresliHraceGrid() {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-4 gap-2 mb-6";

  // Seřazení: Brankáři (B), Obránci (O), Útočníci (Ú)
  const poradi = { B: 0, O: 1, Ú: 2 };
  const serazeni = [...hraci].sort((a, b) => {
    return (poradi[a.typ] - poradi[b.typ]) || (a.petka - b.petka);
  });

  serazeni.forEach((h) => {
    const btn = document.createElement("button");
    const cislo = h.jmeno.includes("#") ? h.jmeno.split("#")[0] : h.jmeno;
    btn.textContent = `#${cislo}`;
    btn.className = `py-3 rounded font-bold ${
      h.typ === "B" ? "bg-red-600" : "bg-blue-600"
    }`;
    btn.onclick = () => handleClick(h.id, aktualniAkce);
    grid.appendChild(btn);
  });

  root.appendChild(grid);
}

function vykresliUdalosti() {
  const udalosti = document.createElement("div");
  udalosti.className = "bg-gray-800 p-4 mt-6 rounded";
  udalosti.innerHTML = `<h2 class="text-xl font-bold mb-2">📈 Gólové události</h2>` +
    goloveUdalosti.map(e => {
      const barva = e.typ === "g" ? "text-green-300" : "text-red-300";
      return `<div class="${barva} text-sm mb-1">
        ${e.tretina}. tř. ${e.cas}: 
        ${e.typ === "g" ? "Gól" : "Obdržený"} – 
        ${ziskejJmeno(e.strelec || "")} 
        ${e.asistenti?.length ? "(A: " + e.asistenti.map(ziskejJmeno).join(", ") + ")" : ""} 
        ${e.plus?.length ? " +: " + e.plus.map(ziskejJmeno).join(", ") : ""} 
        ${e.minus?.length ? " −: " + e.minus.map(ziskejJmeno).join(", ") : ""}
      </div>`;
    }).join("");
  root.appendChild(udalosti);
}
function vykresliSouhrn() {
  const tabulka = document.createElement("div");
  tabulka.className = "mt-6 bg-gray-800 p-4 rounded";
  tabulka.innerHTML = `<h2 class="text-xl font-bold mb-2">📊 Statistiky po třetinách</h2>`;

  const poradi = { B: 0, O: 1, Ú: 2 };
  const podleTypu = [...hraci].sort((a, b) => poradi[a.typ] - poradi[b.typ]);

  const radky = podleTypu.map(h => {
    const s = statistiky[h.id];
    const jmeno = ziskejJmeno(h.id);
    return `
      <tr>
        <td class="font-bold pr-2">${jmeno}</td>
        <td>${s.strely["1"]}/${s.strely["2"]}/${s.strely["3"]}</td>
        <td>${s.goly["1"].length}/${s.goly["2"].length}/${s.goly["3"].length}</td>
        <td>${s.asistence["1"]}/${s.asistence["2"]}/${s.asistence["3"]}</td>
        <td>${s.plus["1"]}/${s.plus["2"]}/${s.plus["3"]}</td>
        <td>${s.minus["1"]}/${s.minus["2"]}/${s.minus["3"]}</td>
        <td>${s.zasahy["1"]}/${s.zasahy["2"]}/${s.zasahy["3"]}</td>
      </tr>`;
  }).join("");

  tabulka.innerHTML += `
    <table class="w-full text-sm mt-2">
      <thead><tr class="text-left">
        <th>Jméno</th><th>Střely</th><th>Góly</th><th>A</th><th>+</th><th>−</th><th>Zásahy</th>
      </tr></thead>
      <tbody>${radky}</tbody>
    </table>`;
  root.appendChild(tabulka);
}

function render() {
  root.innerHTML = "";
  nastavHlavičku();
  nastavTretinu();
  nastavRezim();
  nastavAkcePanel();
  vykresliHraceGrid();
  vykresliUdalosti();
  vykresliSouhrn();
  vykresliImportExport();
}

function vykresliImportExport() {
  const panel = document.createElement("div");
  panel.className = "mt-6";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx";
  input.className = "bg-white text-black rounded px-2 py-1";
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1);
      hraci = rows.map((r, i) => ({
        id: i + 1,
        jmeno: r[1],
        cislo: r[0],
        typ: r[2],
        petka: Number(r[3])
      }));
      inicializujStatistiky();
      render();
    };
    reader.readAsArrayBuffer(file);
  };

  const btnExport = document.createElement("button");
  btnExport.textContent = "📥 Export statistik (.xlsx)";
  btnExport.className = "ml-4 bg-green-700 px-2 py-1 rounded";
  btnExport.onclick = () => {
    const data = [["Číslo", "Jméno", "Typ", "Pětka", "Střely", "Góly", "Asistence", "+", "-", "Zásahy"]];
    hraci.forEach(h => {
      const s = statistiky[h.id];
      const celkem = (obj) => Object.values(obj).reduce((a, b) => typeof b === "number" ? a + b : a + (b.length || 0), 0);
      data.push([
        h.cislo || "", h.jmeno, h.typ, h.petka || "",
        celkem(s.strely),
        celkem(s.goly),
        celkem(s.asistence),
        celkem(s.plus),
        celkem(s.minus),
        celkem(s.zasahy)
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statistiky");
    XLSX.writeFile(wb, "statistiky_zapasu.xlsx");
  };

  panel.appendChild(input);
  panel.appendChild(btnExport);
  root.appendChild(panel);
}

render();
