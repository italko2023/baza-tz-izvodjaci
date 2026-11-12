import {
  indexData,
  fold,
  fuzzyTz,
  fuzzyIzvodjac,
  preporukaZaTz,
  preporukaZaIzvodjaca,
  predloziTzZaIzvodjaca,
  nastupiTz,
  nastupiIzvodjaca,
} from "./preporuka.js";

const dataUrl = (name) => new URL(`data/${name}`, import.meta.url).href;

const TIP_IZVORA = {
  tz_kalendar: "kalendar TZ",
  tz_pdf: "PDF TZ",
  news: "vijest",
  portal: "portal",
  agency: "agencija",
  artist_site: "stranica izvođača",
  fb_snippet: "Facebook",
  upisnik: "Upisnik",
};

const ZONA_GRUPA = {
  otok: "obala",
  obala: "obala",
  zaledje: "obala",
  kontinent: "kontinent",
  zupanija: "ostalo",
  nacionalna: "ostalo",
};

let DATA = null;
let mapa = null;
let mapaSloj = null;

const $ = (sel, el = document) => el.querySelector(sel);
const app = () => $("#app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function datumHr(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(iso);
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}.`;
}

function zonaIme(z) {
  return (DATA && DATA.meta.zone[z]) || z || "—";
}

function pouzIme(p) {
  return (DATA && DATA.meta.pouzdanost[p]) || p || "—";
}

function znackaPouz(p) {
  return `<span class="znacka ${esc(p)}">${esc(pouzIme(p))}</span>`;
}

function znackaZona(z) {
  return `<span class="znacka ${esc(z)}">${esc(zonaIme(z))}</span>`;
}

function znackaUspjeh(n) {
  if (!n || !n.uspjeh) return "";
  return `<span class="znacka uspjeh">${esc(n.uspjeh_naziv || n.uspjeh)}</span>`;
}

function izvoriHtml(izvori) {
  if (!izvori || !izvori.length) return '<span class="mut">nema izvora</span>';
  return izvori
    .map((iz, i) => {
      const label = TIP_IZVORA[iz.tip] || iz.tip || "izvor";
      const suffix = izvori.length > 1 ? ` ${i + 1}` : "";
      return `<a class="izvor" href="${esc(iz.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}${suffix}</a>`;
    })
    .join(" · ");
}

function parseHash() {
  const h = (location.hash || "#/tz").replace(/^#\/?/, "");
  const p = h.split("/").filter(Boolean);
  return { view: p[0] || "tz", a: p[1] || null, b: p[2] || null };
}

function matches(q, ...fields) {
  if (!q) return true;
  const fq = fold(q);
  return fields.some((f) => f && fold(String(f)).includes(fq));
}

function setTabs(view) {
  document.querySelectorAll(".tabs a").forEach((a) => {
    const on = a.dataset.view === view;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    css.crossOrigin = "";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    s.crossOrigin = "";
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error("Leaflet CDN nije dostupan"));
    document.head.appendChild(s);
  });
}

function unistiMapu() {
  if (mapa) {
    mapa.remove();
    mapa = null;
    mapaSloj = null;
  }
}

async function nacrtajMapu(el, tocke, opts = {}) {
  unistiMapu();
  if (!el || !tocke.length) return;
  try {
    const L = await loadLeaflet();
    // Ako je korisnik otišao s pogleda dok se Leaflet učitavao:
    if (!document.body.contains(el)) return;
    mapa = L.map(el, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 18,
    }).addTo(mapa);
    const boja = {
      otok: "#1c4a6e",
      obala: "#0c585e",
      zaledje: "#3d4e1f",
      kontinent: "#9a3f18",
      zupanija: "#5c564c",
      nacionalna: "#5c564c",
    };
    const group = L.featureGroup();
    for (const t of tocke) {
      if (t.lat == null || t.lon == null) continue;
      const r = Math.max(5, Math.min(14, 5 + (t.n_nastupa || 0) * 0.35));
      const m = L.circleMarker([t.lat, t.lon], {
        radius: r,
        color: boja[t.zona] || "#0c585e",
        weight: 1.5,
        fillColor: boja[t.zona] || "#0c585e",
        fillOpacity: t.n_nastupa ? 0.75 : 0.28,
      });
      const html =
        `<strong>${esc(t.ime)}</strong><br>${esc(zonaIme(t.zona))}` +
        (t.zupanija ? ` · ${esc(t.zupanija)}` : "") +
        `<br>${t.n_nastupa || 0} nastupa` +
        `<br><a href="#/tz/${t.id}">Otvori</a>`;
      m.bindPopup(html);
      m.addTo(group);
    }
    group.addTo(mapa);
    mapaSloj = group;
    if (opts.fix && tocke[0] && tocke[0].lat != null) {
      mapa.setView([tocke[0].lat, tocke[0].lon], opts.zoom || 11);
    } else {
      const b = group.getBounds();
      if (b.isValid()) mapa.fitBounds(b, { padding: [24, 24], maxZoom: 10 });
      else mapa.setView([45.1, 16.5], 7);
    }
    setTimeout(() => mapa && mapa.invalidateSize(), 80);
  } catch (e) {
    el.innerHTML = `<p class="prazno-traga">Karta trenutačno nije dostupna (${esc(e.message)}).</p>`;
  }
}

/* ---------- TZ ---------- */

function filtriraneTz() {
  const q = $("#f-q")?.value || "";
  const zup = $("#f-zup")?.value || "";
  const zona = $("#f-zona")?.value || "";
  const samo = $("#f-samo")?.checked;
  return DATA.tz.filter((t) => {
    if (samo && !t.n_nastupa) return false;
    if (zup && String(t.zupanija_id) !== zup) return false;
    if (zona === "obala" && ZONA_GRUPA[t.zona] !== "obala") return false;
    if (zona === "kontinent" && t.zona !== "kontinent") return false;
    if (zona && zona !== "obala" && zona !== "kontinent" && t.zona !== zona) return false;
    return matches(q, t.ime, t.zupanija, t.otok, t.direktor, t.adresa, t.email);
  });
}

function renderTzLista() {
  const zupOpcije = DATA.zupanije
    .filter((z) => z.id !== 22)
    .map((z) => `<option value="${z.id}">${esc(z.ime)}</option>`)
    .join("");
  app().innerHTML = `
    <h1>Turističke zajednice</h1>
    <p class="lead">Svih ${DATA.tz.length} TZ iz Upisnika Ministarstva turizma (stanje 10. 11. 2026.). Klikom otvarate kontakte i nastupe.</p>
    <div class="alati">
      <label>Traži
        <input type="search" id="f-q" placeholder="npr. Kukljica, Vodice, direktor…" autocomplete="off">
      </label>
      <label>Županija
        <select id="f-zup">
          <option value="">sve</option>
          ${zupOpcije}
        </select>
      </label>
      <label>Područje
        <select id="f-zona">
          <option value="">sve</option>
          <option value="obala">obala i otoci</option>
          <option value="kontinent">kontinent</option>
          <option value="otok">samo otoci</option>
          <option value="obala-strict">samo obala</option>
          <option value="zaledje">zaleđe</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" id="f-samo"> samo s nastupima u bazi</label>
    </div>
    <p class="meta-red" id="tz-broj"></p>
    <div class="dva s-kartom">
      <div class="tablica-wrap">
        <table class="tablica-mobilne" id="tz-tablica">
          <thead>
            <tr><th>Naziv</th><th>Županija</th><th>Zona</th><th>Nastupi</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div>
        <div id="mapa" class="mapa" role="img" aria-label="Karta turističkih zajednica"></div>
        <p class="meta-red" style="margin-top:.5rem">Veličina točke ovisi o broju nastupa u bazi. Sive / prozirnije točke nemaju unesen nastup.</p>
      </div>
    </div>`;
  // special case: "obala-strict" handled in change
  const apply = () => {
    const zonaSel = $("#f-zona");
    let lista;
    if (zonaSel.value === "obala-strict") {
      const q = $("#f-q").value;
      const zup = $("#f-zup").value;
      const samo = $("#f-samo").checked;
      lista = DATA.tz.filter((t) => {
        if (samo && !t.n_nastupa) return false;
        if (zup && String(t.zupanija_id) !== zup) return false;
        if (t.zona !== "obala") return false;
        return matches(q, t.ime, t.zupanija, t.otok, t.direktor, t.adresa, t.email);
      });
    } else {
      lista = filtriraneTz();
    }
    lista = [...lista].sort(
      (a, b) => (b.n_nastupa || 0) - (a.n_nastupa || 0) || (a.ime || "").localeCompare(b.ime || "", "hr")
    );
    $("#tz-broj").textContent = `${lista.length} turističkih zajednica`;
    const tb = $("#tz-tablica tbody");
    if (!lista.length) {
      tb.innerHTML = `<tr><td colspan="4" class="prazno-traga">Nema rezultata za taj upit.</td></tr>`;
    } else {
      tb.innerHTML = lista
        .map(
          (t) => `<tr data-href="#/tz/${t.id}" tabindex="0">
            <td data-th="Naziv"><a class="ime-glavno" href="#/tz/${t.id}">${esc(t.ime)}</a></td>
            <td data-th="Županija">${esc(t.zupanija || "—")}${t.otok ? `<br><span class="znacka otok">${esc(t.otok)}</span>` : ""}</td>
            <td data-th="Zona">${znackaZona(t.zona)}</td>
            <td data-th="Nastupi">${t.n_nastupa || "—"}</td>
          </tr>`
        )
        .join("");
    }
    nacrtajMapu($("#mapa"), lista.filter((t) => t.lat != null));
  };
  ["f-q", "f-zup", "f-zona", "f-samo"].forEach((id) => {
    $("#" + id).addEventListener("input", apply);
    $("#" + id).addEventListener("change", apply);
  });
  $("#tz-tablica").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && e.target.tagName !== "A") location.hash = tr.dataset.href;
  });
  $("#tz-tablica").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const tr = e.target.closest("tr[data-href]");
      if (tr) location.hash = tr.dataset.href;
    }
  });
  apply();
}

function renderTzDetalj(id) {
  const t = DATA.tzById.get(Number(id));
  if (!t) {
    app().innerHTML = `<p class="greska">Turistička zajednica nije pronađena.</p>`;
    return;
  }
  const nastupi = (DATA.nastupiPoTz.get(t.id) || []).slice().sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const kontakt = [
    ["Direktor/ica", t.direktor],
    ["Predsjednik/ca", t.predsjednik],
    ["Adresa", t.adresa],
    ["Telefon", t.telefon ? `<a href="tel:${esc(t.telefon.replace(/\s+/g, ""))}">${esc(t.telefon)}</a>` : null],
    ["E-pošta", t.email ? t.email.split(/; ?/).map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join("<br>") : null],
    ["Web", t.web ? `<a href="${esc(t.web)}" target="_blank" rel="noopener noreferrer">${esc(t.web)}</a>` : null],
    ["Facebook", t.facebook ? `<a href="${esc(t.facebook)}" target="_blank" rel="noopener noreferrer">${esc(t.facebook)}</a>` : null],
    ["Instagram", t.instagram ? `<a href="${esc(t.instagram)}" target="_blank" rel="noopener noreferrer">${esc(t.instagram)}</a>` : null],
    ["OIB", t.oib],
    ["Upisni broj", t.upisni_br],
  ];
  app().innerHTML = `
    <a class="natrag" href="#/tz">Sve turističke zajednice</a>
    <h1>${esc(t.ime)}</h1>
    <p class="lead">${znackaZona(t.zona)} ${t.zupanija ? esc(t.zupanija) : ""} ${t.otok ? "· otok " + esc(t.otok) : ""} · ${esc(t.razina || "")}</p>
    <div class="dva s-pojedinostima">
      <div class="kartica">
        <h2>Kontakt</h2>
        <dl class="kontakt">
          ${kontakt
            .filter(([, v]) => v)
            .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.includes("<") ? v : esc(v)}</dd>`)
            .join("") || "<p>Nema unesenih kontakata.</p>"}
        </dl>
        <div class="akcije">
          <a class="btn" href="#/preporuka/tz/${t.id}">Preporuka za 2027.</a>
        </div>
      </div>
      <div>
        <div id="mapa" class="mapa" role="img" aria-label="Položaj turističke zajednice"></div>
      </div>
    </div>
    <h2>Nastupi 2026. (${nastupi.length})</h2>
    ${
      nastupi.length
        ? `<div class="tablica-wrap"><table class="tablica-mobilne">
        <thead><tr><th>Datum</th><th>Izvođač</th><th>Događaj</th><th>Mjesto</th><th>Pouzdanost</th><th>Izvor</th></tr></thead>
        <tbody>
          ${nastupi
            .map(
              (n) => `<tr>
                <td data-th="Datum">${datumHr(n.datum)}${n.vrijeme ? " " + esc(n.vrijeme) : ""}</td>
                <td data-th="Izvođač"><a class="ime-glavno" href="#/izvodjaci/${n.izvodjac_id}">${esc(n.izvodjac)}</a></td>
                <td data-th="Događaj">${esc(n.dogadjaj)}${znackaUspjeh(n) ? "<br>" + znackaUspjeh(n) : ""}</td>
                <td data-th="Mjesto">${esc(n.mjesto || "—")}</td>
                <td data-th="Pouzdanost">${znackaPouz(n.pouzdanost)}</td>
                <td data-th="Izvor">${izvoriHtml(n.izvori)}</td>
              </tr>`
            )
            .join("")}
        </tbody></table></div>`
        : `<p class="prazno">U bazi nema imenovanih nastupa koje je ova TZ organizirala u 2026. To ne znači da nastupa nije bilo — samo da ih još nismo unijeli iz javnog izvora.</p>`
    }`;
  nacrtajMapu($("#mapa"), [t], { fix: true, zoom: 11 });
}

/* ---------- Izvođači ---------- */

function renderIzvodjaci() {
  const kuce = DATA.izdavaci
    .map((k) => `<option value="${k.id}">${esc(k.ime)} (${k.n_izvodjaca})</option>`)
    .join("");
  app().innerHTML = `
    <h1>Izvođači</h1>
    <p class="lead">${DATA.izvodjaci.length} izvođača s imenovanim nastupom ili javnim katalogom izdavača. Poveznica s kućom nije tvrdnja o ekskluzivnom ugovoru.</p>
    <div class="alati">
      <label>Traži
        <input type="search" id="f-q" placeholder="npr. Grše, Hiljson, Doris…" autocomplete="off">
      </label>
      <label>Kuća / labela
        <select id="f-kuca">
          <option value="">sve</option>
          ${kuce}
        </select>
      </label>
      <label class="check"><input type="checkbox" id="f-samo" checked> samo s nastupom u 2026.</label>
    </div>
    <p class="meta-red" id="izv-broj"></p>
    <div class="tablica-wrap">
      <table class="tablica-mobilne" id="izv-tablica">
        <thead><tr><th>Ime</th><th>Tip / žanr</th><th>Kuća</th><th>Nastupi</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  const apply = () => {
    const q = $("#f-q").value;
    const kid = $("#f-kuca").value;
    const samo = $("#f-samo").checked;
    let lista = DATA.izvodjaci.filter((i) => {
      if (samo && !i.n_nastupa) return false;
      if (kid && !(i.kuce || []).some((k) => String(k.id) === kid && (k.do == null || k.do >= "2027-01-01")))
        return false;
      const kuceImena = (i.kuce || []).map((k) => k.ime).join(" ");
      return matches(q, i.ime, i.aka, i.tip, i.zanr, (i.zanrovi || []).join(" "), kuceImena);
    });
    lista.sort((a, b) => (b.n_nastupa || 0) - (a.n_nastupa || 0) || a.ime.localeCompare(b.ime, "hr"));
    $("#izv-broj").textContent = `${lista.length} izvođača`;
    const tb = $("#izv-tablica tbody");
    const prikaz = lista.slice(0, 400);
    if (!lista.length) {
      tb.innerHTML = `<tr><td colspan="4" class="prazno-traga">Nema rezultata.</td></tr>`;
      return;
    }
    tb.innerHTML =
      prikaz
        .map((i) => {
          const kuceTxt = (i.kuce || [])
            .filter((k) => k.do == null || k.do >= "2027-01-01")
            .map((k) => esc(k.ime))
            .join(", ") || "—";
          const zanr = (i.zanrovi && i.zanrovi.length ? i.zanrovi.join(", ") : i.zanr) || "—";
          return `<tr data-href="#/izvodjaci/${i.id}" tabindex="0">
            <td data-th="Ime"><a class="ime-glavno" href="#/izvodjaci/${i.id}">${esc(i.ime)}</a></td>
            <td data-th="Tip / žanr">${esc(i.tip || "—")}${zanr !== "—" ? " · " + esc(zanr) : ""}</td>
            <td data-th="Kuća">${kuceTxt}</td>
            <td data-th="Nastupi">${i.n_nastupa || "—"}</td>
          </tr>`;
        })
        .join("") +
      (lista.length > 400
        ? `<tr><td colspan="4" class="prazno-traga">Prikazano prvih 400 od ${lista.length}. Sužite pretragu.</td></tr>`
        : "");
  };
  ["f-q", "f-kuca", "f-samo"].forEach((id) => {
    $("#" + id).addEventListener("input", apply);
    $("#" + id).addEventListener("change", apply);
  });
  $("#izv-tablica").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && e.target.tagName !== "A") location.hash = tr.dataset.href;
  });
  apply();
}

function renderIzvodjacDetalj(id) {
  const i = DATA.izvodjaciById.get(Number(id));
  if (!i) {
    app().innerHTML = `<p class="greska">Izvođač nije pronađen.</p>`;
    return;
  }
  const nastupi = nastupiIzvodjaca(DATA, i.id).sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const kuceHtml = (i.kuce || []).length
    ? `<ul>${i.kuce
        .map((k) => {
          const vrijeme = [k.od ? "od " + k.od : "", k.do ? "do " + k.do : "aktualno"].filter(Boolean).join(", ");
          const nap = k.napomena ? ` — ${esc(k.napomena)}` : "";
          return `<li><strong>${esc(k.ime)}</strong> (${esc(k.tip)}, ${esc(k.uloga)}, ${esc(vrijeme)})${nap}</li>`;
        })
        .join("")}</ul>`
    : "<p>Nema javnog izvora o labeli ili agenciji.</p>";
  app().innerHTML = `
    <a class="natrag" href="#/izvodjaci">Svi izvođači</a>
    <h1>${esc(i.ime)}</h1>
    <p class="lead">${[i.tip, (i.zanrovi && i.zanrovi.join(", ")) || i.zanr, i.mjesto, i.aka ? "također: " + i.aka : ""]
      .filter(Boolean)
      .map(esc)
      .join(" · ")}</p>
    <div class="kartica">
      <h2>Kuća / labela</h2>
      ${kuceHtml}
      <p class="meta-red">Poveznica s katalogom izdavača nije tvrdnja o ekskluzivnom ugovoru.</p>
      <div class="akcije">
        <a class="btn" href="#/preporuka/izvodjac/${i.id}">Preporuka (TZ za sljedeću sezonu)</a>
      </div>
    </div>
    <h2>Nastupi 2026. (${nastupi.length})</h2>
    ${
      nastupi.length
        ? `<div class="tablica-wrap"><table class="tablica-mobilne">
        <thead><tr><th>Datum</th><th>Mjesto</th><th>Događaj</th><th>TZ</th><th>Pouzdanost</th><th>Izvor</th></tr></thead>
        <tbody>
          ${nastupi
            .map(
              (n) => `<tr>
                <td data-th="Datum">${datumHr(n.datum)}${n.vrijeme ? " " + esc(n.vrijeme) : ""}</td>
                <td data-th="Mjesto">${esc(n.mjesto || "—")}</td>
                <td data-th="Događaj">${esc(n.dogadjaj)}${znackaUspjeh(n) ? "<br>" + znackaUspjeh(n) : ""}
                  ${n.napomena ? `<br><span class="meta-red">${esc(n.napomena)}</span>` : ""}</td>
                <td data-th="TZ">${n.tz_id ? `<a href="#/tz/${n.tz_id}">${esc(n.tz)}</a>` : "—"}</td>
                <td data-th="Pouzdanost">${znackaPouz(n.pouzdanost)}</td>
                <td data-th="Izvor">${izvoriHtml(n.izvori)}</td>
              </tr>`
            )
            .join("")}
        </tbody></table></div>`
        : `<p class="prazno">Nema unesenih nastupa u 2026. Izvođač je možda u katalogu izdavača bez zabilježenog nastupa.</p>`
    }`;
}

/* ---------- Nastupi ---------- */

function renderNastupi() {
  app().innerHTML = `
    <h1>Nastupi 2026.</h1>
    <p class="lead">${DATA.nastupi.length} imenovanih nastupa. Svaki red ima izvor. Možete filtrirati po datumu, mjestu, izvođaču i pouzdanosti.</p>
    <div class="alati">
      <label>Traži
        <input type="search" id="f-q" placeholder="izvođač, mjesto, događaj, TZ…" autocomplete="off">
      </label>
      <label>Od
        <input type="date" id="f-od" min="2026-01-01" max="2026-12-31">
      </label>
      <label>Do
        <input type="date" id="f-do" min="2026-01-01" max="2026-12-31">
      </label>
      <label>Pouzdanost
        <select id="f-pouz">
          <option value="">sve</option>
          <option value="potvrdeno">potvrđeno</option>
          <option value="najavljeno">najavljeno</option>
          <option value="nesigurno">nesigurno</option>
        </select>
      </label>
    </div>
    <p class="meta-red" id="n-broj"></p>
    <div class="tablica-wrap">
      <table class="tablica-mobilne" id="n-tablica">
        <thead><tr><th>Datum</th><th>Izvođač</th><th>Mjesto</th><th>Događaj</th><th>Pouzdanost</th><th>Izvor</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="paginacija" id="n-pag"></div>`;

  let page = 0;
  const PAGE = 80;
  const apply = (resetPage = true) => {
    if (resetPage) page = 0;
    const q = $("#f-q").value;
    const od = $("#f-od").value;
    const do_ = $("#f-do").value;
    const pouz = $("#f-pouz").value;
    const lista = DATA.nastupi.filter((n) => {
      if (pouz && n.pouzdanost !== pouz) return false;
      if (od && (!n.datum || n.datum < od)) return false;
      if (do_ && (!n.datum || n.datum > do_)) return false;
      return matches(q, n.izvodjac, n.mjesto, n.dogadjaj, n.tz, n.napomena);
    });
    const maxP = Math.max(1, Math.ceil(lista.length / PAGE));
    if (page >= maxP) page = maxP - 1;
    const slice = lista.slice(page * PAGE, (page + 1) * PAGE);
    $("#n-broj").textContent = `${lista.length} nastupa` + (lista.length > PAGE ? `, stranica ${page + 1} / ${maxP}` : "");
    const tb = $("#n-tablica tbody");
    if (!lista.length) {
      tb.innerHTML = `<tr><td colspan="6" class="prazno-traga">Nema rezultata.</td></tr>`;
    } else {
      tb.innerHTML = slice
        .map(
          (n) => `<tr>
            <td data-th="Datum">${datumHr(n.datum)}${n.vrijeme ? " " + esc(n.vrijeme) : ""}</td>
            <td data-th="Izvođač"><a class="ime-glavno" href="#/izvodjaci/${n.izvodjac_id}">${esc(n.izvodjac)}</a></td>
            <td data-th="Mjesto">${esc(n.mjesto || "—")}</td>
            <td data-th="Događaj">${esc(n.dogadjaj)}${znackaUspjeh(n) ? " " + znackaUspjeh(n) : ""}</td>
            <td data-th="Pouzdanost">${znackaPouz(n.pouzdanost)}</td>
            <td data-th="Izvor">${izvoriHtml(n.izvori)}</td>
          </tr>`
        )
        .join("");
    }
    const pag = $("#n-pag");
    if (lista.length <= PAGE) {
      pag.innerHTML = "";
    } else {
      pag.innerHTML = `
        <button type="button" class="sporedna" id="n-prev" ${page === 0 ? "disabled" : ""}>Prethodna</button>
        <span>${page + 1} / ${maxP}</span>
        <button type="button" class="sporedna" id="n-next" ${page >= maxP - 1 ? "disabled" : ""}>Sljedeća</button>`;
      $("#n-prev")?.addEventListener("click", () => {
        page = Math.max(0, page - 1);
        apply(false);
        $("#n-tablica").scrollIntoView({ block: "start" });
      });
      $("#n-next")?.addEventListener("click", () => {
        page += 1;
        apply(false);
        $("#n-tablica").scrollIntoView({ block: "start" });
      });
    }
  };
  ["f-q", "f-od", "f-do", "f-pouz"].forEach((id) => {
    $("#" + id).addEventListener("input", () => apply(true));
    $("#" + id).addEventListener("change", () => apply(true));
  });
  apply();
}

/* ---------- Preporuka ---------- */

function kandLi(x, godina) {
  const tip = x.tip ? ` (${esc(x.tip)})` : "";
  const extra =
    x.km_najblizi != null
      ? ` <span class="razlog">najbliži ${godina}. nastup: ${Math.round(x.km_najblizi)} km, ${esc(x.gdje_najblizi || "")}</span>`
      : "";
  return `<li><a class="ime-glavno" href="#/izvodjaci/${x.id}">${esc(x.ime)}</a>${tip}
    <span class="razlog">${esc(x.oznaka)}</span>${extra}</li>`;
}

function listaSaSkrivanjem(items, htmlFn, limit = 12) {
  if (!items.length) return "";
  const head = items.slice(0, limit).map(htmlFn).join("");
  if (items.length <= limit) return head;
  const rest = items.slice(limit).map(htmlFn).join("");
  const id = "v" + Math.random().toString(36).slice(2, 8);
  return (
    head +
    `<li class="skriveno-vise"><button type="button" class="sporedna" data-toggle="${id}">Pokaži još ${items.length - limit}</button></li>` +
    `<span id="${id}" hidden>${rest}</span>`
  );
}

function renderKucaBlok(kb, prag, godina, godinaPrep) {
  const ku = kb.kuca;
  const status = ku.do ? `do ${ku.do}` : "aktualno";
  let html = `<p class="kuca-ime">Kuća: ${esc(ku.ime)} (${esc(ku.tip)}, ${esc(ku.uloga)}, ${esc(status)})</p>`;
  if (kb.napomenaVeza) html += `<p class="napomena">${esc(kb.napomenaVeza)}</p>`;
  if (kb.isti.length) {
    html += `<p><strong>Predloženi za ${godinaPrep}. (isti žanr, nisu svirali unutar ${prag} km)</strong></p>`;
    html += `<ul class="lista-kand">${listaSaSkrivanjem(kb.isti, (x) => kandLi(x, godina))}</ul>`;
  }
  if (kb.bezZanra.length) {
    html += `<p><strong>Ista kuća, žanr nije potvrđen izvorom</strong> (provjeriti prije ponude)</p>`;
    html += `<ul class="lista-kand">${listaSaSkrivanjem(kb.bezZanra, (x) => kandLi(x, godina), 8)}</ul>`;
  }
  if (kb.drugiZanr.length) {
    html += `<p><strong>Ista kuća, drugi poznati žanr (${kb.drugiZanr.length}):</strong>
      ${kb.drugiZanr
        .slice(0, 20)
        .map((x) => `<a href="#/izvodjaci/${x.id}">${esc(x.ime)}</a>`)
        .join(", ")}${kb.drugiZanr.length > 20 ? "…" : ""}</p>`;
  }
  if (kb.iskljuceni.length) {
    html += `<p><strong>Isključeni (nastup unutar ${prag} km u ${godina}.)</strong></p>`;
    html += `<ul class="lista-kand iskljuceni">${kb.iskljuceni
      .map((x) => `<li>✗ ${esc(x.ime)} — ${esc(x.razlog)}</li>`)
      .join("")}</ul>`;
  }
  if (!kb.isti.length && !kb.bezZanra.length && !kb.drugiZanr.length && !kb.iskljuceni.length) {
    html += `<p class="meta-red">Nema drugih izvođača na aktualnom rosteru ove kuće.</p>`;
  }
  return html;
}

function hookToggle(root) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle]");
    if (!btn) return;
    const el = document.getElementById(btn.dataset.toggle);
    if (!el) return;
    const open = el.hidden;
    el.hidden = !open;
    btn.hidden = open;
    if (open && el.tagName !== "SPAN") {
      /* keep */
    }
    // reveal remaining items: unwrap span
    if (open) {
      el.hidden = false;
      const parent = el.parentElement;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
      btn.remove();
    }
  });
}

function renderPreporukaPocetna() {
  app().innerHTML = `
    <h1>Preporuka za 2027.</h1>
    <p class="lead">Ako je izvođač dobro prošao na nekoj TZ, za sljedeću sezonu predlažu se kolege s iste kuće i sličnog žanra koji u 2026. nisu svirali unutar 40 km. Na nastupe dolaze ljudi iz obližnjih mjesta, pa blizina nije prednost nego preklapanje publike.</p>
    <div class="dva s-pojedinostima">
      <div class="kartica">
        <h2>Odaberite turističku zajednicu</h2>
        <div class="alati">
          <label>TZ ili mjesto
            <input type="search" id="q-tz" placeholder="npr. Kukljica, Vodice, Đakovo…" autocomplete="off">
          </label>
        </div>
        <div id="rez-tz"></div>
      </div>
      <div class="kartica">
        <h2>Odaberite izvođača</h2>
        <p>Predlažemo TZ na kojima su kolege s iste kuće svirali, a ovaj izvođač nije bio unutar 40 km.</p>
        <div class="alati">
          <label>Izvođač
            <input type="search" id="q-izv" placeholder="npr. Grše, Hiljson Mandela…" autocomplete="off">
          </label>
        </div>
        <div id="rez-izv"></div>
      </div>
    </div>
    <p class="meta-red">Prag na otocima je za sada istih 40 km (manji prag i trajekt mogu doći kasnije). Katalog izdavača (npr. Croatia Records) nije tvrdnja o ekskluzivnom ugovoru.</p>`;

  const bindSuggest = (input, box, kind) => {
    const draw = () => {
      const q = input.value.trim();
      if (q.length < 2) {
        box.innerHTML = "";
        return;
      }
      const fq = fold(q);
      let hits;
      if (kind === "tz") {
        hits = DATA.tz
          .filter((t) => fold(t.ime).includes(fq) || fold(t.slug || "").includes(fq) || fold(t.zupanija || "").includes(fq))
          .sort((a, b) => (b.n_nastupa || 0) - (a.n_nastupa || 0))
          .slice(0, 12);
        box.innerHTML = hits.length
          ? `<ul class="lista-kand">${hits
              .map(
                (t) =>
                  `<li><a class="ime-glavno" href="#/preporuka/tz/${t.id}">${esc(t.ime)}</a>
                    <span class="razlog">${esc(zonaIme(t.zona))}${t.n_nastupa ? " · " + t.n_nastupa + " nastupa" : ""}</span></li>`
              )
              .join("")}</ul>`
          : `<p class="prazno-traga">Nema pogotka. Probajte točniji naziv.</p>`;
      } else {
        hits = DATA.izvodjaci
          .filter((i) => fold(i.ime).includes(fq) || fold(i.aka || "").includes(fq) || fold(i.slug || "").includes(fq))
          .sort((a, b) => (b.n_nastupa || 0) - (a.n_nastupa || 0))
          .slice(0, 12);
        box.innerHTML = hits.length
          ? `<ul class="lista-kand">${hits
              .map(
                (i) =>
                  `<li><a class="ime-glavno" href="#/preporuka/izvodjac/${i.id}">${esc(i.ime)}</a>
                    <span class="razlog">${esc(i.tip || "")}${i.n_nastupa ? " · " + i.n_nastupa + " nastupa" : ""}</span></li>`
              )
              .join("")}</ul>`
          : `<p class="prazno-traga">Nema pogotka.</p>`;
      }
    };
    input.addEventListener("input", draw);
  };
  bindSuggest($("#q-tz"), $("#rez-tz"), "tz");
  bindSuggest($("#q-izv"), $("#rez-izv"), "izv");
}

function renderPreporukaTz(id) {
  const t = DATA.tzById.get(Number(id));
  if (!t) {
    app().innerHTML = `<p class="greska">TZ nije pronađena.</p>`;
    return;
  }
  const r = preporukaZaTz(DATA, t.id);
  let body;
  if (!r.nastupi.length) {
    body = `<p class="prazno">Nema nastupa u ${r.godina}. s ovom TZ kao organizatorom, pa nema polazišta za preporuku (kolege s iste kuće).</p>`;
  } else {
    body = r.blokovi
      .map((b) => {
        const n = b.nastup;
        const izv = b.izvodjac;
        if (b.nemaKuce) {
          return `<article class="blok-prep">
            <header>
              <h3><a href="#/izvodjaci/${izv.id}">${esc(izv.ime)}</a> · ${datumHr(n.datum)}</h3>
              ${znackaPouz(n.pouzdanost)} ${znackaUspjeh(n)}
            </header>
            <p>${esc(n.mjesto || "—")} / ${esc(n.dogadjaj)}</p>
            <p class="meta-red">Nema izvora o labeli ili agenciji — preporuka po kući nije moguća.</p>
          </article>`;
        }
        return `<article class="blok-prep">
          <header>
            <h3><a href="#/izvodjaci/${izv.id}">${esc(izv.ime)}</a> · ${datumHr(n.datum)}${n.vrijeme ? " " + esc(n.vrijeme) : ""}</h3>
            ${znackaPouz(n.pouzdanost)} ${znackaUspjeh(n)}
          </header>
          <p>${esc(n.mjesto || "—")} / ${esc(n.dogadjaj)} · isključenje ${r.prag} km (${esc(r.pragNap)})</p>
          ${b.kuce.map((kb) => renderKucaBlok(kb, r.prag, r.godina, r.godinaPrep)).join("")}
        </article>`;
      })
      .join("");
  }
  app().innerHTML = `
    <a class="natrag" href="#/preporuka">Nova preporuka</a>
    <h1>Preporuka za ${r.godinaPrep}. — ${esc(t.ime)}</h1>
    <p class="lead">${znackaZona(t.zona)}
      ${t.direktor ? "· dir. " + esc(t.direktor) : ""}
      ${t.email ? "· " + esc(t.email) : ""}
      ${t.telefon ? "· " + esc(t.telefon) : ""}
      ${t.web ? `· <a href="${esc(t.web)}" target="_blank" rel="noopener noreferrer">${esc(t.web)}</a>` : ""}
      ${t.adresa ? "<br>Adresa: " + esc(t.adresa) : ""}
    </p>
    <p class="meta-red">Nastupi ${r.godina}. koje je TZ organizirala: ${r.nastupi.length}.
      <a href="#/tz/${t.id}">Kartica TZ</a></p>
    ${body}`;
  hookToggle(app());
}

function renderPreporukaIzvodjac(id) {
  const i = DATA.izvodjaciById.get(Number(id));
  if (!i) {
    app().innerHTML = `<p class="greska">Izvođač nije pronađen.</p>`;
    return;
  }
  const r = preporukaZaIzvodjaca(DATA, i.id);
  const tzLista = predloziTzZaIzvodjaca(DATA, i.id);

  const tzHtml = tzLista.length
    ? `<div class="tablica-wrap"><table class="tablica-mobilne">
        <thead><tr><th>Turistička zajednica</th><th>Kolega koji je svirao</th><th>Udaljenost vlastitog nastupa</th></tr></thead>
        <tbody>
          ${tzLista
            .slice(0, 80)
            .map((p) => {
              const kolege = [];
              const seen = new Set();
              for (const k of p.kolege) {
                if (seen.has(k.izvodjac.id)) continue;
                seen.add(k.izvodjac.id);
                kolege.push(k);
              }
              const kHtml = kolege
                .slice(0, 6)
                .map((k) => {
                  const usp = k.nastup.uspjeh ? " " + znackaUspjeh(k.nastup) : "";
                  return `<a href="#/izvodjaci/${k.izvodjac.id}">${esc(k.izvodjac.ime)}</a>
                    (${datumHr(k.nastup.datum)}, ${esc(k.nastup.mjesto || k.nastup.dogadjaj)})${usp}`;
                })
                .join("<br>");
              const more = kolege.length > 6 ? `<br>i još ${kolege.length - 6}` : "";
              const km =
                p.km_najblizi != null
                  ? `${Math.round(p.km_najblizi)} km (${esc(p.gdje_najblizi || "")})`
                  : "nema vlastitog nastupa u bazi / izvan poznatih koordinata";
              return `<tr>
                <td data-th="TZ"><a class="ime-glavno" href="#/tz/${p.tz_id}">${esc(p.tz ? p.tz.ime : "?")}</a>
                  ${p.tz ? znackaZona(p.tz.zona) : ""} ${p.ima_uspjeh ? '<span class="znacka uspjeh">ima pohvalu u izvoru</span>' : ""}
                  <br><a href="#/preporuka/tz/${p.tz_id}">preporuka za tu TZ</a></td>
                <td data-th="Kolega">${kHtml}${more}</td>
                <td data-th="Udaljenost">${esc(km)}</td>
              </tr>`;
            })
            .join("")}
        </tbody></table></div>` +
      (tzLista.length > 80 ? `<p class="meta-red">Prikazano prvih 80 od ${tzLista.length} TZ.</p>` : "")
    : `<p class="prazno">Nema TZ na kojima je kolega s iste kuće svirao, a ovaj izvođač nije bio unutar 40 km. Možda izvođač nema povezanu kuću, ili su sve takve TZ unutar isključenja.</p>`;

  const kolegeHtml = r.blokovi.length
    ? r.blokovi
        .map((b) => {
          const n = b.nastup;
          return `<article class="blok-prep">
            <header>
              <h3>${datumHr(n.datum)} · ${esc(n.mjesto || "—")} / ${esc(n.dogadjaj)}</h3>
              ${znackaPouz(n.pouzdanost)} ${znackaUspjeh(n)}
            </header>
            <p>TZ: ${b.tz ? `<a href="#/tz/${b.tz.id}">${esc(b.tz.ime)}</a>` : "—"}
              · isključenje ${b.prag} km (${esc(b.pragNap)})</p>
            ${b.kuce.map((kb) => renderKucaBlok(kb, b.prag, r.godina, r.godinaPrep)).join("")}
          </article>`;
        })
        .join("")
    : `<p class="prazno">Nema nastupa u ${r.godina}. u bazi, ili nema organizatora TZ.</p>`;

  app().innerHTML = `
    <a class="natrag" href="#/preporuka">Nova preporuka</a>
    <h1>Preporuka za ${r.godinaPrep}. — ${esc(i.ime)}</h1>
    <p class="lead">${[i.tip, (i.zanrovi && i.zanrovi.join(", ")) || i.zanr].filter(Boolean).map(esc).join(" · ")}
      · <a href="#/izvodjaci/${i.id}">kartica izvođača</a></p>
    ${
      r.kuce.length
        ? `<p>Povezane kuće: ${r.kuce
            .map((k) => `${esc(k.ime)} (${k.do ? "do " + k.do : "aktualno"})`)
            .join("; ")}</p>`
        : `<p class="napomena">Nema izvora o labeli ili agenciji — preporuka po kući nije moguća.</p>`
    }
    <h2>TZ kojima bi ${esc(i.ime)} mogao odgovarati</h2>
    <p class="meta-red">Mjesta na kojima je kolega s iste kuće (uključujući povijesnu poveznicu, npr. Grše i YEM) svirao u ${r.godina}., a ${esc(i.ime)} nije bio unutar 40 km.</p>
    ${tzHtml}
    <h2>Kolege za mjesta na kojima je ${esc(i.ime)} već svirao</h2>
    <p class="meta-red">Nastupi ${r.godina}. u bazi: ${r.nastupi.length}. Za svako mjesto, tko s iste kuće nije svirao u krugu od 40 km.</p>
    ${kolegeHtml}`;
  hookToggle(app());
}

/* ---------- Router & init ---------- */

function render() {
  unistiMapu();
  const { view, a, b } = parseHash();
  const top = view === "izvodjac" ? "izvodjaci" : view === "preporuka" ? "preporuka" : view;
  setTabs(["tz", "izvodjaci", "nastupi", "preporuka"].includes(top) ? top : "tz");
  if (view === "tz" && a) renderTzDetalj(a);
  else if (view === "tz") renderTzLista();
  else if ((view === "izvodjaci" || view === "izvodjac") && a) renderIzvodjacDetalj(a);
  else if (view === "izvodjaci" || view === "izvodjac") renderIzvodjaci();
  else if (view === "nastupi") renderNastupi();
  else if (view === "preporuka" && a === "tz" && b) renderPreporukaTz(b);
  else if (view === "preporuka" && (a === "izvodjac" || a === "izvodjaci") && b)
    renderPreporukaIzvodjac(b);
  else if (view === "preporuka") renderPreporukaPocetna();
  else renderTzLista();
  window.scrollTo(0, 0);
}

async function init() {
  try {
    const names = [
      "meta.json",
      "tz.json",
      "mjesta.json",
      "izvodjaci.json",
      "nastupi.json",
      "izdavaci.json",
      "dogadjaji.json",
      "zupanije.json",
    ];
    const parts = await Promise.all(
      names.map(async (n) => {
        const res = await fetch(dataUrl(n));
        if (!res.ok) throw new Error(`${n}: ${res.status}`);
        return [n.replace(".json", ""), await res.json()];
      })
    );
    const raw = Object.fromEntries(parts);
    DATA = indexData(raw);
    const b = DATA.meta.brojevi;
    const counts = $("#counts");
    counts.hidden = false;
    counts.innerHTML = `<strong>${b.tz}</strong> TZ · <strong>${b.izvodjaci}</strong> izvođača · <strong>${b.nastupi}</strong> nastupa`;
    const foot = $("#foot-meta");
    foot.innerHTML =
      `${esc(DATA.meta.napomena)} Podaci ažurirani ${esc(DATA.meta.azurirano_prikaz)} (shema ${esc(DATA.meta.shema)}).`;
    window.addEventListener("hashchange", render);
    render();
  } catch (e) {
    app().innerHTML = `<p class="greska">Podatke nisam uspio učitati: ${esc(e.message)}. Provjerite da su datoteke u mapi <code>data/</code> i da stranica nije otvorena kao file:// (treba HTTP poslužitelj).</p>`;
  }
}

init();
