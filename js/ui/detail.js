import { html } from '../../vendor/preact-htm.js';
import { S, closeTask, toggle, location } from '../store.js';
import { CloseButton } from './common.js';
import { Icon } from './icons.js';

/** Einsatzort-Details als Bottom-Sheet (dialog_task_details.xml). */
export function TaskDetailSheet() {
  const task = S.tasks.find((t) => t.id === S.detailTaskID);
  if (!task) return null;
  const parts = task.addedAt.split(',').map((p) => p.trim());
  const recorded = parts[1] ? `Erfasst ${parts[0]} Uhr, ${parts[1]}` : `Erfasst ${parts[0]} Uhr`;
  const toggleBtn = (title, active, color, text, key) => html`<button class="toggle pressable" aria-pressed=${active}
      style=${active ? { background: color, borderColor: 'transparent', color: text } : null}
      onClick=${() => toggle(task.id, key)}>
    ${active && html`<${Icon} name="check" size=${24} stroke=${3} />`}${title}
  </button>`;
  return html`<div class="sheet-scrim" onClick=${(e) => { if (e.target === e.currentTarget) closeTask(); }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${task.title}>
      <div class="sheet-head">
        <div style=${{ flex: 1, minWidth: 0 }}>
          <h2>${task.title}</h2>
          <div class="secondary" style=${{ fontSize: '17px', marginTop: '6px' }}>${recorded}</div>
        </div>
        <${CloseButton} onClick=${closeTask} />
      </div>
      <div class="section" style=${{ margin: '24px 0 10px' }}>Merkmale</div>
      <div class="toggles">
        ${toggleBtn('BtM', task.hasBtm, 'var(--btm)', 'var(--on-primary)', 'hasBtm')}
        ${toggleBtn('Alk', task.hasAlk, 'var(--alk)', 'var(--on-primary)', 'hasAlk')}
        ${toggleBtn('VF', task.hasVf, 'var(--vf)', 'var(--on-vf)', 'hasVf')}
      </div>
      <div style=${{ marginTop: '16px' }}><${ContactRows} loc=${location(task.title)} /></div>
      ${task.assignedBy && html`
        <div class="section" style=${{ marginTop: '24px' }}>Im Auftrag von</div>
        <div style=${{ fontSize: '20px', fontWeight: 700, marginTop: '10px' }}>${task.assignedBy}</div>
        <div style=${{ marginTop: '12px' }}><${ContactRows} loc=${location(task.assignedBy)} /></div>`}
    </div>
  </div>`;
}

/** „Anrufen“ und „Navigation starten“ (item_contact_row.xml). */
function ContactRows({ loc }) {
  if (!loc) return null;
  const rows = [];
  if (loc.phone.trim()) {
    const digits = loc.phone.replace(/[^\d+]/g, '');
    rows.push(html`<a class="contact pressable" href=${`tel:${digits}`} aria-label=${`${loc.title} anrufen: ${loc.phone}`}>
      <${Icon} name="phone" size=${28} stroke=${2} />
      <div><small>Anrufen</small><strong>${loc.phone}</strong></div>
    </a>`);
  }
  const hasCoords = loc.latitude !== null && loc.longitude !== null;
  const hasAddress = !!loc.address.trim();
  if (hasCoords || hasAddress) {
    const address = hasAddress ? loc.address : 'Standort öffnen';
    rows.push(html`<a class="contact pressable" href=${mapUrl(loc)} target="_blank" rel="noopener"
        aria-label=${`Navigation zu ${loc.title} starten: ${address}`}>
      <${Icon} name="pin" size=${28} stroke=${2} />
      <div><small>Navigation starten</small><strong>${address}</strong></div>
    </a>`);
  }
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '12px' }}>${rows}</div>`;
}

/**
 * Hinterlegte Koordinaten gewinnen (große Gelände wie AKK oder Kinder UKE); sonst Suche nach
 * „Name, Adresse“. Der Google-Maps-Link öffnet die App, wenn sie installiert ist, auf dem iPhone
 * sonst Google Maps im Browser.
 */
function mapUrl(loc) {
  if (loc.latitude !== null && loc.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;
  }
  const search = loc.address ? `${loc.title}, ${loc.address}` : loc.title;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(search)}`;
}
