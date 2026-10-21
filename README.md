# Sprit-Rechner

Handy-Web-App (PWA): lohnt sich der Umweg zur günstigeren Tankstelle?

## Dateien
- `index.html`, `app.css`, `app.js`: die App (ohne Build, reines HTML/JS)
- `manifest.webmanifest`, `sw.js`, `icon.svg`: Installation auf dem Homescreen, offline-fähiges Gerüst
- `build-preview.sh`: baut eine Einzeldatei-Vorschau mit Beispieldaten

## Rechnung
Vergleich ist die nächstgelegene offene Tankstelle (oder die per „Als Vergleich nehmen“ gewählte).
- Umweg-km = (Entfernung Station − Entfernung Vergleich) × Straßenfaktor (Standard 1,3) × 2 (mit Rückweg)
- Umwegkosten = Umweg-km × Verbrauch / 100 × Literpreis der Station
- Netto = (Vergleichspreis − Preis) × Tankmenge − Umwegkosten; empfohlen ab 0,50 € Netto

## Route
Optional ein Ziel eingeben (Ortsname, Koordinaten oder langer Google-Maps-Link). Dann werden Tankstellen entlang der Luftlinie Start→Ziel gesucht (bis zu 9 Abfragepunkte) und der Umweg als Start→Station→Ziel minus Start→Ziel berechnet. Auf Android kann man ein Ziel in Google Maps über „Teilen“ direkt an die installierte App schicken (share_target im Manifest). Die laufende Navigation in Google Maps kann eine Web-App nicht auslesen.

Ortssuche: Photon (komoot), ersatzweise Nominatim (OpenStreetMap).

## Preisquellen (`PROVIDERS` in app.js)
- DE: Tankerkönig / MTS-K, braucht kostenlosen API-Schlüssel (https://onboarding.tankerkoenig.de/)
- AT: E-Control Spritpreisrechner, ohne Schlüssel (E5/E10 → Super 95)
- FR: prix-carburants (data.economie.gouv.fr, Datensatz prix-des-carburants-en-france-flux-instantane-v2), ohne Schlüssel (E5 → SP95, Diesel → Gazole); Preise älter als 7 Tage werden ignoriert
- IT: MIMIT Osservaprezzi (Preise um 8 Uhr). Die CSV-Dateien erlauben keinen Abruf aus dem Browser, deshalb lädt der Workflow `.github/workflows/preise-italien.yml` sie täglich, `scripts/update_it.py` schreibt Kacheln nach `data/it/` (E5/E10 → Benzina, Diesel → Gasolio, günstigster Preis je Station)
Neues Land (z. B. wie FR): Objekt mit `covers(lat, lng)` und `search(...)` ergänzen.

## Betrieb
Standort funktioniert nur über HTTPS (z. B. GitHub Pages). Fahrzeuge und Schlüssel liegen im Browser-Speicher des Handys.
