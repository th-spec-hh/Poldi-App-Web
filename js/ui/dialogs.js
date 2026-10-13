import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import {
  S, dismiss, present, findShift, updateShift, setKm, addEndpoint, header, setString, showSnackbar,
} from '../store.js';
import { Fmt, ShiftPoint, shiftOptions, AbrechnungRows, drivenKm, parseKm } from '../logic.js';
import { CloseButton, TextField, FilterChip } from './common.js';
import { Icon } from './icons.js';

/** Wie setCancelable() auf Android: Tipp neben den Dialog schließt ihn. */
const cancelable = new Set(['confirm', 'shiftDetails', 'kmEdit', 'startPointEdit', 'endpointEdit', 'menu',
  'completeShift', 'personalData', 'message']);

/** Zeigt den obersten Dialog über allen Screens (Android: MaterialAlertDialog). */
export function DialogHost() {
  const item = S.dialogs[S.dialogs.length - 1];
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && cancelable.has(item.type)) close(item);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item && item.key]);
  if (!item) return null;
  return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget && cancelable.has(item.type)) close(item); }}>
    <${DialogContent} key=${item.key} item=${item} close=${() => close(item)} />
  </div>`;
}

function close(item) {
  if (item.type === 'km' && item.onDismiss) item.onDismiss();
  dismiss(item);
}

/** Rahmen eines Dialogs: Titel (26 px bold) mit optionalem ✕, Inhalt, Textbuttons. */
function DialogCard({ title, onClose, buttons = [], flush = false, children }) {
  return html`<div class="dialog" role="dialog" aria-modal="true" aria-label=${title}>
    <div class="dialog-head">
      <h2>${title}</h2>
      ${onClose && html`<${CloseButton} onClick=${onClose} />`}
    </div>
    <div class=${'dialog-body' + (flush ? ' flush' : '')}>${children}</div>
    ${buttons.length
    ? html`<div class="dialog-buttons">${buttons.map(([label, fn]) => html`<button class="pressable" onClick=${fn}>${label}</button>`)}</div>`
    : html`<div class=${'dialog-end' + (flush ? ' flush' : '')}></div>`}
  </div>`;
}

function ListRow({ onClick, children, label }) {
  return html`<button class="list-row pressable" onClick=${onClick} aria-label=${label}><span>${children}</span></button>`;
}

function OptionList({ options, onSelect, close }) {
  return options.map((option, i) => html`<${ListRow} onClick=${() => { close(); onSelect(i); }}>${option}<//>`);
}

function DialogContent({ item, close }) {
  switch (item.type) {
    case 'shiftSelection':
      return html`<${DialogCard} title="Wähle den Dienst" onClose=${close} flush>
        ${shiftOptions.map((o) => {
          const [from, to] = o.label.replace(' Uhr', '').split(' - ');
          return html`<${ListRow} label=${o.label} onClick=${() => { close(); item.onSelect(o.short); }}>
            <span class="shift-option"><b>${from}</b><span>–</span><b>${to}</b><span>Uhr</span></span>
          <//>`;
        })}
      <//>`;
    case 'point':
      return html`<${DialogCard} title=${item.title} onClose=${item.closable ? close : null} flush>
        <${OptionList} options=${ShiftPoint.all} close=${close} onSelect=${(i) => item.onSelect(ShiftPoint.all[i])} />
      <//>`;
    case 'menu':
      return html`<${DialogCard} title=${item.title} onClose=${close} flush>
        <${OptionList} options=${item.options} close=${close} onSelect=${item.onSelect} />
      <//>`;
    case 'km':
      return html`<${KmDialog} item=${item} close=${close} />`;
    case 'confirm':
      return html`<${DialogCard} title=${item.title} buttons=${[['Abbrechen', close], [item.confirmLabel, () => { close(); item.onConfirm(); }]]}>
        <p>${item.message}</p>
      <//>`;
    case 'message':
      return html`<${DialogCard} title=${item.title} buttons=${[...(item.buttons || []).map(([l, fn]) => [l, () => { close(); fn(); }]), ['OK', close]]}>
        <p>${item.text}</p>
      <//>`;
    case 'shiftDetails':
      return html`<${ShiftDetailsDialog} id=${item.shiftID} close=${close} />`;
    case 'kmEdit':
      return html`<${KmEditDialog} id=${item.shiftID} close=${close} onSaved=${item.onSaved} />`;
    case 'startPointEdit': {
      const current = findShift(item.shiftID)?.startPoint;
      return html`<${DialogCard} title=${current ? `Startpunkt (bisher: ${current})` : 'Startpunkt nachtragen'} onClose=${close} flush>
        <${OptionList} options=${ShiftPoint.all} close=${close} onSelect=${(i) => {
          updateShift(item.shiftID, (s) => { s.startPoint = ShiftPoint.all[i]; });
          item.onSaved();
        }} />
      <//>`;
    }
    case 'endpointEdit':
      return html`<${EndpointDialog} id=${item.shiftID} close=${close} onSaved=${item.onSaved} />`;
    case 'completeShift':
      return html`<${CompleteShiftDialog} id=${item.shiftID} close=${close} onChanged=${item.onChanged} />`;
    case 'personalData':
      return html`<${PersonalDataDialog} close=${close} onSaved=${item.onSaved} />`;
    default:
      return null;
  }
}

// ---------- Kilometerstand ----------

function KmDialog({ item, close }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const confirm = () => {
    const v = value.trim();
    if (!v) {
      setError('Bitte Kilometerstand eingeben');
      return;
    }
    close();
    item.onConfirm(v);
  };
  const buttons = [];
  if (item.onSkip) buttons.push(['Nachtragen', () => { close(); item.onSkip(); }]);
  buttons.push(['Bestätigen', confirm]);
  return html`<${DialogCard} title=${item.title} onClose=${item.closable === false ? null : close} buttons=${buttons}>
    <div class="stack">
      ${item.message && html`<p>${item.message}</p>`}
      <${TextField} label="Kilometerstand" value=${value} placeholder="z. B. 123456" error=${error} autoFocus
        onInput=${(v) => { setValue(v); setError(null); }} onEnter=${confirm} />
    </div>
  <//>`;
}

function KmEditDialog({ id, close, onSaved }) {
  const shift = findShift(id);
  const [start, setStart] = useState(shift?.kmStart || '');
  const [end, setEnd] = useState(shift?.kmEnd || '');
  const save = () => {
    setKm(id, start.trim(), end.trim());
    close();
    onSaved();
  };
  return html`<${DialogCard} title="Kilometerstand nachtragen" onClose=${close} buttons=${[['Abbrechen', close], ['Speichern', save]]}>
    <div class="stack">
      <${TextField} label="Kilometerstand Anfang" value=${start} placeholder="z. B. 123456" onInput=${setStart} />
      <${TextField} label="Kilometerstand Ende" value=${end} placeholder="z. B. 123999" onInput=${setEnd} onEnter=${save} />
    </div>
  <//>`;
}

// ---------- Endpunkt nachtragen ----------

function EndpointDialog({ id, close, onSaved }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const save = () => {
    const value = text.trim();
    if (!value) {
      setError('Bitte einen Text eingeben');
      return;
    }
    addEndpoint(id, value);
    close();
    onSaved();
  };
  return html`<${DialogCard} title="Endpunkt nachtragen" onClose=${close} buttons=${[['Abbrechen', close], ['Speichern', save]]}>
    <div class="stack">
      <div class="chips">
        ${ShiftPoint.all.map((option) => html`<${FilterChip} title=${option} selected=${text.trim() === option}
          onClick=${() => { setText(text.trim() === option ? '' : option); setError(null); }} />`)}
      </div>
      <${TextField} label="Endpunkt" value=${text} placeholder="z. B. Wohnung" numeric=${false} maxLength=${null}
        error=${error} capitalize="sentences" onInput=${(v) => { setText(v); setError(null); }} onEnter=${save} />
    </div>
  <//>`;
}

// ---------- Dienst-Details (Fahrtenbuch) ----------

function ShiftDetailsDialog({ id, close }) {
  const shift = findShift(id);
  if (!shift) return null;
  const driven = drivenKm(shift);
  // Letzter Eintrag ist der Endpunkt, wenn er Arbeit/Wohnung ist (nur bei beendetem Dienst).
  const endIndex = !shift.isActive && AbrechnungRows.endPoint(shift) !== null ? shift.visited.length - 1 : -1;
  const line = { fontSize: '17px', padding: '6px 0' };
  return html`<${DialogCard} title=${`Dienst ${shift.label}`} onClose=${close}>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style=${{ fontSize: '20px', fontWeight: 700 }}>${shift.date}</div>
      <div style=${{ fontSize: '17px' }}>Kilometer Anfang: ${shift.kmStart ? Fmt.km(shift.kmStart) : '-'}</div>
      <div style=${{ fontSize: '17px' }}>Kilometer Ende: ${shift.kmEnd ? Fmt.km(shift.kmEnd) : '-'}</div>
      ${driven !== null && html`<div style=${{ fontSize: '17px', fontWeight: 700, color: 'var(--primary)' }}>Gefahren: ${Fmt.km(driven)} km</div>`}
      <div class="section" style=${{ marginTop: '14px' }}>Angefahrene Orte</div>
      ${shift.startPoint && html`<div class="secondary" style=${line}>Start: ${shift.startPoint}</div>`}
      ${shift.visited.length === 0
    ? html`<div class="secondary">Keine Einträge</div>`
    : shift.visited.map((v, i) => {
      const suffix = v.assignedBy ? ` (Auftrag: ${v.assignedBy})` : '';
      return i === endIndex
        ? html`<div class="secondary" style=${line}>Ende: ${v.title}${suffix}</div>`
        : html`<div style=${line}>${v.title}${suffix}</div>`;
    })}
    </div>
  <//>`;
}

// ---------- Abrechnung: Dienst vervollständigen ----------

function CompleteShiftDialog({ id, close, onChanged }) {
  const shift = findShift(id);
  if (!shift) return null;
  const start = shift.startPoint && ShiftPoint.all.includes(shift.startPoint) ? shift.startPoint : null;
  const end = AbrechnungRows.endPoint(shift);
  const kmStart = parseKm(shift.kmStart);
  const kmEnd = parseKm(shift.kmEnd);
  const kmOk = kmStart !== null && kmEnd !== null && kmEnd >= kmStart;
  let kmText;
  if (kmOk) kmText = `Kilometer: ${Fmt.km(kmStart)} – ${Fmt.km(kmEnd)}`;
  else if (kmStart !== null && kmEnd !== null) kmText = 'Kilometerstand prüfen (Ende kleiner als Anfang)';
  else if (kmStart === null && kmEnd === null) kmText = 'Kilometerstände nachtragen';
  else if (kmStart === null) kmText = 'Start-km nachtragen';
  else kmText = 'End-km nachtragen';

  const afterEdit = () => {
    onChanged && onChanged();
    const s = findShift(id);
    if (s && AbrechnungRows.problems(s).length === 0) {
      close();
      showSnackbar(`Dienst vom ${s.date} vollständig`);
    }
  };
  const row = (done, text, action) => html`<button class=${'status-row pressable' + (done ? ' ok' : '')} onClick=${action}
      aria-description=${done ? 'Erledigt. Zum Ändern tippen.' : 'Fehlt. Zum Nachtragen tippen.'}>
    <span>${text}</span><${Icon} name=${done ? 'check' : 'chevronRight'} size=${22} stroke=${2.8} />
  </button>`;
  return html`<${DialogCard} title=${`Dienst ${shift.label} vom ${shift.date}`} onClose=${close}>
    <div class="stack" style=${{ gap: '10px' }}>
      ${row(start !== null, start ? `Startpunkt: ${start}` : 'Startpunkt nachtragen',
    () => present({ type: 'startPointEdit', shiftID: id, onSaved: afterEdit }))}
      ${row(end !== null, end ? `Endpunkt: ${end}` : 'Endpunkt nachtragen',
      () => present({ type: 'endpointEdit', shiftID: id, onSaved: afterEdit }))}
      ${row(kmOk, kmText, () => present({ type: 'kmEdit', shiftID: id, onSaved: afterEdit }))}
    </div>
  <//>`;
}

// ---------- Persönliche Daten ----------

function PersonalDataDialog({ close, onSaved }) {
  const h = header();
  const [name, setName] = useState(h.name);
  const [pnr, setPnr] = useState(h.personalnummer);
  const [kfz, setKfz] = useState(h.kennzeichen);
  const [kst, setKst] = useState(h.kostenstelle);
  const [pnrError, setPnrError] = useState(null);
  const save = () => {
    const pnrValue = pnr.trim();
    // Das Formular löscht Personalnummern unter 10000 beim Bearbeiten in Adobe.
    if (pnrValue && Number(pnrValue) <= 9999) {
      setPnrError('Mindestens 5 Ziffern');
      return;
    }
    setString('pdf_name', name.trim());
    setString('pdf_personalnummer', pnrValue);
    setString('pdf_kennzeichen', kfz.trim());
    setString('pdf_kostenstelle', kst.trim());
    close();
    onSaved && onSaved();
  };
  return html`<${DialogCard} title="Persönliche Daten" onClose=${close} buttons=${[['Abbrechen', close], ['Speichern', save]]}>
    <div class="stack">
      <${TextField} label="Name des Fahrers" value=${name} numeric=${false} maxLength=${null} capitalize="words" onInput=${setName} />
      <${TextField} label="Personalnummer" value=${pnr} maxLength=${null} error=${pnrError}
        onInput=${(v) => { setPnr(v); setPnrError(null); }} />
      <${TextField} label="Kfz-Kennzeichen" value=${kfz} numeric=${false} maxLength=${null} capitalize="characters" onInput=${setKfz} />
      <${TextField} label="Kostenstelle" value=${kst} maxLength=${null} onInput=${setKst} onEnter=${save} />
    </div>
  <//>`;
}
