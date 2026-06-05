# Expense Tracker — Feature Backlog

## Done ✓

- [x] Budget tracking — dedicated Budget view from dashboard; per-category, per-year limits; progress bars on dashboard filtered to viewed year
- [x] Recurring flag — toggle in transaction form, purple ↺ icon in list
- [x] Search — already existed in Transactions view
- [x] Import: Local File + Google Drive picker (drive.readonly scope; requires sign out/in once to activate)
- [x] Sign out fixed — works on Mac and iOS; state clears immediately, revoke runs in background
- [x] iOS Reports white screen fixed — recharts v3 labelLine crash + ResizeObserver dimension guard + ErrorBoundary
- [x] PDF parser iOS fix — worker URL construction updated for PWA standalone mode

---

## High Priority — Do First

- [ ] **Sign out broken** — clicking Sign Out in the Settings sidebar does not return to the login
  screen. Two fixes attempted (GIS revoke bypass, fetchUserProfile race guard) but still failing.
  Need to open browser devtools, reproduce the sign-out click, and read the console/network tab
  to find the actual error before guessing further.

- [ ] **Cash flow: monthly net chart** — dashboard card showing income vs. expense bars per month
  (last 6–12 months) with a net line overlay. Uses existing transaction data, no schema changes.
  recharts already in use.

- [ ] **Cash flow: running balance** — cumulative position line chart. Requires a "starting balance"
  field in Settings (one number, persisted in DB). Shows true bank-balance trend over time.
  Build after the monthly net chart is in place.

---

## Known Issues / Needs Verification

- [ ] **Local file import error on mobile** — user got an error selecting a file from iOS Files app.
  Need the actual error message to diagnose. Likely a bank format not recognized by the parser,
  or the PDF worker still failing. Ask user to share the error text next session.

- [ ] **Drive import: sign out/in required** — after the drive.readonly scope change, existing
  sessions will see "sign out and sign back in" prompt until they re-auth. First use after
  re-auth should show Drive files correctly. Needs verification on mobile.

---

## Medium Priority

- [ ] **Year-over-year comparison in Reports**
  Side-by-side view of the same month across years, or "this month vs last year same month" toggle.

- [ ] **Receipt image storage**
  Scanner already OCRs receipts but doesn't save the photo. Store the image in Google Drive
  alongside the DB and link it to the transaction.

- [ ] **Merchant autocomplete**
  As you type in the Merchant field, suggest previously used merchant names. Reduces repetitive entry.

---

## Nice to Have

- [ ] **Dashboard spending sparkline**
  Small 6-month trend line on the dashboard showing spending at a glance without opening Reports.

- [ ] **Swipe to delete/edit on mobile**
  Swipe left on a transaction row to reveal delete/edit actions — more natural on iPhone/iPad.

- [ ] **PWA push notifications**
  Alert when approaching or exceeding a budget limit for the month.
