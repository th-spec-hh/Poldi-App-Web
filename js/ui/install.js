import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { getString, setString } from '../store.js';
import { CloseButton } from './common.js';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferredPrompt = null;
const promptListeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  promptListeners.forEach((fn) => fn());
});

/** Hinweis „Zum Home-Bildschirm“, solange die App im Browser-Tab läuft. */
export function InstallHint() {
  const [, rerender] = useState(0);
  const [hidden, setHidden] = useState(getString('install_hint_hidden') === '1');
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    promptListeners.add(fn);
    return () => promptListeners.delete(fn);
  }, []);
  if (hidden || isStandalone()) return null;
  const hide = () => {
    setString('install_hint_hidden', '1');
    setHidden(true);
  };
  let text;
  if (isIos()) {
    text = html`<p><b>Als App installieren:</b> In Safari unten auf „Teilen“ <span aria-hidden="true">(□↑)</span> tippen, dann „Zum Home-Bildschirm“. Danach Poldi immer über das Symbol öffnen.</p>`;
  } else if (deferredPrompt) {
    text = html`<p><b>Als App installieren:</b> <button class="link" style=${{ color: 'var(--link)', fontWeight: 700 }}
      onClick=${async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; hide(); }}>Jetzt installieren</button></p>`;
  } else {
    text = html`<p><b>Als App installieren:</b> Im Browser-Menü „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.</p>`;
  }
  return html`<div class="install-hint">${text}<${CloseButton} onClick=${hide} label="Hinweis ausblenden" /></div>`;
}
