import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { S, setScreen, present, showSnackbar, shiftLongPressed, hooks } from '../store.js';
import { Fmt, drivenKm } from '../logic.js';
import { TopBar, usePress } from './common.js';
import { Icon } from './icons.js';

/** Fahrtenbuch: alle Dienste nach Monat gruppiert, auf-/zuklappbar (FahrtenbuchActivity.kt). */
export function FahrtenbuchView() {
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => {
    hooks.onShiftRestored = (shift) => setExpanded((e) => new Set([...e, Fmt.slashMonthKey(shift.date)]));
    return () => { hooks.onShiftRestored = null; };
  }, []);

  // Neueste zuerst, Gruppen in Reihenfolge des ersten Auftretens.
  const groups = [];
  for (const shift of [...S.shifts].reverse()) {
    const key = Fmt.slashMonthKey(shift.date);
    const g = groups.find((x) => x.key === key);
    if (g) g.shifts.push(shift);
    else groups.push({ key, shifts: [shift] });
  }
  const toggle = (key) => setExpanded((e) => {
    const n = new Set(e);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return html`<div class="screen">
    <${TopBar} title="Fahrtenbuch" icon="back" label="Zurück" onAction=${() => setScreen('main')} />
    <main class="content">
      ${S.shifts.length === 0
    ? html`<div class="secondary" style=${{ fontSize: '18px', paddingTop: '40px', textAlign: 'center' }}>Noch keine Einträge</div>`
    : html`<div class="list-gap">
        ${groups.map((g) => {
      const open = expanded.has(g.key);
      return html`<${MonthHeader} key=${g.key} monthKey=${g.key} shifts=${g.shifts} expanded=${open} onClick=${() => toggle(g.key)} />
            ${open && g.shifts.map((s) => html`<${ShiftRow} key=${s.id} shift=${s} />`)}`;
    })}
      </div>`}
    </main>
  </div>`;
}

function MonthHeader({ monthKey, shifts, expanded, onClick }) {
  const driven = shifts.reduce((sum, s) => sum + (drivenKm(s) ?? 0), 0);
  const summary = `${shifts.length} ${shifts.length === 1 ? 'Dienst' : 'Dienste'} · ${Fmt.km(driven)} km`;
  const title = Fmt.monthTitleSlash(monthKey);
  return html`<button class="month-head pressable" onClick=${onClick} aria-expanded=${expanded}
      aria-label=${`${title}, ${summary}, ${expanded ? 'aufgeklappt' : 'zugeklappt'}`}>
    <div class="grow"><strong>${title}</strong><small>${summary}</small></div>
    <${Icon} name=${expanded ? 'chevronDown' : 'chevronRight'} size=${26} stroke=${2.8} />
  </button>`;
}

function ShiftRow({ shift }) {
  const running = shift.isActive && shift.kmEnd === null;
  let missingKm = null;
  // Laufender Dienst: nur Start-km kann fehlen (Startpunkt ist Pflicht beim Start).
  if (running) {
    if (!(shift.kmStart || '').trim()) missingKm = 'Fehlt: Start-km';
  } else {
    const noStart = !(shift.kmStart || '').trim();
    const noEnd = !(shift.kmEnd || '').trim();
    if (noStart && noEnd) missingKm = 'Fehlt: Start-km, End-km';
    else if (noEnd) missingKm = 'Fehlt: End-km';
    else if (noStart) missingKm = 'Fehlt: Start-km';
  }
  const driven = drivenKm(shift);
  const press = usePress(() => {
    if (missingKm && running) present({ type: 'startKmEdit', shiftID: shift.id, onSaved: () => showSnackbar('Start-km gespeichert') });
    else if (missingKm) present({ type: 'kmEdit', shiftID: shift.id, onSaved: () => showSnackbar('Kilometerstand aktualisiert') });
    else present({ type: 'shiftDetails', shiftID: shift.id });
  }, () => shiftLongPressed(shift.id));

  let state;
  if (running) {
    state = html`<div class="state" style=${{ color: 'var(--active)' }}>Dienst läuft${missingKm
      && html`<span style=${{ color: 'var(--warning)' }}> · ${missingKm}</span>`}</div>`;
  }
  else if (missingKm) state = html`<div class="state" style=${{ color: 'var(--warning)' }}>${missingKm}</div>`;
  else state = html`<div class="secondary" style=${{ fontSize: '15px', marginTop: '4px' }}>${Fmt.km(shift.kmStart)} → ${Fmt.km(shift.kmEnd)} km</div>`;

  return html`<div class="shift-row row" role="button" tabindex="0" ...${press}
      aria-description="Lange drücken: löschen"
      onKeyDown=${(e) => { if (e.key === 'Enter') press.onClick(e); }}>
    <div class="shift-badge">${shift.label}</div>
    <div class="grow"><div class="date">${shift.date}</div>${state}</div>
    ${missingKm
    // Eigene 48-px-Tippfläche: direkt zu den Dienst-Details, die übrige Zeile öffnet das Nachtragen.
    ? html`<button class="shift-details-btn" aria-label=${`Details zu Dienst ${shift.label} vom ${shift.date}`}
        onPointerDown=${(e) => e.stopPropagation()} onPointerUp=${(e) => e.stopPropagation()}
        onKeyDown=${(e) => e.stopPropagation()}
        onClick=${(e) => { e.stopPropagation(); present({ type: 'shiftDetails', shiftID: shift.id }); }}>
        <${Icon} name="chevronRight" size=${24} stroke=${2.8} />
      </button>`
    : !running && driven !== null && html`<div class="km"><strong>${Fmt.km(driven)}</strong><span class="secondary">km</span></div>`}
  </div>`;
}
