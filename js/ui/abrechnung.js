import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import {
  S, setScreen, present, header, createdDate, setCreatedDate, currentRows, showSnackbar,
} from '../store.js';
import { Fmt, AbrechnungRows } from '../logic.js';
import { makePdf, checkBlankForm } from '../xfa.js';
import { loadBlankForm, saveBlankForm, pdfDeps, pickFile, shareOrDownload } from '../files.js';
import { TopBar, PoldiButton, FilterChip } from './common.js';

let blankCache; // undefined = noch nicht geladen, null = keins gespeichert

/**
 * Menüpunkt „Abrechnung (PDF)“: überträgt die Dienste eines Monats in das Fahrtenbuch-Formular
 * (AbrechnungActivity.kt). Regeln: siehe AbrechnungRows. Das leere Formular wählt jeder einmal
 * selbst aus; es liegt nur auf dem eigenen Gerät.
 */
export function AbrechnungView() {
  const months = [...new Set(S.shifts.map((s) => Fmt.dashMonthKey(s.date)).filter(Boolean))].sort().reverse();
  const [selected, setSelected] = useState(null);
  const [recreate, setRecreate] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [blank, setBlank] = useState(blankCache);

  useEffect(() => {
    if (blankCache === undefined) {
      loadBlankForm().then((b) => {
        blankCache = b;
        setBlank(b);
      });
    }
  }, []);

  // Standard: Vormonat (Abrechnung erfolgt nach Monatsende), sonst der neueste Monat.
  let month = selected && months.includes(selected) ? selected : null;
  if (!month && months.length) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    month = months.includes(key) ? key : months[0];
  }

  const chooseForm = async () => {
    const file = await pickFile('application/pdf,.pdf');
    if (!file) return null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await checkBlankForm(bytes, await pdfDeps());
      await saveBlankForm(bytes, file.name);
      blankCache = { bytes, name: file.name, savedAt: Date.now() };
      setBlank(blankCache);
      showSnackbar('Formular gespeichert');
      return blankCache;
    } catch (e) {
      present({ type: 'message', title: 'Formular passt nicht', text: e.message || String(e) });
      return null;
    }
  };

  const create = async (m) => {
    const h = header();
    if (!h.name || !h.personalnummer || !h.kennzeichen || !h.kostenstelle) {
      present({ type: 'personalData', onSaved: () => create(m) });
      return;
    }
    let form = blank || blankCache;
    if (!form) {
      present({
        type: 'message', title: 'Leeres Formular fehlt',
        text: 'Wähle einmal das leere Fahrtenbuch-Formular (PDF) aus. Es bleibt nur auf diesem Gerät gespeichert.',
        buttons: [['Formular wählen', async () => { form = await chooseForm(); if (form) create(m); }]],
      });
      return;
    }
    setCreating(true);
    try {
      const rows = currentRows(m);
      const bytes = await makePdf(form.bytes, rows, h, await pdfDeps());
      setCreatedDate(m);
      setRecreate((r) => { const n = new Set(r); n.delete(m); return n; });
      const filename = `Fahrtenbuch_${m}.pdf`;
      // Teilen braucht einen frischen Tipp, deshalb ein eigener Dialog.
      present({
        type: 'message', title: 'PDF erstellt',
        text: `${filename} ist fertig. Zum Öffnen in Adobe Acrobat Reader sichern oder per Mail senden.`,
        buttons: [['Teilen / Sichern', () => shareOrDownload(bytes, filename, 'application/pdf')]],
      });
    } catch (e) {
      present({ type: 'message', title: 'PDF konnte nicht erstellt werden', text: e.message || String(e) });
    } finally {
      setCreating(false);
    }
  };

  if (!months.length) {
    return html`<div class="screen">
      <${TopBar} title="Abrechnung" icon="back" label="Zurück" onAction=${() => setScreen('main')} />
      <div class="secondary" style=${{ fontSize: '18px', paddingTop: '40px', textAlign: 'center' }}>Noch keine beendeten Dienste</div>
    </div>`;
  }

  const monthShifts = AbrechnungRows.sortForForm(S.shifts.filter((s) => Fmt.dashMonthKey(s.date) === month));
  const incomplete = monthShifts.filter((s) => AbrechnungRows.problems(s).length > 0);
  const rows = AbrechnungRows.build(monthShifts.filter((s) => AbrechnungRows.problems(s).length === 0));
  const created = createdDate(month);
  const showCreated = created && !recreate.has(month);
  const canCreate = !creating && incomplete.length === 0 && rows.length > 0 && rows.length <= AbrechnungRows.maxRows;

  return html`<div class="screen">
    <${TopBar} title="Abrechnung" icon="back" label="Zurück" onAction=${() => setScreen('main')} />
    <main class=${'content' + (showCreated ? '' : ' with-bottombar')}>
      <div class="section mb10">Monat</div>
      <div class="chips">
        ${months.map((m) => html`<${FilterChip} title=${Fmt.monthTitleDash(m)} selected=${m === month} onClick=${() => setSelected(m)} />`)}
      </div>
      ${showCreated
    ? html`<div class="stack mt24" style=${{ gap: '12px' }}>
          <${PoldiButton} title=${`Abrechnung bereits erstellt am ${created}`} icon="check" style="start" staticButton />
          <${PoldiButton} title="Erneut erstellen" icon="refresh" onClick=${() => setRecreate((r) => new Set([...r, month]))} />
        </div>`
    : html`<${Details} month=${month} monthShifts=${monthShifts} incomplete=${incomplete} rows=${rows}
          blank=${blank} chooseForm=${chooseForm} />`}
    </main>
    ${!showCreated && html`<div class="bottombar lined"><div class="bottombar-inner">
      <${PoldiButton} style="start" icon=${incomplete.length ? null : 'doc'} disabled=${!canCreate}
        title=${creating ? 'PDF wird erstellt …' : (incomplete.length ? 'Erst fehlende Angaben nachtragen' : 'PDF erstellen')}
        onClick=${() => create(month)} />
    </div></div>`}
  </div>`;
}

function Details({ month, monthShifts, incomplete, rows, blank, chooseForm }) {
  const h = header();
  const dash = (v) => v || '–';
  const km = rows.reduce((sum, r) => sum + (r.kmEnd - r.kmStart), 0);
  const shiftCount = monthShifts.length - incomplete.length;
  let summary;
  if (!rows.length) summary = 'Noch kein vollständiger Dienst in diesem Monat.';
  else if (rows.length > AbrechnungRows.maxRows) summary = `${rows.length} Zeilen – das Formular hat nur ${AbrechnungRows.maxRows}.`;
  else summary = `${shiftCount} ${shiftCount === 1 ? 'Dienst' : 'Dienste'} · ${rows.length} von ${AbrechnungRows.maxRows} Zeilen · ${Fmt.km(km)} km · ${Fmt.euro(km * 0.30)} €`;

  return html`
    <div class="section mt24 mb10">Persönliche Daten</div>
    <button class="card info-card pressable" onClick=${() => present({ type: 'personalData' })}>
      <p>Name: ${dash(h.name)}<br />Personalnummer: ${dash(h.personalnummer)}<br />Kfz-Kennzeichen: ${dash(h.kennzeichen)}<br />Kostenstelle: ${dash(h.kostenstelle)}</p>
      <span class="link">Persönliche Daten eingeben</span>
    </button>

    <div class="section mt24 mb10">Formular</div>
    <button class="card info-card pressable" onClick=${chooseForm}>
      ${blank === undefined
    ? html`<p>Wird geladen …</p>`
    : blank
      ? html`<p>Leeres Fahrtenbuch-Formular gespeichert ✓<br /><span class="secondary">${blank.name}</span></p>
               <span class="link">Anderes Formular wählen</span>`
      : html`<p>Noch kein leeres Formular ausgewählt. Es wird nur auf diesem Gerät gespeichert.</p>
               <span class="link">Leeres Formular auswählen</span>`}
    </button>

    ${incomplete.length > 0 && html`
      <div class="section mt24 mb10">Fehlende Angaben</div>
      <div class="card" style=${{ overflow: 'hidden' }}>
        ${incomplete.map((s, i) => html`
          ${i > 0 && html`<div class="divider"></div>`}
          <button class="missing-row pressable" onClick=${() => present({ type: 'completeShift', shiftID: s.id })}
              aria-description="Zum Nachtragen tippen">
            <strong>${s.date} · Dienst ${s.label}</strong>
            <span>${AbrechnungRows.problemSummary(s)}</span>
          </button>`)}
      </div>`}

    <div class="section mt24 mb10">Vorschau Fahrtenbuch</div>
    ${rows.length > 0 && html`<div class="card" style=${{ overflow: 'hidden' }}>
      ${rows.map((r, i) => html`${i > 0 && html`<div class="divider"></div>`}<${PreviewRow} n=${i + 1} row=${r} />`)}
    </div>`}
    <div class="secondary mt10">${summary}</div>`;
}

function PreviewRow({ n, row }) {
  const ab = row.abUke ? 'ab UKE' : (row.abWohnung ? 'ab Wohnung' : null);
  const bis = row.bisUke ? 'bis UKE' : (row.bisWohnung ? 'bis Wohnung' : null);
  const head = [`${n}.`, row.date || 'Fortsetzung', ab, bis].filter(Boolean).join('  ');
  const km = `${Fmt.km(row.kmStart)} – ${Fmt.km(row.kmEnd)} km · ${Fmt.km(row.kmEnd - row.kmStart)} km${row.kunde ? ` · Kunde: ${row.kunde}` : ''}`;
  return html`<div class="preview-row">
    <strong>${head}</strong>
    <div>${row.fahrtziel || '–'}</div>
    <small>${km}</small>
  </div>`;
}
