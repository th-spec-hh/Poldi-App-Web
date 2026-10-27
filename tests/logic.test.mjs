// Logik-Tests (node --test). Entsprechen AbrechnungRowsTest.kt der Android-App.
// Der PDF-Probelauf braucht das leere Formular, das nicht im Repo liegt:
//   POLDI_BLANK_PDF=/pfad/fahrtenbuch_blanko.pdf node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { AbrechnungRows, Fmt, normalizeShift, autoEndTime, shiftDate } from '../js/logic.js';
import { makePdf, checkBlankForm } from '../js/xfa.js';

function shift(date, label, start, kmStart, kmEnd, ...stops) {
  return normalizeShift({
    id: `${date}-${label}`, label, date, kmStart, kmEnd, isActive: false, startPoint: start,
    visited: stops.map((title) => ({ title, timestamp: '' })),
  });
}

const s1 = () => shift('10.10.2026', '7-13', 'Wohnung', '123456', '123500',
  'PK 21', 'PK 11', 'Wohnung', 'AK Altona', 'Wohnung');
const s2 = () => shift('11.10.2026', '13-18', 'Arbeit', '123500', '123611',
  'PK 11', 'PK 16', 'PK 23', 'UKE', 'PK 27', 'PK 31', 'BP Altona', 'PK 38', 'Wohnung', 'PK 24', 'Arbeit');

test('einfacher Dienst wird eine Zeile wie im Beispiel', () => {
  const rows = AbrechnungRows.build([s1()]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.date, '10.10.2026');
  assert.ok(r.abWohnung && !r.abUke);
  assert.ok(r.bisWohnung && !r.bisUke);
  assert.equal(r.fahrtziel, '21, 11, Whg, AK Alt.');
  assert.equal(r.kunde, 'Poldi');
  assert.equal(r.kmStart, 123456);
  assert.equal(r.kmEnd, 123500);
});

test('langer Dienst läuft in der nächsten Zeile weiter', () => {
  const rows = AbrechnungRows.build([s2()]);
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.equal(a.date, '11.10.2026');
  assert.ok(a.abUke && !a.bisUke && !a.bisWohnung);
  assert.ok(a.fahrtziel.startsWith('11, 16, 23, UKE, 27'), a.fahrtziel);
  assert.ok(a.fahrtziel.endsWith(','), a.fahrtziel);
  assert.equal(`${a.fahrtziel} ${b.fahrtziel}`, '11, 16, 23, UKE, 27, 31, BP Alt., 38, Whg, 24');
  assert.equal(a.kunde, 'Poldi');
  assert.equal(b.date, null);
  assert.ok(!b.abUke && !b.abWohnung && b.bisUke);
  assert.ok(b.fahrtziel.endsWith('38, Whg, 24'), b.fahrtziel);
  assert.equal(b.kunde, '');
  assert.equal(a.kmStart, 123500);
  assert.equal(a.kmEnd, b.kmStart);
  assert.equal(b.kmEnd, 123611);
  assert.ok(a.kmEnd > 123500 && a.kmEnd < 123611, 'km anteilig');
});

test('Dienste werden nach Datum und Uhrzeit sortiert', () => {
  const late = shift('02.10.2026', '18-0', 'Arbeit', '200', '300', 'PK 11', 'Arbeit');
  const early = shift('02.10.2026', '4-7', 'Arbeit', '100', '200', 'PK 14', 'Arbeit');
  const first = shift('01.10.2026', '13-18', 'Arbeit', '50', '100', 'PK 15', 'Arbeit');
  assert.deepEqual(AbrechnungRows.build([late, early, first]).map((r) => r.fahrtziel), ['15', '14', '11']);
});

test('fehlende Angaben werden gemeldet', () => {
  const s = shift('03.10.2026', '7-13', null, '100', null, 'PK 11');
  const problems = AbrechnungRows.problems(s);
  assert.ok(problems.includes('Startpunkt fehlt'));
  assert.ok(problems.includes('Endpunkt fehlt'));
  assert.ok(problems.includes('End-km fehlt'));
  assert.equal(AbrechnungRows.problemSummary(s), 'Fehlt: Startpunkt, Endpunkt, End-km');
  const ok = shift('03.10.2026', '7-13', 'Arbeit', '100', '150', 'PK 11', 'Wohnung');
  assert.deepEqual(AbrechnungRows.problems(ok), []);
  const reversed = shift('03.10.2026', '7-13', 'Arbeit', '150', '100', 'PK 11', 'Wohnung');
  assert.equal(AbrechnungRows.problemSummary(reversed), 'End-km kleiner als Start-km');
});

test('Kürzel', () => {
  assert.equal(AbrechnungRows.abbreviate('PK 21'), '21');
  assert.equal(AbrechnungRows.abbreviate('WSPK 2'), 'WSPK 2');
  assert.equal(AbrechnungRows.abbreviate('AK Wandsbek'), 'AK W.');
  assert.equal(AbrechnungRows.abbreviate('BP Harburg'), 'BP Har');
  assert.equal(AbrechnungRows.abbreviate('Kinder UKE'), 'KiUKE');
  assert.equal(AbrechnungRows.abbreviate('Schön Klinik Eilbek'), 'Eilb. KH');
  assert.equal(AbrechnungRows.abbreviate('Freitext'), 'Freitext');
});

test('Formatierung', () => {
  assert.equal(Fmt.km(123456), '123 456');
  assert.equal(Fmt.km('1500'), '1 500');
  assert.equal(Fmt.km(999), '999');
  assert.equal(Fmt.monthTitleSlash('10/2026'), 'Oktober 2026');
  assert.equal(Fmt.monthTitleDash('2026-03'), 'März 2026');
  assert.equal(Fmt.dashMonthKey('05.10.2026'), '2026-10');
  assert.equal(Fmt.timestamp(new Date(2026, 9, 3, 7, 5)), '07:05, 03.10.2026');
  assert.equal(Fmt.euro(33.3), '33,30');
});

test('Altdaten von Android lesen', () => {
  const json = '[{"id":"a","label":"7-13","date":"11.10.2026","kmStart":"100","visited":[{"title":"PK 11","timestamp":"08:00, 11.10.2026"}]}]';
  const shifts = JSON.parse(json).map(normalizeShift);
  assert.equal(shifts.length, 1);
  assert.ok(shifts[0].isActive, 'ohne isActive und ohne kmEnd gilt der Dienst als offen');
  assert.equal(shifts[0].visited[0].assignedBy, null);
});

test('automatisches Dienstende 2 h nach Schichtende', () => {
  const now = new Date(2026, 9, 13, 8, 0);
  assert.equal(new Date(autoEndTime('7-13', now)).getHours(), 15);
  const night = new Date(autoEndTime('18-0', new Date(2026, 9, 13, 18, 30)));
  assert.equal(night.getDate(), 14);
  assert.equal(night.getHours(), 2);
  assert.equal(shiftDate('0-4', new Date(2026, 9, 13, 23, 10)), '14.10.2026');
  assert.equal(shiftDate('7-13', new Date(2026, 9, 13, 23, 10)), '13.10.2026');
});

const blank = process.env.POLDI_BLANK_PDF;
test('PDF-Probelauf', { skip: !blank || !existsSync(blank) ? 'POLDI_BLANK_PDF nicht gesetzt' : false }, async () => {
  const require = createRequire(import.meta.url);
  const PDFLib = require('pdf-lib');
  const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
  const deps = { PDFLib, DOMParser, XMLSerializer };
  const bytes = readFileSync(blank);
  assert.equal(await checkBlankForm(bytes, deps), true);
  const rows = AbrechnungRows.build([s1(), s2()]);
  const out = await makePdf(bytes, rows, {
    name: 'Test Fahrer', personalnummer: '123456', kennzeichen: 'HH-AB 123', kostenstelle: '12345678',
  }, deps);
  assert.ok(out.length > 100000);
  if (process.env.POLDI_OUT_PDF) writeFileSync(process.env.POLDI_OUT_PDF, out);
});

test('Fahrtenbuch-Details: Eintrags- und Erledigt-Zeit', () => {
  assert.equal(Fmt.visitTimes({ timestamp: '10:47, 20.10.2026', addedAt: '09:12, 20.10.2026' }), '20.10. 09.12 / 10.47');
  assert.equal(Fmt.visitTimes({ timestamp: '00:15, 21.10.2026', addedAt: '23:40, 20.10.2026' }), '20.10. 23.40 / 21.10. 00.15');
  assert.equal(Fmt.visitTimes({ timestamp: '10:47, 20.10.2026' }), '20.10. 10.47');
  assert.equal(Fmt.visitTimes({ timestamp: '' }), null);
  const s = normalizeShift({ visited: [{ title: 'PK 11', timestamp: '10:47, 20.10.2026', addedAt: '09:12, 20.10.2026' }] });
  assert.equal(s.visited[0].addedAt, '09:12, 20.10.2026');
});
