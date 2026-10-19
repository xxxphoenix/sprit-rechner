/* Sprit-Rechner: lohnt sich der Umweg zur günstigeren Tankstelle? */
'use strict';

// ---------- Kraftstoffe ----------
// tk = Tankerkönig-Sorte (DE), ec = E-Control-Sorte (AT; dort gibt es kein eigenes E10)
const FUELS = {
  e5:     { label: 'Super E5',  tk: 'e5',     ec: 'SUP' },
  e10:    { label: 'Super E10', tk: 'e10',    ec: 'SUP' },
  diesel: { label: 'Diesel',    tk: 'diesel', ec: 'DIE' },
};

// ---------- Preisquellen ----------
// Neue Länder: weiteres Objekt mit covers() und search() ergänzen.
const PROVIDERS = [
  {
    id: 'tankerkoenig',
    country: 'DE',
    name: 'Tankerkönig (MTS-K)',
    credit: 'Preise Deutschland: Markttransparenzstelle für Kraftstoffe über Tankerkönig, CC BY 4.0',
    covers: (lat, lng) => lat > 47.2 && lat < 55.1 && lng > 5.8 && lng < 15.1,
    async search({ lat, lng, radius, fuel, settings }) {
      if (!settings.tkKey) {
        throw new Error('Für Deutschland fehlt der Tankerkönig-Schlüssel. Trage ihn unter Einstellungen ein.');
      }
      const url = 'https://creativecommons.tankerkoenig.de/json/list.php'
        + `?lat=${lat}&lng=${lng}&rad=${Math.min(25, radius)}&sort=dist`
        + `&type=${FUELS[fuel].tk}&apikey=${encodeURIComponent(settings.tkKey)}`;
      const data = await fetchJson(url);
      if (!data.ok) throw new Error('Tankerkönig: ' + (data.message || 'unbekannter Fehler'));
      return data.stations.filter(s => s.price).map(s => ({
        id: 'tk-' + s.id,
        name: s.brand || s.name,
        sub: s.brand ? s.name : '',
        address: `${s.street || ''} ${s.houseNumber || ''}, ${s.postCode || ''} ${s.place || ''}`.replace(/\s+/g, ' ').trim(),
        lat: s.lat, lng: s.lng, open: s.isOpen, price: s.price, country: 'DE',
      }));
    },
  },
  {
    id: 'econtrol',
    country: 'AT',
    name: 'E-Control Spritpreisrechner',
    credit: 'Preise Österreich: E-Control Spritpreisrechner',
    covers: (lat, lng) => lat > 46.3 && lat < 49.1 && lng > 9.5 && lng < 17.2,
    async search({ lat, lng, fuel }) {
      const url = 'https://api.e-control.at/sprit/1.0/search/gas-stations/by-address'
        + `?latitude=${lat}&longitude=${lng}&fuelType=${FUELS[fuel].ec}&includeClosed=false`;
      const data = await fetchJson(url);
      return (Array.isArray(data) ? data : []).filter(s => s.prices && s.prices.length && s.prices[0].amount).map(s => ({
        id: 'ec-' + s.id,
        name: s.name,
        sub: '',
        address: `${s.location.address || ''}, ${s.location.postalCode || ''} ${s.location.city || ''}`.trim(),
        lat: s.location.latitude, lng: s.location.longitude, open: s.open !== false,
        price: s.prices[0].amount, country: 'AT',
      }));
    },
  },
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Server antwortet mit ${res.status}`);
  return res.json();
}

// ---------- Rechnung ----------
function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Bewertet jede Tankstelle gegen die nächstgelegene (Vergleich).
 * Umweg = zusätzliche Straßen-km gegenüber dem Vergleich, optional mit Rückweg.
 * Netto = (Vergleichspreis − Preis) × Liter − Umweg-km × Verbrauch/100 × Preis.
 */
function evaluate(stations, { consumption, liters, roadFactor, roundTrip, refId }) {
  const open = stations.filter(s => s.open);
  if (!open.length) return { ref: null, rows: [] };
  const nearest = open.reduce((a, b) => (a.distKm <= b.distKm ? a : b));
  const ref = open.find(s => s.id === refId) || nearest;
  const legs = roundTrip ? 2 : 1;
  const rows = open.map(s => {
    const extraKm = Math.max(0, (s.distKm - ref.distKm) * roadFactor * legs);
    const detourCost = extraKm * consumption / 100 * s.price;
    const saving = (ref.price - s.price) * liters;
    const net = saving - detourCost;
    // ab wie vielen Litern lohnt es sich?
    const diff = ref.price - s.price;
    const breakEvenL = diff > 0 ? detourCost / diff : null;
    return { ...s, roadKm: s.distKm * roadFactor, extraKm, detourCost, saving, net, breakEvenL, isRef: s.id === ref.id };
  });
  rows.sort((a, b) => b.net - a.net || a.distKm - b.distKm);
  return { ref: rows.find(r => r.isRef), rows };
}

// ---------- Beispieldaten (Grenzraum Freilassing / Salzburg) ----------
const DEMO_LOCATION = { lat: 47.8405, lng: 12.9789, label: 'Freilassing (Beispiel)' };
const DEMO_STATIONS = [
  { id: 'd1', name: 'ARAL',      sub: 'Aral Freilassing',      address: 'Reichenhaller Str. 50, 83395 Freilassing', lat: 47.8381, lng: 12.9702, country: 'DE', p: { e5: 1.869, e10: 1.809, diesel: 1.719 } },
  { id: 'd2', name: 'Shell',     sub: 'Shell Münchener Str.',  address: 'Münchener Str. 31, 83395 Freilassing',     lat: 47.8462, lng: 12.9655, country: 'DE', p: { e5: 1.849, e10: 1.789, diesel: 1.699 } },
  { id: 'd3', name: 'JET',       sub: 'JET Ainring',           address: 'Salzburger Str. 12, 83404 Ainring',        lat: 47.8124, lng: 12.9428, country: 'DE', p: { e5: 1.799, e10: 1.739, diesel: 1.659 } },
  { id: 'd4', name: 'Raiffeisen',sub: 'Lagerhaus-Tankstelle',  address: 'Laufener Str. 7, 83395 Freilassing',       lat: 47.8555, lng: 12.9861, country: 'DE', p: { e5: 1.829, e10: 1.769, diesel: 1.689 } },
  { id: 'a1', name: 'OMV',       sub: '',                      address: 'Münchner Bundesstraße 120, 5020 Salzburg', lat: 47.8180, lng: 13.0090, country: 'AT', p: { e5: 1.659, e10: 1.659, diesel: 1.589 } },
  { id: 'a2', name: 'Turmöl',    sub: '',                      address: 'Siezenheimer Str. 35, 5020 Salzburg',      lat: 47.8105, lng: 13.0190, country: 'AT', p: { e5: 1.619, e10: 1.619, diesel: 1.549 } },
  { id: 'a3', name: 'BP',        sub: '',                      address: 'Innsbrucker Bundesstr. 70, 5020 Salzburg', lat: 47.7960, lng: 13.0050, country: 'AT', p: { e5: 1.679, e10: 1.679, diesel: 1.599 } },
  { id: 'a4', name: 'Avia',      sub: '',                      address: 'Wals-Siezenheim, 5071 Wals',               lat: 47.7790, lng: 12.9690, country: 'AT', p: { e5: 1.639, e10: 1.639, diesel: 1.569 } },
];

// ---------- Zustand ----------
const STORE_KEY = 'sprit-rechner.v1';
const DEFAULT_STATE = {
  vehicles: [
    { id: 'v1', plate: 'BGL-AB 123', plateCountry: 'D', name: 'VW Golf 1.5 TSI', consumption: 6.2, fuel: 'e10', example: true },
    { id: 'v2', plate: 'BGL-CD 456', plateCountry: 'D', name: 'Škoda Octavia TDI', consumption: 5.1, fuel: 'diesel', example: true },
    { id: 'v3', plate: 'S-123 XY',   plateCountry: 'A', name: 'Toyota Yaris Hybrid', consumption: 4.3, fuel: 'e5', example: true },
    { id: 'v4', plate: 'BGL-EF 78',  plateCountry: 'D', name: 'Ford Transit', consumption: 8.9, fuel: 'diesel', example: true },
    { id: 'v5', plate: 'BGL-GH 9',   plateCountry: 'D', name: 'BMW 320i', consumption: 7.4, fuel: 'e5', example: true },
  ],
  activeId: 'v1',
  liters: 40,
  radius: 10,
  roundTrip: true,
  settings: { tkKey: '', roadFactor: 1.3, demo: false },
};

let state = load();
const session = { location: null, locStatus: 'idle', stations: [], notes: [], loading: false, fetchedAt: null, refId: null, editing: null, confirmDelete: null, usingDemo: false };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
    }
  } catch (e) { /* Speicher nicht verfügbar */ }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
}
const activeVehicle = () => state.vehicles.find(v => v.id === state.activeId) || state.vehicles[0] || null;

// ---------- Formatierung ----------
const nf = (d) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (x) => nf(2).format(x) + ' €';
const km = (x) => (x < 10 ? nf(1) : nf(0)).format(x) + ' km';
function priceHtml(p) {
  const s = nf(3).format(p);
  return `<span class="price">${s.slice(0, -1)}<sup>${s.slice(-1)}</sup></span>`;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function plateHtml(v, small) {
  return `<span class="plate${small ? ' plate--s' : ''}"><span class="plate__eu">${esc(v.plateCountry || 'D')}</span><span class="plate__no">${esc(v.plate || '—')}</span></span>`;
}

// ---------- Standort ----------
function locate() {
  if (state.settings.demo || window.SPRIT_PREVIEW) return useDemo('Beispieldaten aktiv');
  if (!('geolocation' in navigator)) return useDemo('Dieses Gerät liefert keinen Standort.');
  session.locStatus = 'locating'; render();
  navigator.geolocation.getCurrentPosition(
    pos => {
      session.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, label: 'Aktueller Standort' };
      session.locStatus = 'ok'; session.usingDemo = false;
      loadStations();
    },
    err => {
      session.locStatus = 'error';
      session.notes = [err.code === 1
        ? 'Standortzugriff wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen oder suche einen Ort.'
        : 'Standort konnte nicht ermittelt werden. Suche stattdessen einen Ort.'];
      render();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

async function searchPlace(q) {
  if (!q.trim()) return;
  if (state.settings.demo || window.SPRIT_PREVIEW) return useDemo('In der Vorschau ist die Ortssuche nicht verfügbar.');
  session.locStatus = 'locating'; render();
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de,at&q=' + encodeURIComponent(q);
    const [hit] = await fetchJson(url);
    if (!hit) throw new Error('Ort nicht gefunden');
    session.location = { lat: +hit.lat, lng: +hit.lon, label: hit.display_name.split(',').slice(0, 2).join(',') };
    session.locStatus = 'ok'; session.usingDemo = false;
    loadStations();
  } catch (e) {
    session.locStatus = 'error';
    session.notes = [`„${q}“ wurde nicht gefunden. Prüfe die Schreibweise oder nutze den Standort.`];
    render();
  }
}

function useDemo(reason) {
  session.usingDemo = true;
  session.location = { ...DEMO_LOCATION };
  session.locStatus = 'ok';
  const v = activeVehicle();
  const fuel = v ? v.fuel : 'e5';
  session.stations = DEMO_STATIONS.map(s => ({ ...s, open: true, price: s.p[fuel], distKm: distanceKm(DEMO_LOCATION, s) }))
    .filter(s => s.distKm <= state.radius);
  session.notes = [reason + ' Die Preise sind ausgedacht und zeigen nur, wie die Rechnung funktioniert.'];
  session.fetchedAt = new Date();
  render();
}

async function loadStations() {
  const v = activeVehicle();
  if (!session.location || !v) return render();
  if (session.usingDemo) return useDemo('Beispieldaten aktiv.');
  const { lat, lng } = session.location;
  const active = PROVIDERS.filter(p => p.covers(lat, lng));
  session.loading = true; session.notes = []; render();
  if (!active.length) {
    session.loading = false; session.stations = [];
    session.notes = ['Für diesen Standort gibt es noch keine Preisquelle. Unterstützt werden Deutschland und Österreich.'];
    return render();
  }
  const results = await Promise.allSettled(active.map(p => p.search({ lat, lng, radius: state.radius, fuel: v.fuel, settings: state.settings })));
  const all = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else session.notes.push(r.reason && r.reason.message && !/fetch/i.test(r.reason.message)
      ? r.reason.message
      : `${active[i].name} ist gerade nicht erreichbar.`);
  });
  session.stations = all.map(s => ({ ...s, distKm: distanceKm(session.location, s) })).filter(s => s.distKm <= state.radius);
  session.loading = false; session.fetchedAt = new Date();
  render();
}

// ---------- Darstellung ----------
let view = 'rechner';
const $app = () => document.getElementById('app');

function render() {
  const el = $app(); if (!el) return;
  const focusId = document.activeElement && document.activeElement.id;
  el.innerHTML = `
    <header class="top">
      <div class="top__brand"><span class="pump" aria-hidden="true"></span>Sprit-Rechner</div>
      ${session.usingDemo ? '<span class="pill pill--demo">Beispieldaten</span>' : ''}
    </header>
    <main class="main">${view === 'rechner' ? viewCalc() : view === 'fahrzeuge' ? viewVehicles() : viewSettings()}</main>
    <nav class="tabs" aria-label="Bereiche">
      ${[['rechner', 'Rechner'], ['fahrzeuge', 'Fahrzeuge'], ['einstellungen', 'Einstellungen']].map(([k, l]) =>
        `<button class="tab${view === k ? ' is-on' : ''}" data-view="${k}" ${view === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}
    </nav>`;
  if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus(); if (f.setSelectionRange && f.type === 'text') f.setSelectionRange(f.value.length, f.value.length); } }
}

function viewCalc() {
  const v = activeVehicle();
  if (!v) return `<section class="card empty"><h2>Noch kein Fahrzeug</h2><p>Lege zuerst ein Fahrzeug mit Verbrauch und Kraftstoff an.</p><button class="btn" data-view="fahrzeuge">Fahrzeug anlegen</button></section>`;
  const res = evaluate(session.stations, { consumption: v.consumption, liters: state.liters, roadFactor: state.settings.roadFactor, roundTrip: state.roundTrip, refId: session.refId });
  return `
    <section class="vehicles" aria-label="Fahrzeug wählen">
      ${state.vehicles.map(x => `<button class="vchip${x.id === v.id ? ' is-on' : ''}" data-pick="${x.id}" aria-pressed="${x.id === v.id}">
        ${plateHtml(x, true)}<span class="vchip__name">${esc(x.name)}</span><span class="vchip__meta">${nf(1).format(x.consumption)} l · ${FUELS[x.fuel].label}</span></button>`).join('')}
    </section>

    <section class="card loc">
      <div class="loc__row">
        <div class="loc__text">
          <span class="label">Standort</span>
          <strong>${session.location ? esc(session.location.label) : session.locStatus === 'locating' ? 'Wird ermittelt …' : 'Noch nicht bestimmt'}</strong>
          ${session.location ? `<span class="muted mono">${nf(3).format(session.location.lat)}° N, ${nf(3).format(session.location.lng)}° O${session.location.acc ? ` · ±${Math.round(session.location.acc)} m` : ''}</span>` : ''}
        </div>
        <button class="btn" id="btn-locate" data-act="locate">${session.location ? 'Aktualisieren' : 'Standort nutzen'}</button>
      </div>
      <form class="loc__search" data-form="place">
        <input id="place" type="text" inputmode="search" placeholder="oder Ort suchen, z. B. Rosenheim" autocomplete="off">
        <button class="btn btn--ghost" type="submit">Suchen</button>
      </form>
    </section>

    <section class="card params">
      <label class="param" for="liters"><span class="label">Tankmenge</span><output class="mono">${state.liters} l</output>
        <input id="liters" type="range" min="5" max="100" step="5" value="${state.liters}" data-set="liters"></label>
      <label class="param" for="radius"><span class="label">Umkreis</span><output class="mono">${state.radius} km</output>
        <input id="radius" type="range" min="2" max="25" step="1" value="${state.radius}" data-set="radius"></label>
      <label class="switch" for="roundtrip"><input id="roundtrip" type="checkbox" ${state.roundTrip ? 'checked' : ''} data-set="roundTrip">
        <span>Rückweg einrechnen <span class="muted">(hin und zurück zum Standort)</span></span></label>
    </section>

    ${session.notes.length ? `<section class="notes">${session.notes.map(n => `<p>${esc(n)}</p>`).join('')}</section>` : ''}
    ${session.loading ? '<p class="muted center">Preise werden geladen …</p>' : verdict(res, v)}
    ${res.rows.length ? stationList(res) : ''}
    ${session.fetchedAt ? `<p class="muted small center">Stand ${session.fetchedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${res.rows.length} offene Tankstellen im Umkreis</p>` : ''}`;
}

function verdict(res, v) {
  if (!session.location) return `<section class="verdict verdict--idle"><p>Bestimme deinen Standort, dann vergleiche ich die Tankstellen in der Nähe für <b>${esc(v.name)}</b>.</p></section>`;
  if (!res.rows.length) return session.fetchedAt ? `<section class="verdict verdict--idle"><p>Keine offene Tankstelle mit ${FUELS[v.fuel].label}-Preis im Umkreis von ${state.radius} km. Vergrößere den Umkreis.</p></section>` : '';
  const best = res.rows[0];
  if (best.isRef || best.net < 0.5) {
    return `<section class="verdict verdict--stay">
      <span class="label">Ergebnis</span>
      <h2>Kein Umweg nötig</h2>
      <p>Tanke bei <b>${esc(res.ref.name)}</b> (${km(res.ref.roadKm)}). Kein Umweg spart mehr als 50 Cent.</p>
    </section>`;
  }
  return `<section class="verdict verdict--go">
    <span class="label">Ergebnis</span>
    <h2>Umweg lohnt sich: ${eur(best.net)} gespart</h2>
    <p>Fahre zu <b>${esc(best.name)}</b> statt zu ${esc(res.ref.name)}. ${nf(1).format(best.extraKm)} km Umweg kosten ${eur(best.detourCost)}, die ${state.liters} l sind dort ${eur(best.saving)} günstiger.</p>
    <a class="btn btn--light" href="${navUrl(best)}" target="_blank" rel="noopener">Route starten</a>
  </section>`;
}

const navUrl = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;

function stationList(res) {
  return `<section class="list" aria-label="Tankstellen">
    ${res.rows.map(s => {
      const cls = s.isRef ? 'is-ref' : s.net >= 0.5 ? 'is-good' : s.net < 0 ? 'is-bad' : '';
      return `<article class="st ${cls}">
        <div class="st__price">${priceHtml(s.price)}<span class="st__unit">€/l</span></div>
        <div class="st__body">
          <h3>${esc(s.name)} <span class="cc">${s.country}</span>${s.isRef ? ' <span class="pill">Vergleich</span>' : ''}</h3>
          <p class="muted small">${esc(s.address)}</p>
          <dl class="st__facts">
            <div><dt>Entfernung</dt><dd>${km(s.roadKm)}</dd></div>
            ${s.isRef ? '' : `<div><dt>Umweg</dt><dd>+${nf(1).format(s.extraKm)} km</dd></div>
            <div><dt>Umwegkosten</dt><dd>${eur(s.detourCost)}</dd></div>
            <div><dt>Netto</dt><dd class="net">${s.net >= 0 ? '+' : '−'}${eur(Math.abs(s.net))}</dd></div>`}
          </dl>
          ${!s.isRef && s.breakEvenL ? `<p class="small muted">Lohnt sich ab ${nf(0).format(Math.ceil(s.breakEvenL))} l</p>` : ''}
          <div class="st__acts">
            <a href="${navUrl(s)}" target="_blank" rel="noopener">Route</a>
            ${s.isRef ? '' : `<button class="linkbtn" data-ref="${esc(s.id)}">Als Vergleich nehmen</button>`}
          </div>
        </div>
      </article>`;
    }).join('')}
  </section>`;
}

function viewVehicles() {
  const e = session.editing;
  return `
    <section class="card">
      <div class="row-between"><h2>Fahrzeuge</h2><button class="btn" data-act="new">Neues Fahrzeug</button></div>
      ${state.vehicles.some(v => v.example) ? '<p class="muted small">Die Fahrzeuge mit „Beispiel“ sind Platzhalter. Tippe auf Bearbeiten und trage deine eigenen Daten ein.</p>' : ''}
    </section>
    ${e ? vehicleForm(e) : ''}
    <section class="vlist">
      ${state.vehicles.map(v => `<article class="card vrow${v.id === state.activeId ? ' is-on' : ''}">
        ${plateHtml(v)}
        <div class="vrow__body">
          <strong>${esc(v.name)}</strong>${v.example ? ' <span class="pill">Beispiel</span>' : ''}
          <span class="muted small">${nf(1).format(v.consumption)} l/100 km · ${FUELS[v.fuel].label}</span>
        </div>
        <div class="vrow__acts">
          ${session.confirmDelete === v.id
            ? `<button class="linkbtn danger" data-del-yes="${v.id}">Wirklich löschen</button><button class="linkbtn" data-del-no>Abbrechen</button>`
            : `<button class="linkbtn" data-edit="${v.id}">Bearbeiten</button><button class="linkbtn" data-del="${v.id}">Löschen</button>`}
        </div>
      </article>`).join('')}
    </section>`;
}

function vehicleForm(v) {
  return `<form class="card vform" data-form="vehicle">
    <h2>${v.id ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}</h2>
    <div class="grid2">
      <label for="f-plate"><span class="label">Kennzeichen</span><input id="f-plate" name="plate" required value="${esc(v.plate)}" placeholder="BGL-AB 123" autocapitalize="characters"></label>
      <label for="f-pc"><span class="label">Land</span><select id="f-pc" name="plateCountry">${['D', 'A'].map(c => `<option ${v.plateCountry === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>
    <label for="f-name"><span class="label">Bezeichnung</span><input id="f-name" name="name" required value="${esc(v.name)}" placeholder="z. B. VW Golf"></label>
    <div class="grid2">
      <label for="f-cons"><span class="label">Verbrauch (l/100 km)</span><input id="f-cons" name="consumption" type="number" inputmode="decimal" step="0.1" min="1" max="40" required value="${v.consumption == null ? '' : v.consumption}"></label>
      <label for="f-fuel"><span class="label">Kraftstoff</span><select id="f-fuel" name="fuel">${Object.entries(FUELS).map(([k, f]) => `<option value="${k}" ${v.fuel === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
    </div>
    <p class="muted small">In Österreich wird für E5 und E10 der Preis für Super 95 verwendet.</p>
    <div class="row-end"><button type="button" class="btn btn--ghost" data-act="cancel">Abbrechen</button><button class="btn" type="submit">Speichern</button></div>
  </form>`;
}

function viewSettings() {
  const s = state.settings;
  return `
    <form class="card" data-form="settings">
      <h2>Preisquellen</h2>
      <label for="s-key"><span class="label">Tankerkönig-API-Schlüssel (Deutschland)</span>
        <input id="s-key" name="tkKey" value="${esc(s.tkKey)}" placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false"></label>
      <p class="muted small">Kostenlos unter <a href="https://onboarding.tankerkoenig.de/" target="_blank" rel="noopener">onboarding.tankerkoenig.de</a>. Der Schlüssel bleibt nur auf diesem Gerät. Für Österreich ist kein Schlüssel nötig.</p>
      <label for="s-road"><span class="label">Umrechnung Luftlinie → Straße</span>
        <input id="s-road" name="roadFactor" type="number" step="0.05" min="1" max="2" value="${s.roadFactor}"></label>
      <p class="muted small">Die Entfernung wird per Luftlinie berechnet und mit diesem Faktor auf Straßen-km hochgerechnet (üblich: 1,3).</p>
      <label class="switch" for="s-demo"><input id="s-demo" name="demo" type="checkbox" ${s.demo ? 'checked' : ''}><span>Beispieldaten statt Live-Preisen</span></label>
      <div class="row-end"><button class="btn" type="submit">Speichern</button></div>
    </form>
    <section class="card">
      <h2>Datenquellen</h2>
      <ul class="sources">${PROVIDERS.map(p => `<li><span class="cc">${p.country}</span> ${esc(p.credit)}</li>`).join('')}</ul>
      <p class="muted small">Ortssuche: © OpenStreetMap-Mitwirkende (Nominatim). Alle Angaben ohne Gewähr.</p>
    </section>`;
}

// ---------- Ereignisse ----------
function onClick(e) {
  const t = e.target.closest('button, a'); if (!t) return;
  const d = t.dataset;
  if (d.view) { view = d.view; session.editing = null; session.confirmDelete = null; render(); window.scrollTo(0, 0); return; }
  if (d.pick) { state.activeId = d.pick; session.refId = null; save(); loadStations(); return; }
  if (d.ref) { session.refId = d.ref; render(); return; }
  if (d.edit) { session.editing = { ...state.vehicles.find(v => v.id === d.edit) }; render(); return; }
  if (d.del) { session.confirmDelete = d.del; render(); return; }
  if ('delNo' in d) { session.confirmDelete = null; render(); return; }
  if (d.delYes) {
    state.vehicles = state.vehicles.filter(v => v.id !== d.delYes);
    if (state.activeId === d.delYes) state.activeId = state.vehicles[0] ? state.vehicles[0].id : null;
    session.confirmDelete = null; save(); render(); return;
  }
  if (d.act === 'locate') return locate();
  if (d.act === 'new') { session.editing = { id: '', plate: '', plateCountry: 'D', name: '', consumption: '', fuel: 'e5' }; render(); return; }
  if (d.act === 'cancel') { session.editing = null; render(); return; }
}

function onInput(e) {
  const t = e.target, key = t.dataset.set; if (!key) return;
  if (key === 'roundTrip') state.roundTrip = t.checked;
  else state[key] = +t.value;
  save();
  if (key === 'radius' && e.type === 'change') { loadStations(); return; }
  if (e.type === 'input' && t.type === 'range') {
    // nur Anzeige aktualisieren, damit der Regler beim Ziehen nicht springt
    t.parentElement.querySelector('output').textContent = `${t.value} ${key === 'liters' ? 'l' : 'km'}`;
    return;
  }
  render();
}

function onSubmit(e) {
  const f = e.target; e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'place') return searchPlace(data.place || '');
  if (f.dataset.form === 'vehicle') {
    const v = { ...session.editing, plate: data.plate.trim().toUpperCase(), plateCountry: data.plateCountry, name: data.name.trim(), consumption: parseFloat(String(data.consumption).replace(',', '.')), fuel: data.fuel, example: false };
    if (!v.id) { v.id = 'v' + Date.now(); state.vehicles.push(v); if (!state.activeId) state.activeId = v.id; }
    else state.vehicles = state.vehicles.map(x => (x.id === v.id ? v : x));
    session.editing = null; save(); render(); return;
  }
  if (f.dataset.form === 'settings') {
    const wasDemo = state.settings.demo;
    state.settings = { ...state.settings, tkKey: (data.tkKey || '').trim(), roadFactor: parseFloat(data.roadFactor) || 1.3, demo: f.querySelector('#s-demo').checked };
    save();
    if (wasDemo !== state.settings.demo) { session.location = null; session.stations = []; session.usingDemo = false; session.notes = []; }
    view = 'rechner'; render(); if (session.location || state.settings.demo) locate(); return;
  }
}

function start() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('submit', onSubmit);
  render();
  locate();
  if ('serviceWorker' in navigator && !window.SPRIT_PREVIEW) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (typeof module !== 'undefined') module.exports = { evaluate, distanceKm, FUELS, PROVIDERS };
else start();
