const root = document.getElementById("root");

let hraci = [];
let aktivniTretina = "1";
let startujiciBrankar = null;
let stridaniBrankaru = [];
let statistiky = {};
let rezim = "rychly";
let infoZapasu = { datum: "", cas: "", misto: "", domaci: true };
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
{
  root.innerHTML = ""
  zobrazHlavicku();

  const akcePanel = document.createElement("div");
  akcePanel.className = "flex flex-wrap gap-2 px-4 py-2";

  const typy = [
    ["strely", "🎯 Střela"],
    ["goly", "⚽ Gól"],
    ["asistence", "🅰️ Asistence"],
    ["plus", "+ na ledě"],
    ["minus", "− na ledě"],
    ["tresty", "⛔ Trest"],
    ["zasahy", "🧤 Zásah"],
    ["obdrzene", "🎯 Obdržený gól"]
  ];

  typy.forEach(([typ, label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = aktualniAkce === typ ? "bg-blue-800 text-white px-2 py-1 rounded" : "bg-gray-300 px-2 py-1 rounded";
    btn.onclick = () => {
      aktualniAkce = typ;
      render();
    };
    akcePanel.appendChild(btn);
  });

  root.appendChild(akcePanel);

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-4 gap-2 p-4";

  const barvyPetek = ["bg-blue-600", "bg-green-600", "bg-purple-600", "bg-orange-600", "bg-pink-600"];

  hraci.forEach((hrac) => {
    const cislo = hrac.jmeno.includes("#") ? hrac.jmeno.split("#")[0] : hrac.jmeno;
    const btn = document.createElement("button");
    btn.textContent = cislo;

    if (hrac.typ === "B") {
      btn.className = "bg-black text-white text-lg font-bold py-3 rounded";
    } else {
      const barva = barvyPetek[(hrac.petka || 1) - 1] || "bg-gray-400";
      btn.className = `${barva} text-white text-lg font-bold py-3 rounded`;
    }

    btn.onclick = () => handleClick(hrac.id, aktualniAkce);
    grid.appendChild(btn);
  });

  root.appendChild(grid);
}
  html += `<tr class="border-t font-bold"><td>Celkem</td><td></td><td></td>
    <td>${soucet.strely}</td><td>${soucet.goly}</td><td>${soucet.asistence}</td><td>${soucet.plus}</td>
    <td>${soucet.minus}</td><td>${soucet.tresty}</td><td>${soucet.zasahy}</td><td>${soucet.obdrzene}</td></tr>`;

  html += "</tbody></table>";
  tabulka.innerHTML = html;
  root.appendChild(tabulka);

  // Gólové události
  const udalosti = document.createElement("div");
  udalosti.className = "p-4 mt-4 bg-gray-100 dark:bg-gray-800";
  udalosti.innerHTML = `<h2 class="text-xl font-bold mb-2">Gólové události</h2><div class="flex flex-col gap-2">` +
    goloveUdalosti.map(e => {
      const barva = e.typ === "g" ? "bg-green-200" : "bg-red-200";
      return `<div class="${barva} p-2 rounded text-sm">
        <strong>${e.tretina}. třetina ${e.cas}</strong>: 
        ${e.typ === "g" ? "Gól" : "Obdržený gól"} – 
        ${ziskejJmeno(e.strelec)} 
        ${e.asistenti?.length ? "(A: " + e.asistenti.map(ziskejJmeno).join(", ") + ")" : ""} 
        ${e.typ === "g" && e.plus?.length ? "+: " + e.plus.map(ziskejJmeno).join(", ") : ""} 
        ${e.typ === "o" && e.minus?.length ? "−: " + e.minus.map(ziskejJmeno).join(", ") : ""}
      </div>`;
    }).join("") + "</div>";
  root.appendChild(udalosti);
}

function handleClick(id, typ) {
  const s = statistiky[id];
  if (!s) return;
  const tretina = aktivniTretina;

  switch (typ) {
    case "strely":
      s.strely[tretina]++;
      break;

    case "goly":
      const casG = pridejCas("Čas gólu");
      s.goly[tretina].push(casG);
      s.plus[tretina]++;
      goloveUdalosti.push({ typ: "g", cas: casG, tretina, strelec: id, asistenti: [], plus: [id] });
      break;

    case "asistence":
      s.asistence[tretina]++;
      s.plus[tretina]++;
      const lastG = goloveUdalosti.slice().reverse().find(e => e.typ === "g" && e.tretina === tretina);
      if (lastG && lastG.asistenti.length < 2) lastG.asistenti.push(id);
      break;

    case "plus":
      s.plus[tretina]++;
      const lastGPlus = goloveUdalosti.slice().reverse().find(e => e.typ === "g" && e.tretina === tretina);
      if (lastGPlus) lastGPlus.plus.push(id);
      break;

    case "minus":
      s.minus[tretina]++;
      const lastO = goloveUdalosti.slice().reverse().find(e => e.typ === "o" && e.tretina === tretina);
      if (lastO) lastO.minus.push(id);
      break;

    case "tresty":
      s.tresty[tretina].push(pridejCas("Čas trestu"));
      break;

    case "zasahy":
      s.zasahy[tretina]++;
      break;

    case "obdrzene":
      const casO = pridejCas("Čas obdrženého gólu");
      s.obdrzene[tretina].push(casO);
      goloveUdalosti.push({ typ: "o", cas: casO, tretina, strelec: id, minus: [id] });
      break;
  }

  render();
}
function renderHlavicka() {
  const header = document.createElement("div");
  header.className = "bg-gray-200 dark:bg-gray-900 p-4 flex flex-col gap-2";

  const inputGroup = document.createElement("div");
  inputGroup.className = "flex gap-4 flex-wrap";

  const vstup = (label, key) => {
    const div = document.createElement("div");
    div.className = "flex flex-col";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const inp = document.createElement("input");
    inp.className = "px-2 py-1 rounded";
    inp.value = infoZapasu[key];
    inp.oninput = () => {
      infoZapasu[key] = inp.value;
    };
    div.appendChild(lbl);
    div.appendChild(inp);
    return div;
  };

  inputGroup.appendChild(vstup("Datum", "datum"));
  inputGroup.appendChild(vstup("Čas", "cas"));
  inputGroup.appendChild(vstup("Místo", "misto"));

  const domaciBox = document.createElement("div");
  domaciBox.className = "flex flex-col";
  const lblDomaci = document.createElement("label");
  lblDomaci.textContent = "Domácí / Hosté";
  const select = document.createElement("select");
  select.className = "px-2 py-1 rounded";
  ["domaci", "host"].forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt === "domaci" ? "Jsme domácí" : "Jsme hosté";
    if (infoZapasu.tym === opt) o.selected = true;
    select.appendChild(o);
  });
  select.onchange = () => {
    infoZapasu.tym = select.value;
  };
  domaciBox.appendChild(lblDomaci);
  domaciBox.appendChild(select);

  inputGroup.appendChild(domaciBox);
  header.appendChild(inputGroup);

  // Výpočet skóre
  const scoreBox = document.createElement("div");
  scoreBox.className = "mt-2 font-bold";

  let skoreDom = 0, skoreHos = 0;
  const poTretinach = { "1": [0, 0], "2": [0, 0], "3": [0, 0], "P": [0, 0] };
  goloveUdalosti.forEach(e => {
    if (!poTretinach[e.tretina]) return;
    const jeDomaci = infoZapasu.tym === "domaci";
    if (e.typ === "g") {
      jeDomaci ? poTretinach[e.tretina][0]++ : poTretinach[e.tretina][1]++;
    }
    if (e.typ === "o") {
      jeDomaci ? poTretinach[e.tretina][1]++ : poTretinach[e.tretina][0]++;
    }
  });

  Object.values(poTretinach).forEach(([d, h]) => {
    skoreDom += d;
    skoreHos += h;
  });

  const detail = Object.entries(poTretinach).map(([t, [d, h]]) => `${d}:${h}`).join(";");
  scoreBox.textContent = `Skóre: ${skoreDom}:${skoreHos} (${detail})`;

  header.appendChild(scoreBox);
  root.appendChild(header);
}
      if (typ === "B") {
        hodnota = s.obdrzene[t]?.length || 0;
        soucty.obdrzene[t] += hodnota;
      } else {
        hodnota = s.strely[t] || 0;
        soucty.strely[t] += hodnota;
      }
      html += `<td class="text-center">${hodnota}</td>`;
      total += hodnota;
    });
    html += `<td class="text-center font-bold">${total}</td>`;
    row.innerHTML = html;
    tbody.appendChild(row);
  });

  // Řádek celkem
  const totalRow = document.createElement("tr");
  totalRow.className = "font-bold bg-gray-100 dark:bg-gray-700";
  let html = `<td class="px-2">–</td><td>Celkem</td><td>–</td><td>–</td>`;
  ["1", "2", "3", "P"].forEach(t => {
    const suma = soucty.strely[t] + soucty.obdrzene[t] + soucty.zasahy[t];
    html += `<td class="text-center">${suma}</td>`;
  });
  html += `<td class="text-center">–</td>`;
  totalRow.innerHTML = html;
  tbody.appendChild(totalRow);

  box.appendChild(table);
  root.appendChild(box);
}
      plus: { "1": 0, "2": 0, "3": 0, "P": 0 },
      minus: { "1": 0, "2": 0, "3": 0, "P": 0 },
      obdrzene: { "1": [], "2": [], "3": [], "P": [] },
      tresty: { "1": [], "2": [], "3": [], "P": [] }
    };
  }
  render();
}
// === EXPORT STATISTIKY ===
function exportStatistiky() {
  const exportData = hraci.map(h => {
    const s = statistiky[h.id];
    const getSum = obj => Object.values(obj).reduce((a, b) => a + (typeof b === 'number' ? b : b.length), 0);
    return {
      Cislo: h.jmeno.split(" ")[0],
      Jmeno: h.jmeno.split(" ").slice(1).join(" "),
      Typ: h.typ,
      Petka: h.petka,
      Strely: getSum(s.strely),
      Goly: getSum(s.goly),
      Asistence: getSum(s.asistence),
      Plus: getSum(s.plus),
      Minus: getSum(s.minus),
      Zasahy: getSum(s.zasahy),
      Obdrzene: getSum(s.obdrzene),
      Tresty: getSum(s.tresty)
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Statistiky");
  XLSX.writeFile(workbook, "statistiky_export.xlsx");
}

// === Tlačítka pro import/export ===
function renderImportExportControls() {
  const box = document.createElement("div");
  box.className = "flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border-t";

  // Import tlačítko
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".xlsx";
  fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      importSoupiska(e.target.files[0]);
    }
  };
  box.appendChild(fileInput);

  // Export tlačítko
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "📤 Export statistik";
  exportBtn.className = "bg-green-600 text-white px-4 py-2 rounded";
  exportBtn.onclick = exportStatistiky;
  box.appendChild(exportBtn);

  root.appendChild(box);
}
render();
