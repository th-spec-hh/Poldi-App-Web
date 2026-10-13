// Leeres Formular (vom Nutzer einmal ausgewählt) in IndexedDB, PDF-Bibliothek bei Bedarf laden,
// Dateien teilen oder herunterladen.

const DB_NAME = 'poldi';
const STORE = 'files';
const BLANK_KEY = 'fahrtenbuch_blanko';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** { bytes: Uint8Array, name, savedAt } oder null */
export async function loadBlankForm() {
  try {
    const entry = await tx('readonly', (s) => s.get(BLANK_KEY));
    return entry ? { ...entry, bytes: new Uint8Array(entry.bytes) } : null;
  } catch {
    return null;
  }
}

export async function saveBlankForm(bytes, name) {
  await tx('readwrite', (s) => s.put({ bytes: bytes.slice().buffer, name, savedAt: Date.now() }, BLANK_KEY));
}

export async function deleteBlankForm() {
  await tx('readwrite', (s) => s.delete(BLANK_KEY));
}

let pdfLibPromise = null;
/** pdf-lib (≈ 500 KB) erst laden, wenn ein PDF gebraucht wird. */
export function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!pdfLibPromise) {
    pdfLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/pdf-lib.min.js';
      script.onload = () => resolve(window.PDFLib);
      script.onerror = () => {
        pdfLibPromise = null;
        reject(new Error('PDF-Bibliothek konnte nicht geladen werden.'));
      };
      document.head.appendChild(script);
    });
  }
  return pdfLibPromise;
}

export async function pdfDeps() {
  const PDFLib = await loadPdfLib();
  return { PDFLib, DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer };
}

/** Datei auswählen lassen; liefert File oder null. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Teilen-Menü des Handys (In Dateien sichern, Mail …); sonst normaler Download.
 * Muss direkt aus einem Tipp heraus aufgerufen werden, sonst blockiert Safari das Teilen.
 */
export async function shareOrDownload(bytes, filename, type) {
  const file = new File([bytes], filename, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // sonst unten herunterladen
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
