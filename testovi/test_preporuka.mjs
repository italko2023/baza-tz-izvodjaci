#!/usr/bin/env node
// Usporedba preporuke s očekivanim činjenicama iz export/demo_preporuka_*.txt
// i sa stvarnim izlazom skripte preporuka.py.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  indexData,
  fuzzyTz,
  fuzzyIzvodjac,
  preporukaZaTz,
  preporukaZaIzvodjaca,
  predloziTzZaIzvodjaca,
} from "../preporuka.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(name) {
  return JSON.parse(readFileSync(join(ROOT, "data", name), "utf8"));
}

const data = indexData({
  meta: load("meta.json"),
  tz: load("tz.json"),
  mjesta: load("mjesta.json"),
  izvodjaci: load("izvodjaci.json"),
  nastupi: load("nastupi.json"),
  izdavaci: load("izdavaci.json"),
  dogadjaji: load("dogadjaji.json"),
  zupanije: load("zupanije.json"),
});

let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log("  OK  ", name);
  } else {
    failed += 1;
    console.log("  FAIL", name, detail);
  }
}

console.log("JSON učitavanje:");
check("meta shema 3.0.0", data.meta.shema === "3.0.0");
check("297 TZ", data.tz.length === 297, String(data.tz.length));
check("izvođači > 800", data.izvodjaci.length >= 800, String(data.izvodjaci.length));
check("nastupi > 1000", data.nastupi.length >= 1000, String(data.nastupi.length));
check("svaki nastup ima izvor", data.nastupi.every((n) => n.izvori && n.izvori.length));
check("Vodice fuzzy", fuzzyTz(data, "Vodice")?.ime?.includes("Vodica"));
check("Kukljica fuzzy", fuzzyTz(data, "Kukljica")?.ime?.includes("Kukljica"));
check("Grše fuzzy", fuzzyIzvodjac(data, "Grše")?.ime === "Grše");
check("Hiljsonnse fuzzy", /Hiljson/i.test(fuzzyIzvodjac(data, "Hiljsonnse")?.ime || ""));

const kuk = fuzzyTz(data, "Kukljica");
const vod = fuzzyTz(data, "Vodice");
const rKuk = preporukaZaTz(data, kuk.id);
const rVod = preporukaZaTz(data, vod.id);

console.log("\nKukljica:");
check("2 nastupa 2026.", rKuk.nastupi.length === 2, String(rKuk.nastupi.length));
check("zona otok, prag 40", rKuk.tz.zona === "otok" && rKuk.prag === 40);

const sviIstiKuk = rKuk.blokovi.flatMap((b) => b.kuce.flatMap((k) => k.isti));
const sviIskKuk = rKuk.blokovi.flatMap((b) => b.kuce.flatMap((k) => k.iskljuceni));
const imenaIsti = new Set(sviIstiKuk.map((x) => x.ime));
const imenaIsk = sviIskKuk.map((x) => `${x.ime} | ${x.razlog}`);

check(
  "Vojko V isključen (Petrčane ~9.5 km)",
  sviIskKuk.some(
    (x) =>
      x.ime.includes("Vojko") &&
      /Petrčane/.test(x.razlog) &&
      x.km > 9 &&
      x.km < 10
  ),
  imenaIsk.join("\n    ")
);
check(
  "Hiljson Mandela kandidat (~53 km, Vodice)",
  sviIstiKuk.some(
    (x) =>
      x.ime.includes("Hiljson") &&
      x.km_najblizi > 52 &&
      x.km_najblizi < 54 &&
      /Vodic/.test(x.gdje_najblizi || "")
  ),
  sviIstiKuk
    .filter((x) => x.ime.includes("Hiljson"))
    .map((x) => `${x.ime} ${x.km_najblizi} ${x.gdje_najblizi}`)
    .join()
);

for (const ime of [
  "30zona",
  "Baks",
  "High5",
  "Hiljson Mandela",
  "KUKU$",
  "Luzeri",
  "Peki",
  "Sjena",
  "Tej & Špiro",
  "z++",
]) {
  check(`Kukljica isti žanr: ${ime}`, imenaIsti.has(ime));
}

const yemNap = rKuk.blokovi.some((b) =>
  b.kuce.some(
    (k) =>
      k.napomenaVeza &&
      k.napomenaVeza.includes("Grše") &&
      k.napomenaVeza.includes("2026-03-25")
  )
);
check("napomena: Grše napustio YEM 2026-03-25", yemNap);

console.log("\nVodice:");
check("17 nastupa 2026.", rVod.nastupi.length === 17, String(rVod.nastupi.length));
check("zona obala, prag 40 kopno", rVod.tz.zona === "obala" && rVod.prag === 40 && rVod.pragNap === "kopno");

const grseBlok = rVod.blokovi.find((b) => b.izvodjac && b.izvodjac.ime === "Grše");
check("Grše je svirao u Vodicama", !!grseBlok);
const hiljIsk = grseBlok
  ? grseBlok.kuce.flatMap((k) => k.iskljuceni).find((x) => x.ime.includes("Hiljson"))
  : null;
check(
  "Hiljson isključen za Gršeov nastup (0 km, 2026-07-18 Vodice)",
  hiljIsk &&
    hiljIsk.km === 0 &&
    /2026-07-18/.test(hiljIsk.razlog) &&
    /Vodice/.test(hiljIsk.razlog),
  hiljIsk ? hiljIsk.razlog : "nema isključenja"
);
check(
  "YEM napomena na Gršeovom bloku",
  grseBlok &&
    grseBlok.kuce.some(
      (k) => k.napomenaVeza && k.napomenaVeza.includes("2026-03-25")
    )
);

const grseIsti = new Set(
  (grseBlok ? grseBlok.kuce.flatMap((k) => k.isti) : []).map((x) => x.ime)
);
check("Grše/Vodice predlaže Pekija (isti žanr)", grseIsti.has("Peki"));
check("Grše/Vodice predlaže Vojka V", grseIsti.has("Vojko V"));
check("Grše/Vodice NE predlaže Hiljsona u 'isti'", !grseIsti.has("Hiljson Mandela"));

console.log("\nIzvođač → TZ (Hiljson Mandela):");
const hilj = fuzzyIzvodjac(data, "Hiljson Mandela");
const tzZaHilj = predloziTzZaIzvodjaca(data, hilj.id);
check("Hiljson dobiva prijedloge TZ", tzZaHilj.length > 0, String(tzZaHilj.length));
check(
  "Kukljica je među prijedlozima za Hiljsona",
  tzZaHilj.some((p) => p.tz_id === kuk.id),
  tzZaHilj.slice(0, 5).map((p) => p.tz.ime).join("; ")
);
check(
  "Vodice NIJE prijedlog za Hiljsona (već svirao, 0 km)",
  !tzZaHilj.some((p) => p.tz_id === vod.id)
);

const rGrse = preporukaZaIzvodjaca(data, fuzzyIzvodjac(data, "Grše").id);
const vodiceBlok = rGrse.blokovi.find((b) => b.tz && b.tz.id === vod.id);
check(
  "--izvodjac Grše: Vodice isključuje Hiljsona",
  vodiceBlok &&
    vodiceBlok.kuce.some((k) =>
      k.iskljuceni.some((x) => x.ime.includes("Hiljson") && x.km === 0)
    )
);

console.log("\n" + (failed ? `${failed} testova nije prošlo.` : "Svi testovi su prošli."));
process.exit(failed ? 1 : 0);
