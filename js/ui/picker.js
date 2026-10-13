import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { S, closePicker, getString, setString } from '../store.js';
import { LocationGroups, groupOf } from '../logic.js';
import { CloseButton, FilterChip } from './common.js';
import { Icon } from './icons.js';

/**
 * Vollbild-Auswahl „Ziel wählen“ bzw. „Im Auftrag von?“ (LocationPicker.kt): Suchfeld,
 * Gruppenfilter. „Alle“ und Suche zeigen eine nach Gruppen eingeteilte Liste, eine einzelne
 * Gruppe große Kacheln im Raster (beim Fahren schneller zu treffen).
 */
export function LocationPicker() {
  const request = S.picker;
  if (!request) return null;
  return html`<${PickerContent} key=${request.id} request=${request} />`;
}

function PickerContent({ request }) {
  const presentGroups = LocationGroups.filter((g) => request.titles.some((t) => groupOf(t) === g.id));
  const filterKey = `picker_filter_${request.title}`;
  const initial = () => {
    // Zuletzt benutzter Filter (je Auswahl-Titel); gibt es nur eine Gruppe, direkt diese.
    if (presentGroups.length === 1) return presentGroups[0].id;
    const saved = getString(filterKey);
    return presentGroups.some((g) => g.id === saved) ? saved : null;
  };
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(initial);
  const [tapped, setTapped] = useState(null);
  const picked = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const select = (g) => {
    setGroup(g);
    setString(filterKey, g);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const pick = (title) => {
    if (picked.current) return;
    picked.current = true;
    request.onSelected(title);
  };
  const trimmed = query.trim();

  return html`<div class="picker" role="dialog" aria-modal="true" aria-label=${request.title}>
    <div class="picker-inner">
      <div class="picker-head">
        <h2>${request.title}</h2>
        <${CloseButton} onClick=${closePicker} />
      </div>
      <label class="search">
        <${Icon} name="search" size=${24} stroke=${2.6} />
        <input type="search" value=${query} placeholder="Ort suchen, z. B. PK 15" aria-label="Ort suchen"
          autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="characters" enterkeyhint="search"
          onInput=${(e) => setQuery(e.currentTarget.value)} />
        ${query && html`<button class="clear" aria-label="Suche löschen" onClick=${() => setQuery('')}><${Icon} name="clearCircle" size=${24} /></button>`}
      </label>
      ${presentGroups.length > 1 && html`<div class="chips picker-chips">
        <${FilterChip} title="Alle" selected=${group === null} onClick=${() => select(null)} />
        ${presentGroups.map((g) => html`<${FilterChip} title=${g.label} selected=${group === g.id} onClick=${() => select(g.id)} />`)}
      </div>`}
      <div class="picker-scroll" ref=${scrollRef}>
        ${group && !trimmed
    ? html`<${Tiles} titles=${request.titles.filter((t) => groupOf(t) === group)} group=${group} tapped=${tapped}
            onTap=${(title) => {
      // Tipp sichtbar quittieren: Kachel kurz dunkel füllen, dann schließen.
      setTapped(title);
      setTimeout(() => pick(title), 180);
    }} />`
    : html`<${List} titles=${request.titles} group=${group} query=${trimmed} onPick=${pick} />`}
      </div>
    </div>
  </div>`;
}

function Tiles({ titles, group, tapped, onTap }) {
  const columns = tileColumns(group);
  return html`<div class="tiles" style=${{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    ${titles.map((title) => html`<button class=${'tile pressable' + (group === 'KLINIKEN' ? ' short' : '') + (tapped === title ? ' tapped' : '')}
        style=${{ fontSize: tileFontSize(group) + 'px' }} aria-label=${title} onClick=${() => onTap(title)}>
      ${tileLabel(title)}
    </button>`)}
  </div>`;
}

function List({ titles, group, query, onPick }) {
  const q = query.toLocaleLowerCase('de');
  const sections = LocationGroups.filter((g) => group === null || group === g.id).map((g) => {
    const matches = titles.filter((t) => groupOf(t) === g.id && (!q || t.toLocaleLowerCase('de').includes(q)));
    if (!matches.length) return null;
    return html`<div>
      <div class="section group-title">${g.label}</div>
      ${matches.map((title) => html`<button class="list-row pressable" onClick=${() => onPick(title)}><span>${title}</span></button>`)}
    </div>`;
  }).filter(Boolean);
  if (!sections.length) return html`<div class="secondary" style=${{ padding: '24px', fontSize: '18px' }}>Kein Ort gefunden</div>`;
  return sections;
}

/** Kacheln pro Reihe: kurze Nummern 4, kurze Namen 3, lange Kliniknamen 2. */
function tileColumns(group) {
  if (group === 'PK') return 4;
  if (group === 'WSPK' || group === 'BP') return 3;
  return 2;
}

function tileFontSize(group) {
  if (group === 'PK' || group === 'WSPK') return 30;
  if (group === 'BP') return 22;
  return 19;
}

/** Text auf der Kachel: Die Gruppe steht schon im Filter, also z. B. nur „31“ statt „PK 31“. */
function tileLabel(title) {
  if (title === 'BP Hauptbahnhof') return 'Hbf';
  if (title === 'Marienkrankenhaus') return 'Marien-\nkrankenhaus';
  if (title === 'IfR - Butenfeld') return 'IfR\nButenfeld';
  for (const prefix of ['PK ', 'WSPK ', 'BP ']) {
    if (title.startsWith(prefix)) return title.slice(prefix.length);
  }
  return title;
}
