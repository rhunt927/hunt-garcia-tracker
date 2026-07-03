# Expense Tracker — Feature Backlog

## Done ✓

- [x] **Split transactions (2026-06-07)** — "Split" toggle (scissors icon) in transaction form; unlimited rows (starts with 2, + Add another / X to remove); each row has category, USD amount, optional description; split amounts enforced ≤ transaction total; yellow split badges in transaction list; Budget and Reports decompose splits by category for accurate spending attribution; both split rows default to original transaction's category
- [x] **Apple Card PDF import (2026-06-07)** — detects "Apple Card"/"Goldman Sachs" in PDF header; handles month-name date format (Jan 01); correctly picks last dollar column (actual charge) and ignores first column (Daily Cash cashback); verified working on real statements
- [x] **GitHub repo renamed** — remote and vite base both updated to `hunt-garcia-tracker`; live at [rhunt927.github.io/hunt-garcia-tracker](https://rhunt927.github.io/hunt-garcia-tracker)
- [x] Budget tracking — dedicated Budget view from dashboard; per-category, per-year limits; progress bars on dashboard filtered to viewed year
- [x] Recurring flag — toggle in transaction form, purple ↺ icon in list
- [x] Search — already existed in Transactions view
- [x] Import: Local File + Google Drive picker (drive.readonly scope; requires sign out/in once to activate)
- [x] Sign out fixed — hard reload after clearing localStorage; works on Mac and iOS
- [x] iOS Reports white screen fixed — recharts v3 labelLine crash + ResizeObserver dimension guard + ErrorBoundary
- [x] PDF parser iOS fix — worker URL construction updated for PWA standalone mode
- [x] Cash flow chart — grouped income/expense bars + net line, last 12 months, on dashboard
- [x] Budget screen redesign — list→detail→edit flow; drill into transactions by month; unbudgeted categories with spending shown in orange; inline category creation; year navigation
- [x] Drive import locked to ExpenseTracker folder — no longer navigates all of Drive; expenses.db hidden from picker
- [x] CategorySelect inline-add bug fixed — new category no longer snaps to blank in the dropdown
- [x] App renamed to "Hunt-Garcia Household Tracker" — title, manifest, login screen, header all updated
- [x] Panama flag icon — favicon.svg + all PWA icon sizes (64, 192, 512, maskable, apple-touch) replaced with Panama flag; login screen uses inline SVG flag

---

## Known Issues

- [ ] **BofA PDF import crashes on iOS PWA for real multi-page statements (2026-07-03)**
  Real-world BofA statement PDFs (10 pages, includes embedded check images on one page)
  crash during `pdf.js` text extraction on Richard's installed iPad PWA — `TypeError:
  undefined is not a function (near '...e of t...')`. Confirmed NOT in our own
  `pdfParser.js` code (traced the deployed minified bundle line by line); the crash is
  inside `pdfjs-dist` v6's own page-processing internals. Wrapping each page's extraction
  in try/catch (already shipped) stops the hard crash but every page fails silently,
  leaving no text to detect — so it now fails with "Unrecognized bank statement PDF"
  instead of crashing, but still doesn't import.
  Ruled out:
  - Downgrading `pdfjs-dist` to v3.x for classic (non-module) worker support — reverted;
    no version is both patched against GHSA-wgrm-67xf-hhpq (arbitrary JS execution from a
    malicious PDF, fixed in 4.2.67+) and still ships a classic worker (dropped by 4.2.67).
    Not an acceptable trade — this app imports PDFs from local files and Drive.
  - Forcing pdf.js's "fake worker" (main-thread, no separate Worker thread) fallback —
    technically doesn't work; the fallback also dynamically imports its worker code from
    the same `workerSrc` URL, so breaking the real worker also breaks the fallback.
  Next step: need a real unminified stack trace from the device (Mac + Safari Develop
  menu remote debugging on the iPad) to actually pinpoint the failing pdf.js function,
  since further guessing against the minified bundle isn't productive.
  Workaround in the meantime: BofA's Online Banking "Download transactions" CSV/TXT
  export (already supported by this app's importer) sidesteps pdf.js entirely.
  All other real bug fixes from this session are live: multi-line/wrapped-amount
  transactions and two-checks-per-row are now parsed correctly wherever `pdf.js` itself
  succeeds in extracting text — this is purely the extraction-layer crash blocking it.

---

## Medium Priority

- [ ] **Year-over-year comparison in Reports**
  Side-by-side view of the same month across years, or "this month vs last year same month" toggle.

- [ ] **Receipt image storage**
  Scanner already OCRs receipts but doesn't save the photo. Store the image in Google Drive
  alongside the DB and link it to the transaction.

- [ ] **Merchant autocomplete**
  As you type in the Merchant field, suggest previously used merchant names from past transactions. Reduces repetitive entry.

---

## Net Worth

- [x] **Manual net worth tracker — accounts (assets & liabilities) (2026-06-17)**
  Net Worth screen with accounts grouped by type (Investment, Checking, Savings, Real Estate, Other / Credit Card, Loan, Mortgage) with subtotals per group. Inline add/edit/delete. Import from BOA Net Worth CSV (upserts on institution+name match, reads "as of date" from header). Each import saves a snapshot — history line chart (Assets / Liabilities / Net Worth) appears in the screen. Dashboard: purple tile shows total, Net Worth button in action grid. Cash tile and Cash screen now pull live Checking/Savings balances from Net Worth accounts; manual cash entries remain editable alongside.

---

## Nice to Have

- [x] **Dashboard spending sparkline** — already exists as the Cash Flow 12-month chart on the dashboard

- [x] **Swipe to delete/edit on mobile (2026-06-07)** — swipe left on any transaction row to reveal blue Edit and red Delete buttons; snaps open/closed; tap row to dismiss; desktop pencil/trash icons still present
