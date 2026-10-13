// Befüllt das XFA-Formular „Fahrtenbuch“ (Reisekostenantrag, Seite2) – Port von
// AbrechnungXfa.kt und AbrechnungPdf.kt der Android-App.
//
// Die Tabellenfelder sind im Formular ungebunden (bind="none"), Daten aus dem datasets-Paket
// kommen dort nicht an. Deshalb werden die Werte als Startwerte (<value>) direkt in die
// Vorlage (template) geschrieben; nur das Datum ist gebunden und kommt in die datasets.
// Strecke, Gesamt-km und Erstattung rechnet Adobe beim Öffnen selbst.
//
// Abhängigkeiten werden übergeben (Browser: window.PDFLib und DOMParser, Tests: Node-Pakete).

const ELEMENT_NODE = 1;

function nameOf(node) {
  return node.localName || String(node.nodeName).split(':').pop();
}

function childElements(parent, localName) {
  const result = [];
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === ELEMENT_NODE && nameOf(n) === localName) result.push(n);
  }
  return result;
}

function descendants(parent, localName) {
  const result = [];
  const walk = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === ELEMENT_NODE) {
        if (nameOf(c) === localName) result.push(c);
        walk(c);
      }
    }
  };
  walk(parent);
  return result;
}

function setValue(field, kind, value) {
  childElements(field, 'value').forEach((v) => field.removeChild(v));
  const doc = field.ownerDocument;
  const ns = field.namespaceURI;
  const valueEl = doc.createElementNS(ns, 'value');
  const typed = doc.createElementNS(ns, kind);
  typed.appendChild(doc.createTextNode(value));
  valueEl.appendChild(typed);
  field.appendChild(valueEl);
}

const textContent = (el) => (el.textContent || '').trim();

export function fillTemplate(xml, rows, header, { DOMParser, XMLSerializer }) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Formular: Vorlage nicht lesbar');
  const seite2 = descendants(doc.documentElement, 'subform').find((s) => s.getAttribute('name') === 'Seite2');
  if (!seite2) throw new Error('Formular: Seite2 nicht gefunden. Ist das das richtige leere Formular?');

  const headerValues = {
    'Name des Fahrers:': header.name,
    'Personalnummer:': header.personalnummer,
    'Kfz-Kennzeichen:': header.kennzeichen,
    'Kostenstelle:': header.kostenstelle,
  };
  for (const field of descendants(seite2, 'field')) {
    const caption = childElements(field, 'caption')[0];
    if (!caption) continue;
    const value = headerValues[textContent(caption)];
    if (value && value.trim()) setValue(field, 'text', value);
  }

  const tabelle = descendants(seite2, 'subform').find((s) => s.getAttribute('name') === 'Tabelle1');
  if (!tabelle) throw new Error('Formular: Tabelle1 nicht gefunden');
  const zeilen = childElements(tabelle, 'subform').filter((z) => z.getAttribute('name') === 'Zeile1');
  if (rows.length > zeilen.length) throw new Error(`Zu viele Zeilen: ${rows.length} (Formular hat ${zeilen.length})`);

  rows.forEach((row, index) => {
    // Reihenfolge der Felder je Zeile: Datum, ab UKE, ab Wohnung, bis UKE, bis Wohnung,
    // Fahrtziel, Grund der Fahrt, besuchter Kunde, Beginn km, Ende km, Strecke (berechnet).
    const fields = childElements(zeilen[index], 'field');
    if (fields.length < 10) throw new Error('Formular: unerwarteter Zeilenaufbau');
    [row.abUke, row.abWohnung, row.bisUke, row.bisWohnung].forEach((checked, i) => {
      setValue(fields[1 + i], 'integer', checked ? '1' : '0');
    });
    if (row.fahrtziel) setValue(fields[5], 'text', row.fahrtziel);
    if (row.kunde) setValue(fields[7], 'text', row.kunde);
    setValue(fields[8], 'float', String(row.kmStart));
    setValue(fields[9], 'float', String(row.kmEnd));
  });
  return new XMLSerializer().serializeToString(doc);
}

const DATE_NODE = /<DatumsUhrzeitfeld2\s*(?:\/>|>[^<]*<\/DatumsUhrzeitfeld2\s*>)/g;
const escapeXml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Datum ist das einzige gebundene Zeilenfeld; die Datumsknoten stehen in Dokumentreihenfolge. */
export function fillDatasets(xml, rows) {
  let index = 0;
  return xml.replace(DATE_NODE, (match) => {
    const row = rows[index++];
    if (!row) return match;
    return `<DatumsUhrzeitfeld2>${escapeXml(row.date || '')}</DatumsUhrzeitfeld2>`;
  });
}

function xfaArray(pdfDoc, PDFLib) {
  const { PDFName, PDFArray } = PDFLib;
  const acroForm = pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFLib.PDFDict);
  const xfa = acroForm && acroForm.lookupMaybe(PDFName.of('XFA'), PDFArray);
  if (!xfa) throw new Error('Das gewählte PDF enthält kein XFA-Formular. Bitte das leere Fahrtenbuch-Formular wählen.');
  return xfa;
}

function packetName(obj, PDFLib) {
  if (obj instanceof PDFLib.PDFString || obj instanceof PDFLib.PDFHexString) return obj.decodeText();
  return null;
}

function readStream(stream, PDFLib) {
  const bytes = PDFLib.decodePDFRawStream(stream).decode();
  return new TextDecoder('utf-8').decode(bytes);
}

/** Prüft, ob ein PDF das passende leere Formular ist (beim Auswählen in der App). */
export async function checkBlankForm(bytes, deps) {
  const { PDFLib } = deps;
  const pdfDoc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const xfa = xfaArray(pdfDoc, PDFLib);
  for (let i = 0; i + 1 < xfa.size(); i += 2) {
    if (packetName(xfa.get(i), PDFLib) !== 'template') continue;
    const stream = xfa.lookup(i + 1);
    const xml = readStream(stream, PDFLib);
    // Wirft, wenn Seite2/Tabelle1 fehlen.
    fillTemplate(xml, [], { name: '', personalnummer: '', kennzeichen: '', kostenstelle: '' }, deps);
    return true;
  }
  throw new Error('Das gewählte PDF enthält keine Formularvorlage.');
}

/** Schreibt die Abrechnungszeilen in das leere Formular und gibt das neue PDF zurück. */
export async function makePdf(blankBytes, rows, header, deps) {
  const { PDFLib } = deps;
  const { PDFName } = PDFLib;
  const pdfDoc = await PDFLib.PDFDocument.load(blankBytes, { updateMetadata: false, ignoreEncryption: true });
  const context = pdfDoc.context;
  const xfa = xfaArray(pdfDoc, PDFLib);

  // Paare aus Paketname und Stream: [xdp:xdp, ..., template, ..., datasets, ..., form, ...]
  let i = 0;
  let sawTemplate = false;
  while (i + 1 < xfa.size()) {
    const name = packetName(xfa.get(i), PDFLib);
    const ref = xfa.get(i + 1);
    if (name === 'template' || name === 'datasets') {
      const xml = readStream(xfa.lookup(i + 1), PDFLib);
      const filled = name === 'template' ? fillTemplate(xml, rows, header, deps) : fillDatasets(xml, rows);
      const stream = context.flateStream(new TextEncoder().encode(filled));
      if (ref instanceof PDFLib.PDFRef) context.assign(ref, stream);
      else xfa.set(i + 1, context.register(stream));
      if (name === 'template') sawTemplate = true;
      i += 2;
    } else if (name === 'form') {
      // Gespeicherter Formularzustand passt nach der Änderung nicht mehr zur Vorlage.
      xfa.remove(i + 1);
      xfa.remove(i);
    } else {
      i += 2;
    }
  }
  if (!sawTemplate) throw new Error('Das Formular enthält keine Vorlage.');

  // Adobe-Nutzungsrechte-Signatur wäre nach der Änderung ungültig (Reader meldet sonst einen Fehler).
  pdfDoc.catalog.delete(PDFName.of('Perms'));

  return pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false });
}
