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

## Preisquellen (`PROVIDERS` in app.js)
- DE: Tankerkönig / MTS-K, braucht kostenlosen API-Schlüssel (https://onboarding.tankerkoenig.de/)
- AT: E-Control Spritpreisrechner, ohne Schlüssel (E5/E10 → Super 95)
Neues Land: Objekt mit `covers(lat, lng)` und `search(...)` ergänzen.

## Betrieb
Standort funktioniert nur über HTTPS (z. B. GitHub Pages). Fahrzeuge und Schlüssel liegen im Browser-Speicher des Handys.
