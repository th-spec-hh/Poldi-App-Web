import { html, useRef, useLayoutEffect } from '../../vendor/preact-htm.js';
import { Icon } from './icons.js';

export function TopBar({ title, icon, label, onAction }) {
  return html`<header class="topbar">
    <button class="icon-btn pressable" aria-label=${label} onClick=${onAction}><${Icon} name=${icon} size=${26} /></button>
    <h1>${title}</h1>
    <div class="spacer56"></div>
  </header>`;
}

export function CloseButton({ onClick, label = 'Schließen' }) {
  return html`<button class="close-btn pressable" aria-label=${label} onClick=${onClick}><${Icon} name="close" size=${22} stroke=${2.8} /></button>`;
}

export function PoldiButton({ title, icon, style = 'primary', size, disabled, onClick, staticButton }) {
  const cls = ['btn', 'pressable', style !== 'primary' ? style : '', size || '', staticButton ? 'static' : ''].join(' ');
  return html`<button class=${cls} disabled=${disabled} onClick=${onClick} tabindex=${staticButton ? -1 : 0}>
    ${icon && html`<${Icon} name=${icon} size=${size === 'small' ? 20 : 26} stroke=${2.8} />`}
    <span>${title}</span>
  </button>`;
}

export function FilterChip({ title, selected, onClick }) {
  return html`<button class=${'chip pressable' + (selected ? ' selected' : '')} aria-pressed=${selected} onClick=${onClick}>${title}</button>`;
}

export function StatusChip({ text, color, textColor = 'var(--on-primary)', minWidth = 45 }) {
  return html`<span class="status-chip" style=${{ background: color, color: textColor, minWidth: minWidth + 'px' }}>${text}</span>`;
}

/** Eingabefeld im Poldi-Stil – Kilometerstände (nur Ziffern, max. 6) und Textfelder. */
export function TextField({ label, value, onInput, placeholder = '', numeric = true, maxLength = 6, error, autoFocus, capitalize = 'off', onEnter }) {
  const ref = useRef(null);
  // Sofort fokussieren (noch im Tipp-Ereignis), sonst öffnet iOS die Tastatur nicht.
  useLayoutEffect(() => {
    if (autoFocus && ref.current) ref.current.focus({ preventScroll: true });
  }, []);
  const handle = (e) => {
    let v = e.currentTarget.value;
    if (numeric) v = v.replace(/\D/g, '');
    if (maxLength && v.length > maxLength) v = v.slice(0, maxLength);
    if (v !== e.currentTarget.value) e.currentTarget.value = v;
    onInput(v);
  };
  return html`<label class=${'field' + (error ? ' error' : '')}>
    <span class="field-label">${label}</span>
    <input ref=${ref} value=${value} placeholder=${placeholder} onInput=${handle}
      inputmode=${numeric ? 'numeric' : 'text'} pattern=${numeric ? '[0-9]*' : undefined}
      autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize=${capitalize}
      enterkeyhint="done" onKeyDown=${(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} />
    ${error && html`<span class="error-text">${error}</span>`}
  </label>`;
}

/**
 * Langes Drücken (0,5 s) wie onLongClickListener; ein normaler Tipp ruft onTap.
 * Bewegt sich der Finger, gilt es als Scrollen.
 */
export function usePress(onTap, onLongPress) {
  const state = useRef({ timer: null, x: 0, y: 0, long: false, active: false });
  const clear = () => {
    clearTimeout(state.current.timer);
    state.current.timer = null;
  };
  return {
    onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const s = state.current;
      s.x = e.clientX;
      s.y = e.clientY;
      s.long = false;
      s.active = true;
      clear();
      s.timer = setTimeout(() => {
        s.long = true;
        s.active = false;
        if (navigator.vibrate) navigator.vibrate(30);
        onLongPress && onLongPress();
      }, 500);
    },
    onPointerMove(e) {
      const s = state.current;
      if (s.active && (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10)) {
        s.active = false;
        clear();
      }
    },
    onPointerUp() {
      clear();
      state.current.active = false;
    },
    onPointerCancel() {
      clear();
      state.current.active = false;
    },
    onClick(e) {
      if (state.current.long) {
        state.current.long = false;
        e.preventDefault();
        return;
      }
      onTap && onTap(e);
    },
    onContextMenu(e) {
      e.preventDefault();
    },
  };
}
