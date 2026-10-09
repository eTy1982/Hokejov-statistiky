import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

/* Písma jsou zabalená v aplikaci, ne z Google Fonts – v hale nemusí být signál
 * a dlaždice se jmény hráčů se musí vykreslit i offline. Bere se jen latin
 * a latin-ext (česká diakritika); vietnamský subset by se jen vezl v cache. */
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-ext-400.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-ext-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow/latin-ext-700.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-ext-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-ext-700.css";

import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error('V index.html chybí <div id="root">.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
