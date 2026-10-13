import { html } from '../../vendor/preact-htm.js';

// Einfache Linien-Icons (24er Raster), Ersatz für die Material-Icons der Android-App.
const paths = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  back: 'M19 12H5M11 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  phone: 'M6.6 3.5h3l1.4 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.4v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z',
  pin: 'M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21zM12 12.3a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  share: 'M12 15V3M8 7l4-4 4 4M6 11H5v10h14V11h-1',
};

export function Icon({ name, size = 24, stroke = 2.4 }) {
  if (name === 'play') {
    return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>`;
  }
  if (name === 'stop') {
    return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor"/></svg>`;
  }
  if (name === 'car') {
    return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11l1.6-4.3A2 2 0 0 1 8.5 5.4h7a2 2 0 0 1 1.9 1.3L19 11v6.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V16.5h-7v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" fill="currentColor"/><circle cx="8" cy="13.4" r="1.4" fill="#fff"/><circle cx="16" cy="13.4" r="1.4" fill="#fff"/><path d="M7 10.6l1.1-3h7.8l1.1 3z" fill="#fff" opacity="0.85"/></svg>`;
  }
  if (name === 'clearCircle') {
    return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  if (name === 'grip') {
    const dots = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) dots.push(html`<circle cx=${3 + c * 11} cy=${3 + r * 10} r="3"/>`);
    return html`<svg class="icon" width="17" height="26" viewBox="0 0 17 26" fill="currentColor" aria-hidden="true">${dots}</svg>`;
  }
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width=${stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${paths[name]}/></svg>`;
}
