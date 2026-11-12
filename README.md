# Baza turističkih zajednica i izvođača 2026.

Statičko sučelje nad relacijskom bazom svih turističkih zajednica u Republici Hrvatskoj (Upisnik Ministarstva turizma i sporta, stanje 10. 11. 2026.) i imenovanih nastupa domaćih izvođača u sezoni 2026. Služi za **spajanje izvođača s turističkim zajednicama**.

Živa stranica: [https://italko2023.github.io/baza-tz-izvodjaci/](https://italko2023.github.io/baza-tz-izvodjaci/)

## Što se može pregledati

1. **Turističke zajednice** — pretraga i filtar po županiji te obali/kontinentu, karta, kartica s kontaktom i nastupima koje je TZ organizirala.
2. **Izvođači** — pretraga, filtar po labeli/agenciji, popis nastupa s poveznicama na izvor.
3. **Nastupi** — tablica s filtrom po datumu, mjestu, izvođaču i pouzdanosti (`potvrđeno` / `najavljeno` / `nesigurno`).
4. **Preporuka za 2027.**
   - odabir TZ → predlažu se kolege s iste kuće i (gdje je poznato) istog žanra, koji u 2026. **nisu svirali unutar 40 km**;
   - odabir izvođača → predlažu se TZ na kojima su kolege s iste kuće svirali, a ovaj izvođač nije bio unutar 40 km.

Na nastupe dolaze ljudi iz okolnih mjesta, pa blizina nije prednost nego preklapanje publike. Na otocima je prag za sada istih 40 km (manji prag i trajektna razdvojenost mogu doći kasnije).

Ako je izvođač kuću već napustio (npr. Grše je YEM napustio 25. 3. 2026.), preporuka i dalje nudi **aktualni roster** te kuće: ideja je «ako je dobro prošao, netko drugi iz iste kuće».

## Podaci

JSON u mapi `data/` izvezen je iz SQLite baze sheme **3.0.0**. Izvorna baza se ovdje ne drži i nije mijenjana.

- Svaki nastup ima URL izvora. Ništa nije izmišljeno.
- Kontakti TZ dolaze iz javnog Upisnika i službenih stranica.
- Poveznica izvođača s izdavačem (Croatia Records, YEM, Scardona, Aquarius…) **nije tvrdnja o ekskluzivnom ugovoru** — samo što je kuća javno navela u katalogu.
- Pokrivenost nije potpuna: nedostaju još neki kirvaji, dani općina, dijelovi Zagorja i Međimurja; Menart i Dallas nemaju javni potpuni popis izvođača koji je unesen.

## Lokalno pokretanje

Nema koraka izgradnje. Treba samo HTTP poslužitelj (moduli i `fetch` ne rade s `file://`):

```bash
python3 -m http.server 8080
# otvoriti http://127.0.0.1:8080/
```

Test preporuke (Kukljica, Vodice, usporedba s logikom `preporuka.py`):

```bash
node testovi/test_preporuka.mjs
```

Izvoz JSON-a iz izvorne baze (samo čitanje):

```bash
python3 skripte/export_json.py
```

## Hosting

GitHub Pages, grana `main`, korijen spremišta. Radni tijek je u `.github/workflows/pages.yml`. Ako stranica nije odmah živa, u postavkama spremišta treba uključiti Pages (Settings → Pages → Source: GitHub Actions, ili Deploy from branch `main` / root).
