// Logika preporuke za sljedeću sezonu — prijenos skripte/preporuka.py (shema 3.0.0).
// Isključenje 40 km na kopnu; na otocima isti prag (TODO: manji / trajekt).
// Predlažu se kolege s iste kuće (aktualni roster), s prednošću istog žanra.

export const ISKLJUCENJE_KOPNO_KM = 40;
export const ISKLJUCENJE_OTOK_KM = 40;
export const GODINA_SEZONE = 2026;
export const GODINA_PREPORUKE = 2027;
const R_KM = 6371.0;

export function fold(s) {
  const t = String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
  return t.toLowerCase().replace(/đ/g, "d").replace(/Đ/g, "d");
}

export function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((x) => x == null)) return null;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function udaljenostTz(data, a, b) {
  if (a === b) return 0;
  const ta = data.tzById.get(a);
  const tb = data.tzById.get(b);
  if (ta && tb) return haversine(ta.lat, ta.lon, tb.lat, tb.lon);
  return null;
}

export function pragZa(tz, kmKopno = ISKLJUCENJE_KOPNO_KM, kmOtok = ISKLJUCENJE_OTOK_KM) {
  if (tz && tz.zona === "otok") {
    return {
      prag: kmOtok,
      napomena: "otok (TODO: manji prag / trajekt; sada isti kao kopno)",
    };
  }
  return { prag: kmKopno, napomena: "kopno" };
}

export function zanroviOf(izv) {
  return new Set((izv && izv.zanrovi) || []);
}

export function kuceIzvodjaca(izv, ukljuciPovijesne = true) {
  const kuce = (izv && izv.kuce) || [];
  if (ukljuciPovijesne) return kuce;
  return kuce.filter((k) => k.do == null);
}

export function aktualniRoster(data, izdavacId, excludeId, godinaPreporuke = GODINA_PREPORUKE) {
  const cutoff = `${godinaPreporuke}-01-01`;
  const out = [];
  for (const izv of data.izvodjaci) {
    if (izv.id === excludeId) continue;
    const ok = (izv.kuce || []).some(
      (k) => k.id === izdavacId && (k.do == null || k.do >= cutoff)
    );
    if (ok) out.push(izv);
  }
  return out;
}

export function gdjeJeSvirao(data, iid, godina = GODINA_SEZONE) {
  const prefix = String(godina);
  const byTz = new Map();
  for (const n of data.nastupiPoIzvodjacu.get(iid) || []) {
    if (!n.datum || !n.datum.startsWith(prefix) || !n.tz_id) continue;
    let g = byTz.get(n.tz_id);
    if (!g) {
      g = {
        tz_id: n.tz_id,
        tz: n.tz,
        mjesto: n.mjesto,
        prvi: n.datum,
        zadnji: n.datum,
      };
      byTz.set(n.tz_id, g);
    } else {
      if (n.datum < g.prvi) g.prvi = n.datum;
      if (n.datum > g.zadnji) g.zadnji = n.datum;
    }
  }
  return [...byTz.values()];
}

export function iskljuciZbogBlizine(
  data,
  kandidatId,
  tzId,
  godina = GODINA_SEZONE,
  kmKopno = ISKLJUCENJE_KOPNO_KM,
  kmOtok = ISKLJUCENJE_OTOK_KM
) {
  const tz = data.tzById.get(tzId);
  const { prag } = pragZa(tz, kmKopno, kmOtok);
  const gigs = gdjeJeSvirao(data, kandidatId, godina);
  let naj = null;
  for (const g of gigs) {
    const km = udaljenostTz(data, tzId, g.tz_id);
    if (km == null) continue;
    if (naj == null || km < naj.km) {
      naj = {
        km,
        tz: g.tz,
        mjesto: g.mjesto,
        datum: g.zadnji,
        tz_id: g.tz_id,
      };
    }
  }
  if (naj && naj.km <= prag) {
    return {
      iskljucen: true,
      razlog:
        `već svirao ${naj.datum} u ${naj.mjesto || naj.tz} ` +
        `(${naj.km.toFixed(1)} km ≤ ${prag.toFixed(0)} km isključenja)`,
      km: naj.km,
      gdje: naj.tz,
    };
  }
  return {
    iskljucen: false,
    razlog: null,
    km: naj ? naj.km : null,
    gdje: naj ? naj.tz : null,
  };
}

function usporedbaImena(a, b) {
  const x = (a || "").toLowerCase();
  const y = (b || "").toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function rangirajKandidate(
  data,
  bookedId,
  kandidati,
  tzId,
  godina,
  kmKopno,
  kmOtok
) {
  const gBooked = zanroviOf(data.izvodjaciById.get(bookedId));
  const ok = [];
  const skip = [];
  for (const k of kandidati) {
    const isk = iskljuciZbogBlizine(
      data,
      k.id,
      tzId,
      godina,
      kmKopno,
      kmOtok
    );
    const g = zanroviOf(k);
    const presjek =
      gBooked.size && g.size
        ? new Set([...gBooked].filter((x) => g.has(x)))
        : new Set();
    if (isk.iskljucen) {
      skip.push({
        ...k,
        razlog: isk.razlog,
        km: isk.km,
        gdje: isk.gdje,
        presjek,
      });
      continue;
    }
    let rang;
    let oznaka;
    if (presjek.size) {
      rang = 0;
      oznaka = "isti žanr: " + [...presjek].sort().join(", ");
    } else if (!g.size) {
      rang = 1;
      oznaka = "žanr nije u bazi (samo ista kuća)";
    } else if (!gBooked.size) {
      rang = 1;
      oznaka = "žanr izvora nije u bazi; kandidat: " + [...g].sort().join(", ");
    } else {
      rang = 2;
      oznaka = "različiti žanr (" + [...g].sort().join(", ") + ")";
    }
    ok.push({
      ...k,
      rang,
      oznaka,
      presjek,
      km_najblizi: isk.km,
      gdje_najblizi: isk.gdje,
    });
  }
  ok.sort((a, b) => a.rang - b.rang || usporedbaImena(a.ime, b.ime));
  skip.sort((a, b) => usporedbaImena(a.ime, b.ime));
  return { ok, skip };
}

export function nastupiTz(data, tzId, godina = GODINA_SEZONE) {
  const prefix = String(godina);
  return (data.nastupiPoTz.get(tzId) || []).filter(
    (n) => n.datum && n.datum.startsWith(prefix)
  );
}

export function preporukaZaTz(data, tzId, opts = {}) {
  const kmKopno = opts.kmKopno ?? ISKLJUCENJE_KOPNO_KM;
  const kmOtok = opts.kmOtok ?? ISKLJUCENJE_OTOK_KM;
  const godina = opts.godina ?? GODINA_SEZONE;
  const godinaPrep = opts.godinaPrep ?? GODINA_PREPORUKE;
  const tz = data.tzById.get(tzId);
  if (!tz) return { greska: "TZ nije pronađena", tz: null, blokovi: [] };
  const nastupi = nastupiTz(data, tzId, godina);
  const { prag, napomena: pragNap } = pragZa(tz, kmKopno, kmOtok);
  const blokovi = [];
  const seen = new Set();
  for (const nast of nastupi) {
    if (seen.has(nast.izvodjac_id)) continue;
    seen.add(nast.izvodjac_id);
    const izv = data.izvodjaciById.get(nast.izvodjac_id);
    const kuce = kuceIzvodjaca(izv, true);
    const kuceBlokovi = [];
    for (const ku of kuce) {
      const kandidati = aktualniRoster(data, ku.id, izv.id, godinaPrep);
      const { ok, skip } = rangirajKandidate(
        data,
        izv.id,
        kandidati,
        tzId,
        godina,
        kmKopno,
        kmOtok
      );
      let napomenaVeza = null;
      if (ku.do && ku.do < `${godina}-12-31`) {
        napomenaVeza =
          `${izv.ime} je ovu kuću napustio ${ku.do} ` +
          `(prije ljetnih nastupa ${godina}). Preporuka i dalje nudi aktualni roster ` +
          "— ideja: kolege s iste kuće za sljedeću sezonu.";
      }
      kuceBlokovi.push({
        kuca: ku,
        napomenaVeza,
        isti: ok.filter((x) => x.rang === 0),
        bezZanra: ok.filter((x) => x.rang === 1),
        drugiZanr: ok.filter((x) => x.rang === 2),
        iskljuceni: skip,
      });
    }
    blokovi.push({
      nastup: nast,
      izvodjac: izv,
      kuce: kuceBlokovi,
      nemaKuce: kuce.length === 0,
    });
  }
  return { tz, prag, pragNap, nastupi, blokovi, godina, godinaPrep };
}

export function nastupiIzvodjaca(data, iid, godina = GODINA_SEZONE) {
  const prefix = String(godina);
  return (data.nastupiPoIzvodjacu.get(iid) || []).filter(
    (n) => n.datum && n.datum.startsWith(prefix)
  );
}

/** Kolege iste kuće za TZ na kojima je ovaj izvođač svirao (kao preporuka.py --izvodjac). */
export function preporukaZaIzvodjaca(data, iid, opts = {}) {
  const kmKopno = opts.kmKopno ?? ISKLJUCENJE_KOPNO_KM;
  const kmOtok = opts.kmOtok ?? ISKLJUCENJE_OTOK_KM;
  const godina = opts.godina ?? GODINA_SEZONE;
  const godinaPrep = opts.godinaPrep ?? GODINA_PREPORUKE;
  const izv = data.izvodjaciById.get(iid);
  if (!izv) return { greska: "Izvođač nije pronađen", izvodjac: null, blokovi: [] };
  const kuce = kuceIzvodjaca(izv, true);
  const nastupi = nastupiIzvodjaca(data, iid, godina);
  const redUspjeh = { pohvalan_izvjestaj: 0, rasprodano: 0, velika_publika: 0 };
  const redPouz = { potvrdeno: 0, najavljeno: 1, nesigurno: 2 };
  const sortirani = [...nastupi].sort((a, b) => {
    const ua = a.uspjeh ? 0 : 1;
    const ub = b.uspjeh ? 0 : 1;
    if (ua !== ub) return ua - ub;
    const pa = redPouz[a.pouzdanost] ?? 9;
    const pb = redPouz[b.pouzdanost] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.datum || "").localeCompare(b.datum || "");
  });
  const blokovi = [];
  const seenTz = new Set();
  for (const nast of sortirani) {
    if (!nast.tz_id || seenTz.has(nast.tz_id)) continue;
    seenTz.add(nast.tz_id);
    const tz = data.tzById.get(nast.tz_id);
    const { prag, napomena: pragNap } = pragZa(tz, kmKopno, kmOtok);
    const kuceBlokovi = [];
    for (const ku of kuce) {
      const kandidati = aktualniRoster(data, ku.id, izv.id, godinaPrep);
      const { ok, skip } = rangirajKandidate(
        data,
        izv.id,
        kandidati,
        nast.tz_id,
        godina,
        kmKopno,
        kmOtok
      );
      let napomenaVeza = null;
      if (ku.do && ku.do < `${godina}-12-31`) {
        napomenaVeza =
          `${izv.ime} je ovu kuću napustio ${ku.do} ` +
          `(prije ljetnih nastupa ${godina}). Preporuka i dalje nudi aktualni roster ` +
          "— ideja: kolege s iste kuće za sljedeću sezonu.";
      }
      kuceBlokovi.push({
        kuca: ku,
        napomenaVeza,
        isti: ok.filter((x) => x.rang === 0),
        bezZanra: ok.filter((x) => x.rang === 1),
        drugiZanr: ok.filter((x) => x.rang === 2),
        iskljuceni: skip,
      });
    }
    blokovi.push({ nastup: nast, tz, prag, pragNap, kuce: kuceBlokovi });
  }
  return { izvodjac: izv, kuce, nastupi, blokovi, godina, godinaPrep };
}


/** Svi izvođači ikad povezani s kućom, uključujući povijesne veze. */
export function sviSaKuce(data, izdavacId, excludeId) {
  const out = [];
  for (const izv of data.izvodjaci) {
    if (izv.id === excludeId) continue;
    if ((izv.kuce || []).some((k) => k.id === izdavacId)) out.push(izv);
  }
  return out;
}

/**
 * Obrnuti smjer: TZ kojima bi ovaj izvođač mogao odgovarati sljedeće sezone,
 * jer je kolega s iste kuće tamo svirao, a ovaj izvođač nije bio unutar 40 km.
 */
export function predloziTzZaIzvodjaca(data, iid, opts = {}) {
  const kmKopno = opts.kmKopno ?? ISKLJUCENJE_KOPNO_KM;
  const kmOtok = opts.kmOtok ?? ISKLJUCENJE_OTOK_KM;
  const godina = opts.godina ?? GODINA_SEZONE;
  const godinaPrep = opts.godinaPrep ?? GODINA_PREPORUKE;
  const izv = data.izvodjaciById.get(iid);
  if (!izv) return [];
  const kuce = kuceIzvodjaca(izv, true);
  const prijedlozi = new Map();
  for (const ku of kuce) {
    // Uključujemo i povijesne članove (npr. Grše je YEM napustio 25. 3. 2026.):
    // ako je kolega dobro prošao, mjesto je kandidat za aktualni roster.
    const kolege = sviSaKuce(data, ku.id, iid);
    for (const kol of kolege) {
      const gigs = nastupiIzvodjaca(data, kol.id, godina);
      for (const g of gigs) {
        if (!g.tz_id) continue;
        const isk = iskljuciZbogBlizine(
          data,
          iid,
          g.tz_id,
          godina,
          kmKopno,
          kmOtok
        );
        if (isk.iskljucen) continue;
        let rec = prijedlozi.get(g.tz_id);
        if (!rec) {
          rec = {
            tz: data.tzById.get(g.tz_id),
            tz_id: g.tz_id,
            km_najblizi: isk.km,
            gdje_najblizi: isk.gdje,
            kolege: [],
            ima_uspjeh: false,
          };
          prijedlozi.set(g.tz_id, rec);
        }
        rec.kolege.push({ izvodjac: kol, kuca: ku, nastup: g });
        if (g.uspjeh) rec.ima_uspjeh = true;
      }
    }
  }
  const lista = [...prijedlozi.values()];
  lista.sort(
    (a, b) =>
      Number(b.ima_uspjeh) - Number(a.ima_uspjeh) ||
      b.kolege.length - a.kolege.length ||
      usporedbaImena(a.tz && a.tz.ime, b.tz && b.tz.ime)
  );
  return lista;
}

export function indexData(raw) {
  const data = {
    meta: raw.meta,
    tz: raw.tz,
    mjesta: raw.mjesta,
    izvodjaci: raw.izvodjaci,
    nastupi: raw.nastupi,
    izdavaci: raw.izdavaci,
    dogadjaji: raw.dogadjaji,
    zupanije: raw.zupanije,
  };
  data.tzById = new Map(raw.tz.map((t) => [t.id, t]));
  data.izvodjaciById = new Map(raw.izvodjaci.map((i) => [i.id, i]));
  data.mjestaById = new Map(raw.mjesta.map((m) => [m.id, m]));
  data.izdavaciById = new Map(raw.izdavaci.map((i) => [i.id, i]));
  data.dogadjajiById = new Map((raw.dogadjaji || []).map((d) => [d.id, d]));
  data.nastupiPoTz = new Map();
  data.nastupiPoIzvodjacu = new Map();
  for (const n of raw.nastupi) {
    if (n.tz_id) {
      if (!data.nastupiPoTz.has(n.tz_id)) data.nastupiPoTz.set(n.tz_id, []);
      data.nastupiPoTz.get(n.tz_id).push(n);
    }
    if (!data.nastupiPoIzvodjacu.has(n.izvodjac_id)) {
      data.nastupiPoIzvodjacu.set(n.izvodjac_id, []);
    }
    data.nastupiPoIzvodjacu.get(n.izvodjac_id).push(n);
  }
  return data;
}

export function fuzzyIzvodjac(data, q) {
  const fq = fold(q).trim();
  if (!fq) return null;
  const rows = data.izvodjaci;
  const exact = rows.find(
    (r) => fold(r.ime) === fq || (r.slug && r.slug === fq)
  );
  if (exact) return exact;
  const starts = rows.filter((r) => {
    const fn = fold(r.ime);
    return fn.startsWith(fq) || fq.startsWith(fn.slice(0, Math.max(4, fq.length)));
  });
  if (starts.length === 1) return starts[0];
  let best = null;
  let bestS = 0;
  for (const r of rows) {
    const fn = fold(r.ime);
    let s = ratio(fq, fn);
    if (r.slug) s = Math.max(s, ratio(fq, r.slug));
    if (fq.length >= 6 && fn.startsWith(fq.slice(0, 6))) s = Math.max(s, 0.85);
    if (fn.includes(fq)) s = Math.max(s, 0.8);
    if (!best || s > bestS) {
      best = r;
      bestS = s;
    }
  }
  return bestS >= 0.62 ? best : null;
}

export function fuzzyTz(data, q) {
  const fq = fold(q).trim();
  if (!fq) return null;
  const rows = data.tz;
  for (const r of rows) {
    const fn = fold(r.ime);
    if (fq === fn || (r.slug && fq === r.slug)) return r;
  }
  const scored = rows.map((r) => {
    const fn = fold(r.ime);
    let s = ratio(fq, fn);
    if (fn.includes(fq)) {
      const hit =
        fn.includes("grada " + fq) ||
        fn.includes("opcine " + fq) ||
        fn.endsWith(fq);
      s = Math.max(s, 0.8 + (hit ? 0.1 : 0));
    }
    // Vodice → Vodica (genitiv)
    const last = fn.split(" ").pop();
    if (last && (last.startsWith(fq.slice(0, Math.max(4, fq.length - 1))) || fq.startsWith(last.slice(0, Math.max(4, last.length - 1))))) {
      s = Math.max(s, 0.78);
    }
    if (r.slug) s = Math.max(s, ratio(fq, r.slug));
    return [s, r];
  });
  scored.sort((a, b) => b[0] - a[0]);
  const top = scored.filter((c) => c[0] >= 0.55).slice(0, 8);
  for (const [s, r] of top) {
    const fn = fold(r.ime);
    if (fn.includes("grada " + fq) || fn.includes("opcine " + fq)) return r;
  }
  // prefer municipal over županijska when the short name matches
  for (const [s, r] of top) {
    const fn = fold(r.ime);
    if (fn.includes(fq) && r.razina !== "zupanijska") return r;
  }
  return top.length ? top[0][1] : null;
}

function ratio(a, b) {
  // Jednostavan Dice / bigram omjer, dovoljan za kratka imena.
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => {
    const g = new Map();
    const t = " " + s + " ";
    for (let i = 0; i < t.length - 1; i++) {
      const k = t.slice(i, i + 2);
      g.set(k, (g.get(k) || 0) + 1);
    }
    return g;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [k, v] of ga) inter += Math.min(v, gb.get(k) || 0);
  return (2 * inter) / (a.length + 1 + b.length + 1);
}
