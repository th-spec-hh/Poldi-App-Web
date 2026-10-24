// Gesamter App-Zustand und Geschäftslogik (Android: MainActivity, FahrtenbuchActivity,
// AbrechnungActivity, ShiftAutoEndWorker). Ein Store für alle Screens; nach jeder Änderung
// ruft er changed() auf, die Oberfläche zeichnet sich dann neu.
import {
  Fmt, ShiftPoint, AbrechnungRows, normalizeTask, normalizeShift, taskToJson, uuid,
  clinics, isPoliceLocation, autoEndTime, shiftDate, parseKm,
} from './logic.js';

export const APP_VERSION = '2.2.3';

const ls = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* Speicher voll oder gesperrt */ }
  },
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed() {
  listeners.forEach((fn) => fn());
}

export const S = {
  tasks: [],
  shifts: [],
  locations: [],
  screen: 'main', // main | fahrtenbuch | abrechnung
  drawerOpen: false,
  dialogs: [],
  snackbar: null,
  detailTaskID: null,
  picker: null, // { id, title, titles, onSelected }
};

let autoEndDialogShown = false;
let snackbarTimer = null;

// ---------- Laden / Speichern ----------

export async function init() {
  loadTasks();
  loadShifts();
  try {
    const res = await fetch('poldi_locations.json');
    const list = await res.json();
    S.locations = list.filter((l) => (l.title || '').trim()).map((l) => ({
      title: l.title, phone: l.phone || '', address: l.address || '',
      latitude: typeof l.latitude === 'number' ? l.latitude : null,
      longitude: typeof l.longitude === 'number' ? l.longitude : null,
    }));
  } catch {
    S.locations = [];
  }
  changed();
}

function loadTasks() {
  try {
    S.tasks = JSON.parse(ls.get('tasks') || '[]').map(normalizeTask);
  } catch {
    S.tasks = [];
  }
}

export function saveTasks() {
  ls.set('tasks', JSON.stringify(S.tasks.map(taskToJson)));
}

function loadShifts() {
  try {
    S.shifts = JSON.parse(ls.get('shifts') || '[]').map(normalizeShift);
  } catch {
    S.shifts = [];
  }
}

export function saveShifts() {
  ls.set('shifts', JSON.stringify(S.shifts));
}

export const getString = (key) => ls.get(key) || '';
export const setString = (key, value) => ls.set(key, value);

export const activeShift = () => S.shifts.find((s) => s.isActive) || null;
const activeShiftIndex = () => S.shifts.findIndex((s) => s.isActive);
export const findShift = (id) => S.shifts.find((s) => s.id === id) || null;
export const location = (title) => (title ? S.locations.find((l) => l.title === title) || null : null);

// ---------- Navigation, Dialoge, Snackbar ----------

export function setScreen(screen) {
  S.screen = screen;
  S.drawerOpen = false;
  changed();
  window.scrollTo(0, 0);
}

export function setDrawer(open) {
  S.drawerOpen = open;
  changed();
}

export function present(dialog) {
  S.dialogs = [...S.dialogs, { ...dialog, key: uuid() }];
  changed();
}

export function dismiss(dialog) {
  S.dialogs = S.dialogs.filter((d) => d.key !== dialog.key);
  changed();
}

export function showSnackbar(message, actionLabel = null, action = null) {
  const item = { id: uuid(), message, actionLabel, action };
  S.snackbar = item;
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => {
    if (S.snackbar && S.snackbar.id === item.id) {
      S.snackbar = null;
      changed();
    }
  }, 4000);
  changed();
}

export function snackbarAction() {
  const item = S.snackbar;
  S.snackbar = null;
  changed();
  if (item && item.action) item.action();
}

export function openTask(id) {
  S.detailTaskID = id;
  changed();
}

export function closeTask() {
  S.detailTaskID = null;
  changed();
}

export function closePicker() {
  S.picker = null;
  changed();
}

// ---------- Dienst starten ----------

export function startShiftTapped() {
  if (activeShift()) return;
  present({
    type: 'shiftSelection',
    onSelect: (short) => present({
      type: 'point', title: 'Startpunkt?', closable: true,
      onSelect: (startPoint) => present({
        type: 'km', title: 'Kilometerstand',
        onConfirm: (km) => startNewShift(short, startPoint, km),
        onSkip: () => startNewShift(short, startPoint, null),
      }),
    }),
  });
}

function startNewShift(label, startPoint, kmStart) {
  const shift = normalizeShift({
    id: uuid(), label, date: shiftDate(label), kmStart, isActive: true, startPoint, visited: [],
  });
  shift.autoEndAt = autoEndTime(label);
  S.shifts = [...S.shifts, shift];
  saveShifts();
  changed();
}

// ---------- Dienst beenden ----------

export function endActiveShiftTapped() {
  const shift = activeShift();
  if (!shift) return;
  // Wie beim Start: erst Endpunkt (Pflicht, ✕ bricht das Beenden ab), dann Kilometerstand.
  present({
    type: 'point', title: 'Endpunkt?', closable: true,
    onSelect: (endPoint) => present({
      type: 'km', title: 'Kilometerstand (Ende)',
      onConfirm: (km) => finishShift(shift.id, km, endPoint),
      onSkip: () => finishShift(shift.id, null, endPoint),
    }),
  });
}

/**
 * Endpunkt („Arbeit“/„Wohnung“) als letzten Eintrag setzen – so lesen ihn Fahrtenbuch und
 * Abrechnung. Ist der letzte Eintrag schon genau dieser Ort, wird er nicht doppelt angehängt.
 */
function applyEndPoint(shift, endPoint) {
  const last = shift.visited[shift.visited.length - 1];
  if (!last || last.title.trim() !== endPoint) {
    shift.visited.push({ title: endPoint, timestamp: Fmt.timestamp(), assignedBy: null });
  }
  shift.endPointPending = false;
}

function finishShift(id, km, endPoint) {
  const shift = findShift(id);
  if (!shift) return;
  applyEndPoint(shift, endPoint);
  shift.kmEnd = km;
  shift.isActive = false;
  shift.autoEndPending = false;
  shift.autoEndAt = null;
  saveShifts();
  S.tasks = [];
  saveTasks();
  showSnackbar('Dienst beendet');
}

// ---------- Automatisches Dienstende ----------

/**
 * Ersetzt den Android-Worker: Beim Öffnen (und regelmäßig im Vordergrund) prüfen, ob ein
 * vergessener Dienst automatisch endet, und danach dieselben Pflicht-Dialoge zeigen.
 */
export function checkAutoEnd() {
  const now = Date.now();
  let didChange = false;
  for (const s of S.shifts) {
    if (s.isActive && s.autoEndAt !== null && now >= s.autoEndAt) {
      s.isActive = false;
      s.autoEndPending = true;
      s.endPointPending = true;
      s.autoEndAt = null;
      didChange = true;
    }
  }
  if (didChange) saveShifts();
  handleAutoEndedShift();
  if (didChange) changed();
}

// Nach einem automatischen Dienstende dasselbe nachholen, was beim manuellen Beenden passiert:
// Einsatzliste leeren, nach dem Endpunkt und dann nach dem End-Kilometerstand fragen.
function handleAutoEndedShift() {
  if (activeShift()) return;

  // Einsatzorte gibt es nur während eines aktiven Dienstes.
  if (S.tasks.length) {
    S.tasks = [];
    saveTasks();
    changed();
  }

  if (autoEndDialogShown) return;

  // Endpunkt ist Pflicht und lässt sich nicht überspringen (kein ✕). Das Flag ist gespeichert,
  // also kommt der Dialog nach einem Neustart der App wieder.
  const pending = [...S.shifts].reverse().find((s) => s.endPointPending);
  if (pending) {
    autoEndDialogShown = true;
    S.detailTaskID = null;
    S.picker = null;
    present({
      type: 'point', title: 'Endpunkt?', closable: false,
      onSelect: (endPoint) => {
        const s = findShift(pending.id);
        if (s) {
          applyEndPoint(s, endPoint);
          saveShifts();
        }
        autoEndDialogShown = false;
        // Weiter mit dem End-Kilometerstand.
        handleAutoEndedShift();
        changed();
      },
    });
    return;
  }

  const shift = [...S.shifts].reverse().find((s) => s.autoEndPending);
  if (!shift) return;
  if (shift.kmEnd !== null) {
    // Bereits im Fahrtenbuch nachgetragen.
    shift.autoEndPending = false;
    saveShifts();
    return;
  }
  autoEndDialogShown = true;
  present({
    type: 'km',
    title: 'Kilometerstand (Ende)',
    message: `Dienst ${shift.label} vom ${shift.date} wurde automatisch beendet.`,
    closable: false,
    onConfirm: (km) => confirmAutoEndedShift(shift.id, km),
    onSkip: () => confirmAutoEndedShift(shift.id, null),
    onDismiss: () => { autoEndDialogShown = false; },
  });
}

function confirmAutoEndedShift(id, km) {
  autoEndDialogShown = false;
  const s = findShift(id);
  if (!s) return;
  s.kmEnd = km;
  s.autoEndPending = false;
  saveShifts();
  changed();
}

// ---------- Einsatzorte ----------

export function addTaskTapped() {
  if (!activeShift()) return;
  S.picker = {
    id: uuid(),
    title: 'Ziel wählen',
    titles: S.locations.map((l) => l.title),
    onSelected: (selected) => {
      if (clinics.has(selected)) {
        S.picker = {
          id: uuid(),
          title: 'Im Auftrag von?',
          titles: S.locations.map((l) => l.title).filter(isPoliceLocation),
          onSelected: (assignedBy) => {
            S.picker = null;
            addTask(selected, assignedBy);
          },
        };
        changed();
      } else {
        S.picker = null;
        addTask(selected, null);
      }
    },
  };
  changed();
}

const firstDoneIndex = () => {
  const i = S.tasks.findIndex((t) => t.isDone);
  return i < 0 ? S.tasks.length : i;
};

function addTask(title, assignedBy) {
  // Der Dienst kann automatisch beendet worden sein, während die Auswahl offen war.
  if (!activeShift()) {
    showSnackbar('Kein aktiver Dienst mehr. Bitte starte einen neuen Dienst.');
    return;
  }
  const task = normalizeTask({ title, addedAt: Fmt.timestamp(), assignedBy });
  const tasks = [...S.tasks];
  tasks.splice(firstDoneIndex(), 0, task);
  S.tasks = tasks;
  saveTasks();
  changed();
}

export function markDone(id) {
  const pos = S.tasks.findIndex((t) => t.id === id);
  if (pos < 0) return;
  const timestamp = Fmt.timestamp();
  const shift = activeShift();
  if (shift) {
    shift.visited.push({
      title: S.tasks[pos].title, timestamp, assignedBy: S.tasks[pos].assignedBy,
      addedAt: S.tasks[pos].addedAt || null,
    });
    saveShifts();
  }
  const tasks = [...S.tasks];
  const [task] = tasks.splice(pos, 1);
  tasks.push({ ...task, isDone: true, completedAt: timestamp });
  S.tasks = tasks;
  saveTasks();
  changed();
}

export function taskLongPressed(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.isDone) {
    present({
      type: 'menu', title: task.title, options: ['Wieder aktivieren', 'Löschen'],
      onSelect: (which) => (which === 0 ? reactivate(id) : confirmDelete(id)),
    });
  } else {
    confirmDelete(id);
  }
}

const visitIndex = (task, shift) => shift.visited.findIndex((v) =>
  v.title === task.title && (v.assignedBy ?? null) === (task.assignedBy ?? null) && v.timestamp === task.completedAt);

function reactivate(id) {
  const pos = S.tasks.findIndex((t) => t.id === id);
  if (pos < 0) return;
  const shift = activeShift();
  if (shift) {
    const v = visitIndex(S.tasks[pos], shift);
    if (v >= 0) {
      shift.visited.splice(v, 1);
      saveShifts();
    }
  }
  const tasks = [...S.tasks];
  const [task] = tasks.splice(pos, 1);
  S.tasks = tasks;
  S.tasks.splice(firstDoneIndex(), 0, { ...task, isDone: false, completedAt: null });
  saveTasks();
  showSnackbar('Eintrag wieder aktiviert');
}

function confirmDelete(id) {
  const task = S.tasks.find((t) => t.id === id);
  if (!task) return;
  const message = task.isDone
    ? `Möchtest du "${task.title}" wirklich löschen?\n\nDer zugehörige Fahrtenbuch-Eintrag für diesen Dienst wird dabei ebenfalls entfernt.`
    : `Möchtest du "${task.title}" wirklich löschen?`;
  present({
    type: 'confirm', title: 'Eintrag löschen', message, confirmLabel: 'Löschen',
    onConfirm: () => deleteTask(id),
  });
}

function deleteTask(id) {
  const pos = S.tasks.findIndex((t) => t.id === id);
  if (pos < 0) return;
  const task = S.tasks[pos];
  // Für „Rückgängig“ merken, wo Eintrag und Fahrtenbuch-Besuch standen.
  const shift = activeShift();
  const shiftID = shift ? shift.id : null;
  let removedVisit = null;
  let removedVisitIndex = -1;
  if (task.isDone && shift) {
    const v = visitIndex(task, shift);
    if (v >= 0) {
      [removedVisit] = shift.visited.splice(v, 1);
      removedVisitIndex = v;
      saveShifts();
    }
  }
  S.tasks = S.tasks.filter((t) => t.id !== id);
  saveTasks();

  showSnackbar('Eintrag gelöscht', 'Rückgängig', () => {
    const s = activeShift();
    if (!s || s.id !== shiftID) return;
    if (removedVisit) {
      s.visited.splice(Math.min(removedVisitIndex, s.visited.length), 0, removedVisit);
      saveShifts();
    }
    const tasks = [...S.tasks];
    tasks.splice(Math.min(pos, tasks.length), 0, task);
    S.tasks = tasks;
    saveTasks();
    changed();
  });
}

export function toggle(id, key) {
  S.tasks = S.tasks.map((t) => (t.id === id ? { ...t, [key]: !t[key] } : t));
  saveTasks();
  changed();
}

/** Drag & Drop über den Griff: nur offene Einträge, nie hinter einen erledigten. */
export function moveTask(id, toIndex) {
  const from = S.tasks.findIndex((t) => t.id === id);
  if (from < 0 || from === toIndex || S.tasks[from].isDone) return;
  const target = S.tasks[toIndex];
  if (!target || target.isDone) return;
  const tasks = [...S.tasks];
  const [task] = tasks.splice(from, 1);
  tasks.splice(toIndex, 0, task);
  S.tasks = tasks;
  changed();
}

// ---------- Fahrtenbuch / Nachtragen ----------

export function updateShift(id, change) {
  const s = findShift(id);
  if (!s) return;
  change(s);
  saveShifts();
  changed();
}

export function setKm(id, start, end) {
  updateShift(id, (shift) => {
    shift.kmStart = start || null;
    shift.kmEnd = end || null;
    if (end) {
      // Ein End-km schließt den Dienst ab, damit ein vergessener Dienst nicht wieder
      // als „aktiv“ gilt (siehe isActive-Migration).
      shift.isActive = false;
      shift.autoEndPending = false;
      shift.autoEndAt = null;
    }
  });
  // Einsatzorte gibt es nur während eines aktiven Dienstes.
  if (!activeShift() && S.tasks.length) {
    S.tasks = [];
    saveTasks();
    changed();
  }
}

export function addEndpoint(id, text) {
  updateShift(id, (s) => s.visited.push({ title: text, timestamp: Fmt.timestamp(), assignedBy: null }));
}

// Langes Drücken im Fahrtenbuch: direkt „Dienst löschen?“ (Nachtragen per Tipp bzw. in der Abrechnung).
export function shiftLongPressed(id) {
  confirmDeleteShift(id);
}

function confirmDeleteShift(id) {
  const shift = findShift(id);
  if (!shift) return;
  present({
    type: 'confirm',
    title: 'Dienst löschen',
    message: `Möchtest du den Dienst "${shift.label}" vom ${shift.date} wirklich löschen?\n\nKilometerstände und alle angefahrenen Wachen/Orte dieses Dienstes werden dabei entfernt.`,
    confirmLabel: 'Löschen',
    onConfirm: () => deleteShift(id),
  });
}

export const hooks = { onShiftRestored: null };

function deleteShift(id) {
  const index = S.shifts.findIndex((s) => s.id === id);
  if (index < 0) return;
  const shift = S.shifts[index];
  S.shifts = S.shifts.filter((s) => s.id !== id);
  saveShifts();
  showSnackbar('Dienst gelöscht', 'Rückgängig', () => {
    const shifts = [...S.shifts];
    shifts.splice(Math.min(index, shifts.length), 0, shift);
    S.shifts = shifts;
    saveShifts();
    if (hooks.onShiftRestored) hooks.onShiftRestored(shift);
    changed();
  });
}

// ---------- Abrechnung ----------

export function header() {
  return {
    name: getString('pdf_name'),
    personalnummer: getString('pdf_personalnummer'),
    kennzeichen: getString('pdf_kennzeichen'),
    kostenstelle: getString('pdf_kostenstelle'),
  };
}

export const createdDate = (month) => ls.get(`abrechnung_created_${month}`);
export function setCreatedDate(month) {
  ls.set(`abrechnung_created_${month}`, Fmt.date());
  changed();
}

export function currentRows(month) {
  const monthShifts = S.shifts.filter((s) => Fmt.dashMonthKey(s.date) === month);
  return AbrechnungRows.build(monthShifts.filter((s) => AbrechnungRows.problems(s).length === 0));
}

export { changed as notify, parseKm, ShiftPoint };

// ---------- Datensicherung ----------

const BACKUP_KEYS = ['pdf_name', 'pdf_personalnummer', 'pdf_kennzeichen', 'pdf_kostenstelle'];

export function exportBackup() {
  const settings = {};
  for (const key of BACKUP_KEYS) settings[key] = getString(key);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('abrechnung_created_')) settings[key] = ls.get(key);
    }
  } catch { /* ohne Zugriff nur die bekannten Schlüssel */ }
  return JSON.stringify({
    app: 'Poldi', version: APP_VERSION, exportedAt: new Date().toISOString(),
    tasks: S.tasks.map(taskToJson), shifts: S.shifts, settings,
  }, null, 1);
}

/** Liest eine Sicherung (auch nur {shifts:[...]} oder ein reines Dienst-Array von Android). */
export function importBackup(text) {
  const data = JSON.parse(text);
  const shifts = Array.isArray(data) ? data : data.shifts;
  if (!Array.isArray(shifts)) throw new Error('Keine Dienste in der Datei gefunden.');
  S.shifts = shifts.map(normalizeShift);
  S.tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
  if (data.settings && typeof data.settings === 'object') {
    for (const [key, value] of Object.entries(data.settings)) {
      if (BACKUP_KEYS.includes(key) || key.startsWith('abrechnung_created_')) ls.set(key, String(value ?? ''));
    }
  }
  if (!activeShift()) S.tasks = [];
  saveShifts();
  saveTasks();
  changed();
  return S.shifts.length;
}
