// Reine Logik ohne Oberfläche: Formatierung, Datenmodell und Abrechnungsregeln.
// AbrechnungRows ist 1:1 aus AbrechnungRows.kt der Android-App übernommen (siehe Ausfüllregeln.md).

// ---------- Formatierung ----------

const pad2 = (n) => String(n).padStart(2, '0');

export const Fmt = {
  /** Zeitstempel wie auf Android: "HH:mm, dd.MM.yyyy". */
  timestamp(d = new Date()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}, ${Fmt.date(d)}`;
  },

  /** Datum "dd.MM.yyyy". */
  date(d = new Date()) {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  },

  /** Aus "HH:mm, dd.MM.yyyy" nur die Uhrzeit. */
  timeOf(timestamp) {
    return (timestamp || '').split(',')[0].trim();
  },

  /**
   * Zeiten für die Fahrtenbuch-Details: "20.10. 09.12 / 10.47" (eingetragen / erledigt),
   * an verschiedenen Tagen "20.10. 23.40 / 21.10. 00.15", bei Altdaten nur "20.10. 10.47".
   */
  visitTimes(visit) {
    const split = (ts) => {
      const parts = (ts || '').split(',').map((p) => p.trim());
      if (parts.length !== 2 || !parts[0] || parts[1].length < 6) return null;
      return { time: parts[0].replace(':', '.'), date: parts[1].slice(0, 6) };
    };
    const done = split(visit.timestamp);
    if (!done) return null;
    const added = split(visit.addedAt);
    if (!added) return `${done.date} ${done.time}`;
    return added.date === done.date
      ? `${added.date} ${added.time} / ${done.time}`
      : `${added.date} ${added.time} / ${done.date} ${done.time}`;
  },

  /** Tausendertrennung mit schmalem geschütztem Leerzeichen (U+202F), z. B. „123 456“. */
  km(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      const t = value.trim();
      return /^-?\d+$/.test(t) ? Fmt.km(Number(t)) : t;
    }
    const negative = value < 0;
    const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (negative ? '-' : '') + digits;
  },

  monthNames: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],

  /** "MM/yyyy" → "Oktober 2026" */
  monthTitleSlash(key) {
    const p = key.split('/');
    const m = Number(p[0]);
    return p.length === 2 && m >= 1 && m <= 12 ? `${Fmt.monthNames[m - 1]} ${p[1]}` : key;
  },

  /** "yyyy-MM" → "Oktober 2026" */
  monthTitleDash(key) {
    const p = key.split('-');
    const m = Number(p[1]);
    return p.length === 2 && m >= 1 && m <= 12 ? `${Fmt.monthNames[m - 1]} ${p[0]}` : key;
  },

  /** "dd.MM.yyyy" → "MM/yyyy" (Fahrtenbuch-Gruppen) */
  slashMonthKey(date) {
    const p = date.split('.');
    return p.length === 3 ? `${p[1]}/${p[2]}` : date;
  },

  /** "dd.MM.yyyy" → "yyyy-MM" (Abrechnung) */
  dashMonthKey(date) {
    const p = (date || '').split('.');
    if (p.length !== 3) return null;
    return `${p[2]}-${p[1].length === 1 ? '0' + p[1] : p[1]}`;
  },

  euro(value) {
    return value.toFixed(2).replace('.', ',');
  },
};

// ---------- Datenmodell ----------

export const ShiftPoint = { arbeit: 'Arbeit', wohnung: 'Wohnung', all: ['Arbeit', 'Wohnung'] };

export const shiftOptions = [
  { label: '00:00 - 04:00 Uhr', short: '0-4' },
  { label: '04:00 - 07:00 Uhr', short: '4-7' },
  { label: '07:00 - 13:00 Uhr', short: '7-13' },
  { label: '13:00 - 18:00 Uhr', short: '13-18' },
  { label: '18:00 - 00:00 Uhr', short: '18-0' },
];

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Einsatzort der aktuellen Liste (Android: Task.kt); `id` nur in der App, nicht im JSON. */
export function normalizeTask(t) {
  return {
    id: uuid(),
    title: String(t.title ?? ''),
    addedAt: String(t.addedAt ?? ''),
    hasBtm: !!t.hasBtm,
    hasAlk: !!t.hasAlk,
    hasVf: !!t.hasVf,
    assignedBy: t.assignedBy ?? null,
    isDone: !!t.isDone,
    completedAt: t.completedAt ?? null,
  };
}

export function taskToJson(t) {
  const { id, ...rest } = t;
  return rest;
}

/**
 * Dienst (Android: Shift.kt). Das JSON-Format entspricht ShiftStorage.kt. `autoEndAt` gibt es nur
 * hier und auf iOS: Ohne Hintergrund-Worker prüft die App beim Öffnen selbst, ob der Dienst
 * automatisch endet.
 */
export function normalizeShift(s) {
  const kmEnd = s.kmEnd ?? null;
  return {
    id: s.id ? String(s.id) : uuid(),
    label: String(s.label ?? ''),
    date: String(s.date ?? ''),
    kmStart: s.kmStart ?? null,
    kmEnd,
    // Altdaten ohne "isActive": wie auf Android gilt ein Dienst ohne End-km als offen.
    isActive: typeof s.isActive === 'boolean' ? s.isActive : kmEnd === null,
    autoEndPending: !!s.autoEndPending,
    endPointPending: !!s.endPointPending,
    startPoint: s.startPoint ?? null,
    visited: Array.isArray(s.visited)
      ? s.visited.map((v) => ({
        title: String(v.title ?? ''),
        timestamp: String(v.timestamp ?? ''),
        assignedBy: v.assignedBy ?? null,
        // Zeitpunkt des Eintragens (fehlt bei Altdaten und Start-/Endpunkt).
        addedAt: v.addedAt ?? null,
      }))
      : [],
    autoEndAt: typeof s.autoEndAt === 'number' ? s.autoEndAt : null,
  };
}

const number = (s) => {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return /^-?\d+$/.test(t) ? Number(t) : null;
};
export const parseKm = number;

/** Gefahrene km (Ende − Anfang), nur bei vollständigen und plausiblen Kilometerständen. */
export function drivenKm(shift) {
  const start = number(shift.kmStart);
  const end = number(shift.kmEnd);
  if (start === null || end === null || end < start) return null;
  return end - start;
}

// ---------- Orte ----------

export const LocationGroups = [
  { id: 'PK', label: 'PK' },
  { id: 'WSPK', label: 'WSPK' },
  { id: 'BP', label: 'BP' },
  { id: 'KLINIKEN', label: 'Kliniken' },
  { id: 'SONSTIGE', label: 'Sonstige' },
];

/** Kliniken, bei denen nach dem auftraggebenden Kommissariat gefragt wird. */
export const clinics = new Set([
  'UKE', 'AK Altona', 'AK Wandsbek', 'AK Nord', 'AK Barmbek', 'AK Harburg',
  'Marienkrankenhaus', 'Kinder UKE', 'AKK', 'Israelitisches KH', 'Agaplesion KH',
  'BWK', 'Albertinen KH', 'Schön Klinik Eilbek',
]);

export function groupOf(title) {
  if (title.startsWith('PK ')) return 'PK';
  if (title.startsWith('WSPK ')) return 'WSPK';
  if (title.startsWith('BP ')) return 'BP';
  if (clinics.has(title)) return 'KLINIKEN';
  return 'SONSTIGE';
}

export const isPoliceLocation = (t) => t.startsWith('PK ') || t.startsWith('WSPK ') || t.startsWith('BP ');

// ---------- Automatisches Dienstende ----------

/** Dienst 2 h nach dem regulären Schichtende automatisch schließen (ms seit 1970). */
export function autoEndTime(label, now = new Date()) {
  const endHours = { '0-4': 4, '4-7': 7, '7-13': 13, '13-18': 18, '18-0': 0 };
  if (!(label in endHours)) return now.getTime() + 2 * 3600 * 1000;
  const end = new Date(now);
  end.setHours(endHours[label], 0, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  return end.getTime() + 2 * 3600 * 1000;
}

/** Datum des Dienstes: Nachtdienst 0-4, um 23 Uhr gestartet, gehört zum Folgetag. */
export function shiftDate(label, now = new Date()) {
  const d = new Date(now);
  if (label === '0-4' && d.getHours() === 23) d.setDate(d.getDate() + 1);
  return Fmt.date(d);
}

// ---------- Abrechnung ----------

const kmReversedText = 'End-km kleiner als Start-km';

export const AbrechnungRows = {
  /** Zeilen pro Formular (das Formular summiert Zeile1[0] bis Zeile1[25]). */
  maxRows: 26,
  kunde: 'Poldi',
  // Spalte „Fahrtziel“: 129 pt bei Verdana 8 pt → gut 16 Geviert, etwas Luft lassen.
  maxLineEm: 15.8,

  /** Was einem Dienst für die Abrechnung noch fehlt (leer = vollständig). */
  problems(shift) {
    const list = [];
    if (shift.isActive) list.push('Dienst läuft noch');
    AbrechnungRows.missing(shift).forEach((m) => list.push(`${m} fehlt`));
    if (kmReversed(shift)) list.push(kmReversedText);
    return list;
  },

  /** Fehlende Angaben als kurze Namen, z. B. „Startpunkt“, „End-km“. */
  missing(shift) {
    const list = [];
    if (!ShiftPoint.all.includes(shift.startPoint ?? '')) list.push('Startpunkt');
    if (AbrechnungRows.endPoint(shift) === null) list.push('Endpunkt');
    if (number(shift.kmStart) === null) list.push('Start-km');
    if (number(shift.kmEnd) === null) list.push('End-km');
    return list;
  },

  /** Anzeigetext, z. B. „Fehlt: Startpunkt, Endpunkt“ (leer = vollständig). */
  problemSummary(shift) {
    const parts = [];
    if (shift.isActive) parts.push('Dienst läuft noch');
    const m = AbrechnungRows.missing(shift);
    if (m.length) parts.push('Fehlt: ' + m.join(', '));
    if (kmReversed(shift)) parts.push(kmReversedText);
    return parts.join(' · ');
  },

  /** „Arbeit“/„Wohnung“, wenn der letzte Eintrag des Dienstes ein Endpunkt ist. */
  endPoint(shift) {
    const last = shift.visited.length ? shift.visited[shift.visited.length - 1].title.trim() : null;
    return last !== null && ShiftPoint.all.includes(last) ? last : null;
  },

  /** Dienste eines Monats in Formularzeilen umwandeln. Alle Dienste müssen vollständig sein. */
  build(shifts) {
    return AbrechnungRows.sortForForm(shifts).flatMap((s) => AbrechnungRows.rowsForShift(s));
  },

  sortForForm(shifts) {
    // Array.prototype.sort ist stabil, wie Kotlins sortedWith.
    return [...shifts].sort((a, b) => {
      const ka = dateSortKey(a.date);
      const kb = dateSortKey(b.date);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return labelStartHour(a.label) - labelStartHour(b.label);
    });
  },

  rowsForShift(shift) {
    const kmStart = number(shift.kmStart) ?? 0;
    const kmEnd = number(shift.kmEnd) ?? 0;
    const start = shift.startPoint;
    const end = AbrechnungRows.endPoint(shift);

    // Endpunkt ist der letzte Eintrag und wird über das „bis“-Kreuz abgebildet.
    const stops = shift.visited.slice(0, -1).map((v) => AbrechnungRows.abbreviate(v.title)).filter((s) => s);
    const lines = AbrechnungRows.wrap(stops);

    const totalStops = Math.max(stops.length, 1);
    let stopsBefore = 0;
    let lineStartKm = kmStart;
    const rows = [];
    lines.forEach((line, index) => {
      const first = index === 0;
      const last = index === lines.length - 1;
      stopsBefore += line.length;
      // km anteilig nach Anzahl der Orte teilen, letzte Zeile endet exakt bei kmEnd.
      const lineEndKm = last ? kmEnd : kmStart + Math.round((kmEnd - kmStart) * stopsBefore / totalStops);
      rows.push({
        date: first ? shift.date : null,
        abUke: first && start === ShiftPoint.arbeit,
        abWohnung: first && start === ShiftPoint.wohnung,
        bisUke: last && end === ShiftPoint.arbeit,
        bisWohnung: last && end === ShiftPoint.wohnung,
        fahrtziel: line.join(', ') + (last ? '' : ','),
        kunde: first ? AbrechnungRows.kunde : '',
        kmStart: lineStartKm,
        kmEnd: lineEndKm,
      });
      lineStartKm = lineEndKm;
    });
    return rows;
  },

  /** Orte zeilenweise verteilen; getrennt wird nur zwischen zwei Orten. */
  wrap(stops) {
    if (!stops.length) return [[]];
    const lines = [];
    let current = [];
    for (const stop of stops) {
      const candidate = [...current, stop];
      // Eine Zeile, die weitergeht, endet mit Komma; das muss mit hineinpassen.
      if (current.length && AbrechnungRows.textWidthEm(candidate.join(', ') + ',') > AbrechnungRows.maxLineEm) {
        lines.push(current);
        current = [stop];
      } else {
        current.push(stop);
      }
    }
    lines.push(current);
    return lines;
  },

  /** Kürzel für die Spalte „Fahrtziel“ (von Tobias festgelegt, 11.10.2026). */
  abbreviate(title) {
    const t = title.trim();
    if (abbreviations[t]) return abbreviations[t];
    if (t.startsWith('PK ')) return t.slice(3).trim();
    return t;
  },

  /** Ungefähre Textbreite in Verdana (Geviert), reicht für die Umbruchentscheidung. */
  textWidthEm(text) {
    let sum = 0;
    for (const c of text) {
      let w;
      if (/\p{Nd}/u.test(c)) w = 0.636;
      else if (c === ' ') w = 0.352;
      else if (c === ',' || c === '.') w = 0.364;
      else if (c === '-') w = 0.431;
      else if (c === 'I') w = 0.421;
      else if (c === 'J') w = 0.455;
      else if (c === 'M' || c === 'W') w = 0.863;
      else if (c !== c.toLowerCase()) w = 0.70;
      else if (c === 'i' || c === 'l' || c === 'j') w = 0.274;
      else if (c === 'f' || c === 't' || c === 'r') w = 0.40;
      else if (c === 'm' || c === 'w') w = 0.85;
      else if (c !== c.toUpperCase()) w = 0.59;
      else w = 0.6;
      sum += w;
    }
    return sum;
  },
};

function kmReversed(shift) {
  const start = number(shift.kmStart);
  const end = number(shift.kmEnd);
  return start !== null && end !== null && end < start;
}

const abbreviations = {
  Arbeit: 'UKE',
  Wohnung: 'Whg',
  'BP Hauptbahnhof': 'BP Hbf',
  'BP Altona': 'BP Alt.',
  'BP Flughafen': 'BP Flgh.',
  'BP Harburg': 'BP Har',
  'Kinder UKE': 'KiUKE',
  'Agaplesion KH': 'Agap. KH',
  'Albertinen KH': 'Alb. KH',
  'AK Altona': 'AK Alt.',
  'AK Wandsbek': 'AK W.',
  'AK Nord': 'AK N.',
  'AK Barmbek': 'AK B.',
  'AK Harburg': 'AK H.',
  Marienkrankenhaus: 'Mar. KH',
  'Schön Klinik Eilbek': 'Eilb. KH',
  'Israelitisches KH': 'Isr. KH',
  'IfR - Butenfeld': 'IfR',
};

function dateSortKey(date) {
  const p = date.split('.');
  if (p.length !== 3) return date;
  return p[2] + p[1].padStart(2, '0') + p[0].padStart(2, '0');
}

function labelStartHour(label) {
  const t = label.split('-')[0].trim();
  return /^\d+$/.test(t) ? Number(t) : 0;
}
