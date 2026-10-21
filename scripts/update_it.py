"""Lädt die amtlichen italienischen Spritpreise (MIMIT, Osservaprezzi carburanti)
und legt sie als kleine JSON-Kacheln unter data/it/ ab (eine Datei je 1°×1°).

Quelle: https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti
Format je Kachel: {"updated": "...", "stations": [[id, name, adresse, lat, lng, benzina, gasolio, stand], ...]}
"""
import csv
import io
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone

BASE = "https://www.mimit.gov.it/images/exportCSV/"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "it")


def fetch(name):
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "sprit-rechner (github.com/xxxphoenix/sprit-rechner)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def rows(text):
    """Überspringt die Zeile „Estrazione del …“ und erkennt das Trennzeichen (| oder ;)."""
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines[:5]) if l.lower().startswith("idimpianto"))
    delim = "|" if lines[start].count("|") > lines[start].count(";") else ";"
    reader = csv.reader(io.StringIO("\n".join(lines[start:])), delimiter=delim)
    header = [h.strip().lower() for h in next(reader)]
    for r in reader:
        # Zeilen mit verrutschten Spalten (Trennzeichen im Namen) werden übersprungen
        if len(r) == len(header):
            yield dict(zip(header, (c.strip() for c in r)))


def num(s):
    try:
        return float(s.replace(",", "."))
    except (ValueError, AttributeError):
        return None


def iso(d):
    """„21/10/2026 07:00:00“ → „2026-10-21“"""
    try:
        return datetime.strptime(d.split()[0], "%d/%m/%Y").strftime("%Y-%m-%d")
    except (ValueError, IndexError):
        return ""


def main():
    stations = {}
    for r in rows(fetch("anagrafica_impianti_attivi.csv")):
        lat, lng = num(r.get("latitudine")), num(r.get("longitudine"))
        if not lat or not lng or not (35 < lat < 48 and 6 < lng < 19):
            continue
        name = r.get("bandiera") or r.get("nome impianto") or r.get("gestore") or "Distributore"
        if name.lower() in ("pompe bianche", ""):
            name = r.get("nome impianto") or "Distributore"
        addr = ", ".join(x for x in (r.get("indirizzo", ""), r.get("comune", "").title()) if x)
        stations[r["idimpianto"]] = {"name": name, "addr": addr, "lat": round(lat, 5), "lng": round(lng, 5), "b": None, "g": None, "t": ""}

    # Pro Station den günstigsten Preis je Sorte (Self-Service meist günstiger als Bedienung)
    for r in rows(fetch("prezzo_alle_8.csv")):
        s = stations.get(r.get("idimpianto"))
        price = num(r.get("prezzo"))
        if not s or not price or not (0.5 < price < 4):
            continue
        fuel = r.get("desccarburante", "").lower()
        key = "b" if fuel.startswith("benzina") and "plus" not in fuel and "special" not in fuel else "g" if fuel.startswith("gasolio") and "premium" not in fuel and "special" not in fuel else None
        if key and (s[key] is None or price < s[key]):
            s[key] = price
            s["t"] = max(s["t"], iso(r.get("dtcomu", "")))

    tiles = {}
    for sid, s in stations.items():
        if s["b"] is None and s["g"] is None:
            continue
        k = f"{math.floor(s['lat'])}_{math.floor(s['lng'])}"
        tiles.setdefault(k, []).append([sid, s["name"], s["addr"], s["lat"], s["lng"], s["b"], s["g"], s["t"]])

    if sum(len(v) for v in tiles.values()) < 5000:
        sys.exit(f"Zu wenige Tankstellen mit Preis ({sum(len(v) for v in tiles.values())}), Abbruch ohne Änderung")

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".json"):
            os.remove(os.path.join(OUT, f))
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    for k, v in tiles.items():
        with open(os.path.join(OUT, k + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"updated": updated, "stations": v}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{sum(len(v) for v in tiles.values())} Tankstellen in {len(tiles)} Kacheln")


if __name__ == "__main__":
    main()
