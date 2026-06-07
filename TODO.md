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

## Medium Priority

- [ ] **Year-over-year comparison in Reports**
  Side-by-side view of the same month across years, or "this month vs last year same month" toggle.

- [ ] **Receipt image storage**
  Scanner already OCRs receipts but doesn't save the photo. Store the image in Google Drive
  alongside the DB and link it to the transaction.

- [ ] **Merchant autocomplete**
  As you type in the Merchant field, suggest previously used merchant names from past transactions. Reduces repetitive entry.

---

## Nice to Have

- [ ] **Dashboard spending sparkline**
  A compact mini chart on the dashboard showing your spending trend over the last 6 months without
  having to open Reports. Think of the tiny line graphs in a stock app — at a glance you'd see
  whether spending is trending up or down for the month.

- [ ] **Swipe to delete/edit on mobile**
  On iPhone/iPad, swipe left on a transaction row to reveal Delete and Edit buttons — the same
  gesture used in Mail, Messages, and Reminders. More natural than tapping the small pencil/trash
  icons. Requires touch event handling in ExpenseList rows.

- [ ] **PWA push notifications for budget alerts**
  Since the app is installed as a PWA, it can send native notifications even when the browser
  is closed. The idea: when you hit 80% or 100% of a category budget mid-month, the app fires
  a notification like "You've spent $480 of your $500 Dining budget for June." Requires a
  service worker notification setup and a background check (either on app open or via a
  scheduled sync). Needs user permission grant on first use.
