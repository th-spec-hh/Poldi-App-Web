import { html, useRef, useState } from '../../vendor/preact-htm.js';
import {
  S, activeShift, setDrawer, startShiftTapped, endActiveShiftTapped, addTaskTapped, openTask,
  taskLongPressed, markDone, moveTask, saveTasks,
} from '../store.js';
import { Fmt } from '../logic.js';
import { TopBar, PoldiButton, StatusChip, usePress } from './common.js';
import { Icon } from './icons.js';
import { InstallHint } from './install.js';

/** Hauptscreen „Poldi“: Dienstkarte, Einsatzorte, Aktionsleiste unten (Android: MainActivity). */
export function MainView() {
  const shift = activeShift();
  return html`<div class="screen">
    <${TopBar} title="Poldi" icon="menu" label="Menü öffnen" onAction=${() => setDrawer(true)} />
    <main class="content with-bottombar">
      <${InstallHint} />
      ${shift ? html`<${ShiftHeaderCard} shift=${shift} /><${TaskList} />` : html`<${EmptyShiftState} />`}
    </main>
    <div class=${'bottombar' + (shift ? ' lined' : '')}>
      <div class="bottombar-inner">
        ${shift
    ? html`<${PoldiButton} title="Einsatzort hinzufügen" icon="plus" size="big" onClick=${addTaskTapped} />`
    : html`<${PoldiButton} title="Dienst starten" icon="play" style="start" onClick=${startShiftTapped} />`}
      </div>
    </div>
  </div>`;
}

/** Dienstkarte oben in der Liste (item_shift_header.xml). */
function ShiftHeaderCard({ shift }) {
  const done = S.tasks.filter((t) => t.isDone).length;
  const open = S.tasks.length - done;
  return html`<div>
    <div class="card shift-card">
      <div class="active-label"><span class="dot"></span>Aktiver Dienst</div>
      <div class="shift-title"><h2>Dienst ${shift.label}</h2><span>${shift.date}</span></div>
      <div style=${{ paddingTop: '8px' }}>
        <${PoldiButton} title="Dienst beenden" icon="stop" style="danger" size="small" onClick=${endActiveShiftTapped} />
      </div>
    </div>
    <div class="list-head">
      <span class="section" role="heading" aria-level="2">Einsatzorte</span>
      <span class="secondary">${open} offen · ${done} erledigt</span>
    </div>
  </div>`;
}

function EmptyShiftState() {
  return html`<div class="empty-state">
    <div class="empty-icon"><${Icon} name="car" size=${44} /></div>
    <h2>Kein Dienst aktiv</h2>
  </div>`;
}

/**
 * Liste mit Drag & Drop über den Griff: Während des Ziehens rutscht der Eintrag an die Stelle,
 * über der der Finger steht; erledigte Einträge sind kein Ziel.
 */
function TaskList() {
  const listRef = useRef(null);
  const [draggingID, setDraggingID] = useState(null);

  const startDrag = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const pointerId = e.pointerId;
    setDraggingID(id);
    if (navigator.vibrate) navigator.vibrate(20);
    let lastY = e.clientY;
    let scrollTimer = null;

    const reorder = () => {
      const rows = [...listRef.current.querySelectorAll('[data-task]')];
      const from = S.tasks.findIndex((t) => t.id === id);
      for (let i = 0; i < rows.length; i++) {
        if (i === from || S.tasks[i]?.isDone) continue;
        const r = rows[i].getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if ((i < from && lastY < mid) || (i > from && lastY > mid)) {
          moveTask(id, i);
          break;
        }
      }
    };
    // Am Bildschirmrand weiterscrollen, damit lange Listen erreichbar bleiben.
    const autoScroll = () => {
      const edge = 90;
      const bottomLimit = window.innerHeight - 140;
      let dy = 0;
      if (lastY < edge) dy = -12;
      else if (lastY > bottomLimit) dy = 12;
      if (dy) {
        window.scrollBy(0, dy);
        reorder();
      }
    };
    scrollTimer = setInterval(autoScroll, 30);

    // Auf window lauschen: Beim Umsortieren wandert die Zeile im DOM, dabei ginge ein
    // Pointer-Capture am Griff verloren.
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      lastY = ev.clientY;
      reorder();
    };
    const end = (ev) => {
      if (ev.pointerId !== pointerId) return;
      clearInterval(scrollTimer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDraggingID(null);
      saveTasks();
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return html`<div class="task-list" ref=${listRef}>
    ${S.tasks.map((task) => html`<${TaskRow} key=${task.id} task=${task} dragging=${draggingID === task.id} onGrip=${startDrag} />`)}
  </div>`;
}

/** Einsatzort-Zeile (item_task.xml). */
function TaskRow({ task, dragging, onGrip }) {
  const press = usePress(() => openTask(task.id), () => taskLongPressed(task.id));
  const chipsBelow = task.hasBtm && task.hasAlk && task.hasVf;
  const chips = [
    task.hasBtm && html`<${StatusChip} text="BtM" color="var(--btm)" minWidth=${72} />`,
    task.hasAlk && html`<${StatusChip} text="Alk" color="var(--alk)" />`,
    task.hasVf && html`<${StatusChip} text="VF" color="var(--vf)" textColor="var(--on-vf)" />`,
  ].filter(Boolean);
  let subtitle;
  if (task.isDone) subtitle = `Erledigt ${Fmt.timeOf(task.completedAt)} Uhr`;
  else subtitle = `${Fmt.timeOf(task.addedAt)} Uhr${task.assignedBy ? ` · Auftrag ${task.assignedBy}` : ''}`;

  return html`<div data-task=${task.id} class=${'task row' + (task.isDone ? ' done' : '') + (dragging ? ' dragging' : '')}
      role="button" tabindex="0" aria-label=${`${task.title}, ${subtitle}`} ...${press}
      onKeyDown=${(e) => { if (e.key === 'Enter') openTask(task.id); }}>
    ${task.isDone
    ? html`<div style=${{ width: '32px', height: '56px', flex: 'none' }}></div>`
    : html`<div class="grip" aria-label="Zum Verschieben ziehen" onPointerDown=${(e) => onGrip(e, task.id)}
        onClick=${(e) => e.stopPropagation()}><${Icon} name="grip" /></div>`}
    <div class="task-main">
      <span class="task-title">${task.title}</span>
      <span class="task-sub">${subtitle}</span>
      ${chipsBelow && html`<div class="task-chips below">${chips}</div>`}
    </div>
    ${!chipsBelow && chips.length > 0 && html`<div class="task-chips">${chips}</div>`}
    ${task.isDone
    ? html`<div class="done-mark" aria-hidden="true"><${Icon} name="check" size=${24} stroke=${3} /></div>`
    : html`<button class="done-btn pressable" aria-label=${`${task.title} als erledigt markieren`}
        onPointerDown=${(e) => e.stopPropagation()}
        onClick=${(e) => { e.stopPropagation(); markDone(task.id); }}><${Icon} name="check" size=${26} stroke=${2.6} /></button>`}
  </div>`;
}
