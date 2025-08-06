{\rtf1\ansi\ansicpg1250\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 const root = document.getElementById("root");\
\
function pridejCas(hlaska) \{\
  const vstup = prompt(`$\{hlaska\} (nap\uc0\u345 . 12:34)`, "00:00");\
  return vstup || "00:00";\
\}\
\
let hraci = [\
  \{ id: "1", jmeno: "12#Nov\'e1k", typ: "\'da", petka: 1 \},\
  \{ id: "2", jmeno: "22#Dvo\uc0\u345 \'e1k", typ: "\'da", petka: 1 \},\
  \{ id: "3", jmeno: "33#Svoboda", typ: "O", petka: 1 \},\
  \{ id: "4", jmeno: "44#Novotn\'fd", typ: "O", petka: 1 \},\
  \{ id: "5", jmeno: "1#Brank\'e1\uc0\u345 ", typ: "B", petka: 0 \}\
];\
\
let aktivniTretina = "1";\
let startujiciBrankar = "5";\
let stridaniBrankaru = [];\
let statistiky = \{\};\
let rezim = "rychly";\
let infoZapasu = \{ datum: "2025-08-06", cas: "18:00", misto: "Zimn\'ed stadion" \};\
let aktualniAkce = "strely";\
let goloveUdalosti = [];\
\
["1", "2", "3", "P"].forEach(t => \{\
  hraci.forEach(h => \{\
    statistiky[h.id] = \{\
      strely: \{ "1": 0, "2": 0, "3": 0, "P": 0 \},\
      goly: \{ "1": [], "2": [], "3": [], "P": [] \},\
      asistence: \{ "1": 0, "2": 0, "3": 0, "P": 0 \},\
      plus: \{ "1": 0, "2": 0, "3": 0, "P": 0 \},\
      minus: \{ "1": 0, "2": 0, "3": 0, "P": 0 \},\
      tresty: \{ "1": [], "2": [], "3": [], "P": [] \},\
      zasahy: \{ "1": 0, "2": 0, "3": 0, "P": 0 \},\
      obdrzene: \{ "1": [], "2": [], "3": [], "P": [] \}\
    \};\
  \});\
\});\
\
function ziskejJmeno(id) \{\
  const h = hraci.find(h => h.id === id);\
  return h ? (h.jmeno.includes("#") ? h.jmeno.split("#")[0] : h.jmeno) : "?";\
\}\
\
function ziskejPetku(id) \{\
  const h = hraci.find(h => h.id === id);\
  return h && h.petka ? h.petka : "-";\
\}\
\
function renderPetiTabulku() \{\
  const tabulka = document.createElement("div");\
  tabulka.className = "p-4 mt-4 bg-white dark:bg-gray-800";\
  tabulka.innerHTML = `<h2 class='text-xl font-bold mb-2'>Rozd\uc0\u283 len\'ed hr\'e1\u269 \u367  do p\u283 tek</h2>`;\
  for (let i = 1; i <= 5; i++) \{\
    const patek = document.createElement("div");\
    patek.className = "mb-4";\
    patek.innerHTML = `<h3 class='font-semibold'>$\{i\}. p\uc0\u283 tka</h3>`;\
    const hraciVPetce = hraci.filter(h => h.petka === i);\
    if (hraciVPetce.length === 0) \{\
      patek.innerHTML += `<p class='text-sm text-gray-500'>\'8e\'e1dn\'ed hr\'e1\uc0\u269 i</p>`;\
    \} else \{\
      patek.innerHTML += `<div class='flex flex-wrap gap-2'>` + hraciVPetce.map(h => \{\
        const cislo = h.jmeno.includes("#") ? h.jmeno.split("#")[0] : h.jmeno;\
        return `<span class='bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded'>#$\{cislo\} ($\{h.typ\})</span>`;\
      \}).join("") + `</div>`;\
    \}\
    tabulka.appendChild(patek);\
  \}\
  root.appendChild(tabulka);\
\}\
\
function render() \{\
  root.innerHTML = "";\
\
  const akcePanel = document.createElement("div");\
  akcePanel.className = "flex flex-wrap gap-2 px-4 mt-4";\
  const typy = [\
    ["strely", "\uc0\u55356 \u57263  St\u345 ela"],\
    ["goly", "\uc0\u9917  G\'f3l"],\
    ["asistence", "\uc0\u55356 \u56688 \u65039  Asistence"],\
    ["plus", "+ na led\uc0\u283 "],\
    ["minus", "\uc0\u8722  na led\u283 "],\
    ["tresty", "\uc0\u9940  Trest"],\
    ["zasahy", "\uc0\u55358 \u56804  Z\'e1sah"],\
    ["obdrzene", "\uc0\u55356 \u57263  Obdr\'9een\'fd g\'f3l"]\
  ];\
  typy.forEach(([typ, label]) => \{\
    const btn = document.createElement("button");\
    btn.textContent = label;\
    btn.className = aktualniAkce === typ ? "bg-blue-800 text-white px-2 py-1 rounded" : "bg-gray-300 px-2 py-1 rounded";\
    btn.onclick = () => \{ aktualniAkce = typ; render(); \};\
    akcePanel.appendChild(btn);\
  \});\
  root.appendChild(akcePanel);\
\
  const grid = document.createElement("div");\
  grid.className = "grid grid-cols-4 gap-2 p-4";\
  hraci.forEach((hrac) => \{\
    const btn = document.createElement("button");\
    const cislo = hrac.jmeno.includes("#") ? hrac.jmeno.split("#")[0] : hrac.jmeno;\
    btn.textContent = cislo;\
    btn.className = "bg-blue-700 text-white text-lg font-bold py-3 rounded dark:bg-blue-500";\
    btn.onclick = () => handleClick(hrac.id, aktualniAkce);\
    grid.appendChild(btn);\
  \});\
  root.appendChild(grid);\
\
  const souhrn = document.createElement("div");\
  souhrn.className = "p-4 bg-white dark:bg-gray-800 mt-4";\
  let sText = "<h2 class='text-xl font-bold mb-2'>Souhrn po t\uc0\u345 etin\'e1ch</h2><table class='w-full text-sm'><thead><tr><th>T\u345 etina</th><th>G\'f3ly</th><th>St\u345 ely</th><th>Z\'e1sahy</th></tr></thead><tbody>";\
  ["1", "2", "3", "P"].forEach(t => \{\
    let goly = 0, strely = 0, zasahy = 0;\
    hraci.forEach(h => \{\
      const s = statistiky[h.id];\
      goly += s.goly[t]?.length || 0;\
      strely += s.strely[t] || 0;\
      zasahy += s.zasahy[t] || 0;\
    \});\
    sText += `<tr><td>$\{t\}</td><td>$\{goly\}</td><td>$\{strely\}</td><td>$\{zasahy\}</td></tr>`;\
  \});\
  sText += "</tbody></table>";\
  souhrn.innerHTML = sText;\
  root.appendChild(souhrn);\
\
  const udalosti = document.createElement("div");\
  udalosti.className = "p-4 mt-4";\
  udalosti.innerHTML = `<h2 class="text-xl font-bold mb-2">G\'f3lov\'e9 ud\'e1losti</h2><div class="flex flex-col gap-2">` +\
    goloveUdalosti.map(e => \{\
      const barva = e.typ === "g" ? "bg-green-200" : "bg-red-200";\
      return `<div class="$\{barva\} p-2 rounded">\
        <strong>$\{e.tretina\}. t\uc0\u345 etina $\{e.cas\}</strong>: \
        $\{e.typ === "g" ? "G\'f3l" : "Obdr\'9een\'fd g\'f3l"\} - \
        $\{ziskejJmeno(e.strelec)\} \
        $\{e.asistenti?.length ? "(A: " + e.asistenti.map(ziskejJmeno).join(", ") + ")" : ""\} \
        $\{e.typ === "g" && e.plus?.length ? "+: " + e.plus.map(ziskejJmeno).join(", ") : ""\} \
        $\{e.typ === "o" && e.minus?.length ? "\uc0\u8722 : " + e.minus.map(ziskejJmeno).join(", ") : ""\}\
      </div>`;\
    \}).join("") + "</div>";\
  root.appendChild(udalosti);\
\
  renderPetiTabulku();\
\}\
\
function handleClick(id, typ) \{\
  const s = statistiky[id];\
  if (!s) return;\
  const tretina = aktivniTretina;\
  switch (typ) \{\
    case "strely": s.strely[tretina]++; break;\
    case "goly":\
      const casG = pridejCas("\uc0\u268 as g\'f3lu");\
      s.goly[tretina].push(casG);\
      s.plus[tretina]++;\
      goloveUdalosti.push(\{ typ: "g", cas: casG, tretina, strelec: id, asistenti: [], plus: [id] \});\
      break;\
    case "asistence":\
      s.asistence[tretina]++;\
      s.plus[tretina]++;\
      const lastG = goloveUdalosti.slice().reverse().find(e => e.typ === "g" && e.tretina === tretina);\
      if (lastG && lastG.asistenti.length < 2) lastG.asistenti.push(id);\
      break;\
    case "plus": s.plus[tretina]++;\
      const lastGPlus = goloveUdalosti.slice().reverse().find(e => e.typ === "g" && e.tretina === tretina);\
      if (lastGPlus) lastGPlus.plus.push(id);\
      break;\
    case "minus": s.minus[tretina]++;\
      const casO = pridejCas("\uc0\u268 as obdr\'9een\'e9ho g\'f3lu");\
      s.obdrzene[tretina].push(casO);\
      goloveUdalosti.push(\{ typ: "o", cas: casO, tretina, strelec: id, minus: [id] \});\
      break;\
    case "tresty": s.tresty[tretina].push(pridejCas("\uc0\u268 as trestu")); break;\
    case "zasahy": s.zasahy[tretina]++; break;\
    case "obdrzene": s.obdrzene[tretina].push(pridejCas("\uc0\u268 as obdr\'9een\'e9ho g\'f3lu")); break;\
  \}\
  render();\
\}\
\
// Spust\'edme aplikaci\
render()
}
