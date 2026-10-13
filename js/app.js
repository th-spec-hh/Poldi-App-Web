import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import {
  S, init, subscribe, activeShift, setScreen, setDrawer, snackbarAction, checkAutoEnd, present,
  exportBackup, importBackup, APP_VERSION,
} from './store.js';
import { Fmt } from './logic.js';
import { pickFile, shareOrDownload } from './files.js';
import { MainView } from './ui/main.js';
import { FahrtenbuchView } from './ui/fahrtenbuch.js';
import { AbrechnungView } from './ui/abrechnung.js';
import { DialogHost } from './ui/dialogs.js';
import { TaskDetailSheet } from './ui/detail.js';
import { LocationPicker } from './ui/picker.js';
import { CloseButton } from './ui/common.js';
import { Icon } from './ui/icons.js';

function App() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);

  // Ersatz für den Android-Worker: beim Öffnen, beim Zurückkehren in die App und alle 30 s prüfen.
  useEffect(() => {
    checkAutoEnd();
    const onVisible = () => { if (document.visibilityState === 'visible') checkAutoEnd(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', checkAutoEnd);
    const t = setInterval(checkAutoEnd, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', checkAutoEnd);
      clearInterval(t);
    };
  }, []);

  let screen;
  if (S.screen === 'fahrtenbuch') screen = html`<${FahrtenbuchView} />`;
  else if (S.screen === 'abrechnung') screen = html`<${AbrechnungView} />`;
  else screen = html`<${MainView} />`;

  const snackBottom = S.screen === 'fahrtenbuch' ? 16 : 120;
  return html`
    ${screen}
    ${S.snackbar && html`<div class="snackbar-wrap" key=${S.snackbar.id} style=${{ bottom: `calc(${snackBottom}px + var(--safe-bottom))` }}>
      <div class="snackbar" role="status">
        <span>${S.snackbar.message}</span>
        ${S.snackbar.actionLabel && html`<button onClick=${snackbarAction}>${S.snackbar.actionLabel}</button>`}
      </div>
    </div>`}
    <${Drawer} />
    <${TaskDetailSheet} />
    <${LocationPicker} />
    <${DialogHost} />`;
}

/** Seitenmenü (drawer_panel.xml): App-Kachel, Dienststatus, Einträge, Version. */
function Drawer() {
  if (!S.drawerOpen) return null;
  const shift = activeShift();
  const item = (icon, title, screen) => html`<button class=${'drawer-item pressable' + (S.screen === screen ? ' selected' : '')}
      aria-current=${S.screen === screen ? 'page' : undefined} onClick=${() => setScreen(screen)}>
    <${Icon} name=${icon} size=${26} /><span>${title}</span>
  </button>`;
  return html`
    <div class="drawer-scrim" onClick=${() => setDrawer(false)}></div>
    <nav class="drawer" aria-label="Menü">
      <div class="drawer-head">
        <div class="app-tile" aria-hidden="true">P</div>
        <div class="grow">
          <h2>Poldi</h2>
          ${shift
    ? html`<div style=${{ fontSize: '16px', fontWeight: 700, color: 'var(--active)', marginTop: '4px' }}>Dienst ${shift.label} aktiv</div>`
    : html`<div class="secondary" style=${{ fontSize: '16px', marginTop: '4px' }}>Kein Dienst aktiv</div>`}
        </div>
        <${CloseButton} onClick=${() => setDrawer(false)} label="Menü schließen" />
      </div>
      <div class="divider"></div>
      <div class="drawer-items">
        ${item('car', 'Aktiver Dienst', 'main')}
        ${item('book', 'Fahrtenbuch', 'fahrtenbuch')}
        ${item('doc', 'Abrechnung (PDF)', 'abrechnung')}
      </div>
      <div class="drawer-items" style=${{ marginTop: '18px' }}>
        <button class="drawer-item minor pressable" onClick=${backup}><${Icon} name="download" size=${24} /><span>Daten sichern</span></button>
        <button class="drawer-item minor pressable" onClick=${restore}><${Icon} name="upload" size=${24} /><span>Daten wiederherstellen</span></button>
      </div>
      <div class="drawer-foot secondary">Version ${APP_VERSION} (Web)</div>
    </nav>`;
}

function backup() {
  setDrawer(false);
  const name = `Poldi-Sicherung_${Fmt.date().split('.').reverse().join('-')}.json`;
  shareOrDownload(new TextEncoder().encode(exportBackup()), name, 'application/json');
}

async function restore() {
  setDrawer(false);
  const file = await pickFile('application/json,.json,text/plain');
  if (!file) return;
  const text = await file.text();
  present({
    type: 'confirm',
    title: 'Daten wiederherstellen',
    message: `Alle Dienste auf diesem Gerät werden durch die Sicherung „${file.name}“ ersetzt.`,
    confirmLabel: 'Ersetzen',
    onConfirm: () => {
      try {
        const count = importBackup(text);
        present({ type: 'message', title: 'Wiederhergestellt', text: `${count} ${count === 1 ? 'Dienst' : 'Dienste'} geladen.` });
      } catch (e) {
        present({ type: 'message', title: 'Sicherung nicht lesbar', text: e.message || String(e) });
      }
    },
  });
}

init().then(() => {
  // Browser bitten, die Daten nicht bei Speicherknappheit zu löschen.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
});
render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Neue Version: nicht mitten in der Bedienung neu laden, sondern beim nächsten Öffnen der App.
  const hadController = !!navigator.serviceWorker.controller;
  let updatePending = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) updatePending = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (updatePending && document.visibilityState === 'visible') location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
