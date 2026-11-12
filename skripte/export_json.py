#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Izvoz baza_tz_2026.sqlite u kompaktni JSON za statičko sučelje.

Samo čita izvornu bazu — ne mijenja je.
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
# Izvorna baza — samo za čitanje, izvan ovog projekta.
SRC_DB = Path("/workspace/domaci-feste-otoci-2026/baza_tz_2026.sqlite")
OUT = ROOT / "data"
ZAGREB = ZoneInfo("Europe/Zagreb")


def connect():
    con = sqlite3.connect(f"file:{SRC_DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def dump(name: str, obj) -> Path:
    path = OUT / name
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return path


def main():
    if not SRC_DB.exists():
        raise SystemExit(f"Nema izvorne baze: {SRC_DB}")
    OUT.mkdir(parents=True, exist_ok=True)
    con = connect()

    verzija = dict(con.execute("SELECT * FROM schema_version").fetchone())

    zupanije = [
        {"id": r["id"], "ime": r["name"]}
        for r in con.execute("SELECT id, name FROM zupanija ORDER BY id")
    ]
    zup_ime = {z["id"]: z["ime"] for z in zupanije}

    otoci = {r["id"]: r["name"] for r in con.execute("SELECT id, name FROM otok")}

    jls = {
        r["id"]: {"ime": r["name"], "tip": r["type"], "zupanija_id": r["zupanija_id"]}
        for r in con.execute("SELECT * FROM jedinica_lokalne_samouprave")
    }

    mjesta = []
    for r in con.execute("SELECT * FROM mjesto ORDER BY name"):
        j = jls.get(r["jls_id"]) if r["jls_id"] else None
        mjesta.append({
            "id": r["id"],
            "ime": r["name"],
            "lat": r["lat"],
            "lon": r["lon"],
            "otok": otoci.get(r["otok_id"]),
            "jls": j["ime"] if j else None,
            "zupanija_id": j["zupanija_id"] if j else None,
            "zupanija": zup_ime.get(j["zupanija_id"]) if j else None,
        })

    kontakti = {
        r["tz_id"]: dict(r)
        for r in con.execute("SELECT * FROM tz_kontakt")
    }

    # broj nastupa po TZ (kao organizator) i po izvođaču
    n_po_tz = dict(con.execute(
        """SELECT d.organizator_tz_id, COUNT(*)
           FROM nastup n JOIN dogadjaj d ON d.id=n.dogadjaj_id
           WHERE d.organizator_tz_id IS NOT NULL
           GROUP BY d.organizator_tz_id"""
    ))
    n_po_izv = dict(con.execute(
        "SELECT izvodjac_id, COUNT(*) FROM nastup GROUP BY izvodjac_id"
    ))

    tz = []
    for r in con.execute(
        "SELECT * FROM turisticka_zajednica ORDER BY name"
    ):
        k = kontakti.get(r["id"], {})
        tz.append({
            "id": r["id"],
            "ime": r["name"],
            "slug": r["slug"],
            "zona": r["zona"],
            "razina": r["level"],
            "zupanija_id": r["zupanija_id"],
            "zupanija": zup_ime.get(r["zupanija_id"]),
            "otok": otoci.get(r["otok_id"]),
            "lat": r["lat"],
            "lon": r["lon"],
            "web": k.get("web") or r["web"],
            "email": k.get("email") or r["email"],
            "telefon": k.get("telefon") or r["telefon"],
            "adresa": k.get("adresa") or r["adresa"],
            "facebook": k.get("facebook") or r["facebook"],
            "instagram": k.get("instagram"),
            "direktor": k.get("direktor"),
            "predsjednik": k.get("predsjednik"),
            "oib": k.get("oib") or r["oib"],
            "upisni_br": k.get("upisni_br") or r["upisni_br"],
            "n_nastupa": n_po_tz.get(r["id"], 0),
        })

    izdavaci = []
    n_roster = dict(con.execute(
        """SELECT izdavac_id, COUNT(DISTINCT izvodjac_id)
           FROM izvodjac_izdavac
           WHERE valid_to IS NULL OR valid_to >= '2027-01-01'
           GROUP BY izdavac_id"""
    ))
    for r in con.execute("SELECT * FROM izdavac ORDER BY id"):
        izdavaci.append({
            "id": r["id"],
            "ime": r["name"],
            "slug": r["slug"],
            "tip": r["tip"],
            "web": r["web"],
            "email": r["email"],
            "napomena": r["napomena"],
            "n_izvodjaca": n_roster.get(r["id"], 0),
        })

    zanr_po = defaultdict(list)
    zanr_naziv = {r["slug"]: r["naziv"] for r in con.execute("SELECT slug, naziv FROM zanr")}
    for r in con.execute(
        "SELECT iz.izvodjac_id, z.slug FROM izvodjac_zanr iz JOIN zanr z ON z.id=iz.zanr_id"
    ):
        zanr_po[r["izvodjac_id"]].append(r["slug"])

    kuce_po = defaultdict(list)
    for r in con.execute(
        """SELECT ii.izvodjac_id, z.id, z.name, z.slug, z.tip, ii.uloga,
                  ii.valid_from, ii.valid_to, ii.napomena
           FROM izvodjac_izdavac ii
           JOIN izdavac z ON z.id=ii.izdavac_id
           ORDER BY z.name, ii.valid_from"""
    ):
        kuce_po[r["izvodjac_id"]].append({
            "id": r["id"],
            "ime": r["name"],
            "slug": r["slug"],
            "tip": r["tip"],
            "uloga": r["uloga"],
            "od": r["valid_from"],
            "do": r["valid_to"],
            "napomena": r["napomena"],
        })

    izvodjaci = []
    for r in con.execute("SELECT * FROM izvodjac ORDER BY name"):
        izvodjaci.append({
            "id": r["id"],
            "ime": r["name"],
            "slug": r["slug"],
            "tip": r["type"],
            "zanr": r["genre"],
            "zanrovi": zanr_po.get(r["id"], []),
            "aka": r["aka"],
            "mjesto": r["home_town"],
            "kuce": kuce_po.get(r["id"], []),
            "n_nastupa": n_po_izv.get(r["id"], 0),
        })

    dogadjaji = []
    for r in con.execute("SELECT * FROM dogadjaj ORDER BY date_start, name"):
        dogadjaji.append({
            "id": r["id"],
            "ime": r["name"],
            "tip": r["type"],
            "mjesto_id": r["mjesto_id"],
            "tz_id": r["organizator_tz_id"],
            "od": r["date_start"],
            "do": r["date_end"],
        })

    uspjeh_naziv = {
        r["id"]: (r["slug"], r["naziv"])
        for r in con.execute("SELECT id, slug, naziv FROM uspjeh_nastupa")
    }

    izvori_po = defaultdict(list)
    for r in con.execute(
        """SELECT ni.nastup_id, iv.url, iv.type
           FROM nastup_izvor ni JOIN izvor iv ON iv.id=ni.izvor_id"""
    ):
        izvori_po[r["nastup_id"]].append({"url": r["url"], "tip": r["type"]})

    mjesto_ime = {m["id"]: m["ime"] for m in mjesta}
    tz_ime = {t["id"]: t["ime"] for t in tz}
    izv_ime = {i["id"]: i["ime"] for i in izvodjaci}
    dog_by = {d["id"]: d for d in dogadjaji}

    nastupi = []
    for r in con.execute("SELECT * FROM nastup ORDER BY date, id"):
        d = dog_by[r["dogadjaj_id"]]
        us = uspjeh_naziv.get(r["uspjeh_id"])
        # 'nepoznato' nije dokaz uspjeha
        uspjeh_slug = us[0] if us and us[0] != "nepoznato" else None
        uspjeh_naz = us[1] if uspjeh_slug else None
        nastupi.append({
            "id": r["id"],
            "izvodjac_id": r["izvodjac_id"],
            "izvodjac": izv_ime.get(r["izvodjac_id"]),
            "dogadjaj_id": r["dogadjaj_id"],
            "dogadjaj": d["ime"],
            "datum": r["date"],
            "vrijeme": r["time"],
            "mjesto_id": d["mjesto_id"],
            "mjesto": mjesto_ime.get(d["mjesto_id"]),
            "tz_id": d["tz_id"],
            "tz": tz_ime.get(d["tz_id"]),
            "pouzdanost": r["pouzdanost"],
            "uspjeh": uspjeh_slug,
            "uspjeh_naziv": uspjeh_naz,
            "izvori": izvori_po.get(r["id"], []),
            "napomena": r["napomena"],
        })

    sada = datetime.now(ZAGREB)
    meta = {
        "shema": verzija["verzija"],
        "shema_opis": verzija["opis"],
        "shema_primijenjeno": verzija["primijenjeno_u"],
        "azurirano": sada.strftime("%Y-%m-%d"),
        "azurirano_iso": sada.isoformat(timespec="seconds"),
        "azurirano_prikaz": sada.strftime("%-d. %-m. %Y."),
        "sezona": 2026,
        "preporuka_za": 2027,
        "iskljucenje_km": 40,
        "brojevi": {
            "tz": len(tz),
            "mjesta": len(mjesta),
            "izvodjaci": len(izvodjaci),
            "nastupi": len(nastupi),
            "dogadjaji": len(dogadjaji),
            "izdavaci": len(izdavaci),
            "zupanije": len(zupanije),
        },
        "pouzdanost": {
            "potvrdeno": "potvrđeno",
            "najavljeno": "najavljeno",
            "nesigurno": "nesigurno",
        },
        "zone": {
            "otok": "otok",
            "obala": "obala",
            "zaledje": "zaleđe",
            "kontinent": "kontinent",
            "zupanija": "županija",
            "nacionalna": "nacionalna",
        },
        "napomena": (
            "Podaci su iz javnih izvora (Upisnik TZ, kalendari, plakati, vijesti, "
            "javni katalozi izdavača). Svaki nastup ima URL izvora. Ništa nije izmišljeno. "
            "Poveznica izvođača s izdavačem nije tvrdnja o ekskluzivnom ugovoru."
        ),
    }

    files = {
        "meta.json": meta,
        "zupanije.json": zupanije,
        "mjesta.json": mjesta,
        "tz.json": tz,
        "izdavaci.json": izdavaci,
        "izvodjaci.json": izvodjaci,
        "dogadjaji.json": dogadjaji,
        "nastupi.json": nastupi,
    }
    print("Izvoz JSON-a (izvorna baza nije dirana):")
    total = 0
    for name, obj in files.items():
        p = dump(name, obj)
        sz = p.stat().st_size
        total += sz
        print(f"  {name:18} {sz:8} B")
    print(f"  {'UKUPNO':18} {total:8} B")


if __name__ == "__main__":
    main()
