# Poldi (Web-App)

Die Poldi-App als Web-App (PWA) für iPhone und Android: Dienste, Einsatzorte und Fahrtenbuch
mit Abrechnungs-PDF. Stand: Android-App v2.2.4.

**Adresse:** https://th-spec-hh.github.io/Poldi-App-Web/

## Installieren

**iPhone:** Adresse in **Safari** öffnen → unten auf „Teilen“ (Quadrat mit Pfeil) → „Zum
Home-Bildschirm“ → „Hinzufügen“. Poldi danach immer über das neue Symbol öffnen, nicht über Safari.

**Android:** Adresse in Chrome öffnen → Menü (⋮) → „App installieren“ bzw. „Zum Startbildschirm
hinzufügen“.

Nach dem ersten Öffnen läuft die App auch ohne Internet.

## Wichtig zu wissen

- **Alle Daten bleiben auf dem Handy.** Dienste, Kilometerstände und persönliche Daten werden nur
  im Speicher der App auf dem Gerät abgelegt, nichts geht an einen Server.
- **Daten sichern:** Im Menü „Daten sichern“ erzeugt eine Datei, die man z. B. in „Dateien“ oder
  per Mail ablegt. „Daten wiederherstellen“ lädt sie wieder (z. B. auf einem neuen Handy).
  Wer in den Safari-Einstellungen die Website-Daten löscht, löscht auch die Poldi-Daten.
- **Abrechnungs-PDF:** Beim ersten Mal fragt die App nach dem **leeren Fahrtenbuch-Formular**
  (PDF). Es liegt aus Datenschutzgründen nicht in diesem Repo; jeder wählt es einmal selbst aus.
  Das fertige PDF lässt sich nur in Adobe Acrobat Reader richtig anzeigen.
- **Automatisches Dienstende:** Ein vergessener Dienst endet 2 Stunden nach Schichtende. Eine
  Benachrichtigung gibt es im Browser nicht; Endpunkt und Kilometerstand fragt die App beim
  nächsten Öffnen ab.

## Updates

Jeder Push auf `main` testet die Logik und veröffentlicht die Seite über GitHub Actions
(`.github/workflows/pages.yml`). Die installierte App holt sich das Update beim nächsten
Öffnen; aktiv wird es, wenn man die App einmal verlässt und wieder öffnet.

## Entwicklung

Kein Build-Schritt: reines HTML/CSS/JavaScript mit Preact + htm (`vendor/`), pdf-lib für das PDF.

```
npm ci
npm test                                   # Logik-Tests (Port von AbrechnungRowsTest.kt)
POLDI_BLANK_PDF=/pfad/zum/leeren/formular.pdf npm test   # zusätzlich PDF-Probelauf
npx http-server -c-1 .                     # lokal unter http://localhost:8080
```

| Datei | Inhalt |
| --- | --- |
| `js/logic.js` | Formatierung, Datenmodell, Abrechnungsregeln (1:1 aus AbrechnungRows.kt) |
| `js/xfa.js` | XFA-Formular befüllen (aus AbrechnungXfa.kt / AbrechnungPdf.kt) |
| `js/store.js` | App-Zustand und Abläufe (MainActivity, Fahrtenbuch, Abrechnung, Auto-Ende) |
| `js/ui/*` | Oberfläche (Hauptscreen, Ortsauswahl, Dialoge, Fahrtenbuch, Abrechnung) |
| `sw.js` | Offline-Zwischenspeicher |

Das Datenformat (`tasks`, `shifts`) entspricht dem der Android-App.
