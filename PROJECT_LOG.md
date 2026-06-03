# Expense Tracker PWA — Project Log

## What We're Building

A Progressive Web App (PWA) expense tracker that:

- Runs on iPhone, iPad Air, and Mac — no App Store, installs from Safari/Chrome
- Stores all data in your own Google Drive as a SQLite database file (`ExpenseTracker/expenses.db`)
- Uses real SQL (via sql.js in the browser) for queries and reporting
- Scans receipts via Google Cloud Vision API (OCR)
- Imports bank CSV statements (Chase, Schwab, Discover, Bank of America)
- Viewable in VS Code on Mac via the **SQLite Viewer** extension

**Key decision:** SQLite over JSON — gives real SQL for reporting, data stays in your Google Drive, and you can query the `.db` file directly in VS Code.

---

## Session 1 — June 1, 2026

### Completed

#### Google Cloud Setup (Project: "Claude Finance", ID: `claude-finance-498119`)

- [x] Enabled **Google Drive API**
- [x] Enabled **Cloud Vision API**
- [x] Configured **OAuth consent screen** (External, App: "Expense Tracker", contact: rghunt@gmail.com)
- [x] Created **OAuth Client ID** — "Expense Tracker Web" (Web application)
  - Authorized origins: `http://localhost:5173` and `https://rhunt927.github.io`
- [x] Created **Vision API Key** — restricted to Cloud Vision API + localhost + rhunt927.github.io
- [x] Added `rghunt@gmail.com` as a test user in Audience settings

#### Credentials (stored in LastPass > Secure Notes > "Expense Tracker - Google Cloud")

- OAuth Client ID: `107309831772-jvf2svdn044ldp0kcqu12up297n8eoe2.apps.googleusercontent.com`
- Vision API Key: stored in LastPass

#### Phase 1: Project Scaffold & Auth ✅

- [x] Project scaffolded at `~/Documents/expense-tracker` (NOT in Google Drive — avoids node_modules sync)
- [x] Vite + React + Tailwind CSS v4 + vite-plugin-pwa installed
- [x] All dependencies installed: lucide-react, date-fns, recharts, papaparse, sql.js
- [x] `.env` file created with credentials (gitignored)
- [x] Connected to GitHub repo: `https://github.com/rhunt927/expense-tracker`
- [x] Initial commit pushed — 16 files
- [x] Google OAuth login/logout working (Google Identity Services)
- [x] Panama City skyline background on login screen and main app
- [x] User name + profile photo shown after login

#### Phase 2: Drive + SQLite ✅

- [x] Implemented `src/hooks/useGoogleDrive.js` — download/upload `expenses.db` from Drive
- [x] Implemented `src/hooks/useDatabase.js` — sql.js wrapper for running queries in browser
- [x] SQLite schema created on first run (expenses, categories, payment_methods, exchange_rates)
- [x] Default categories, payment methods, and exchange rates seeded
- [x] Test expense inserted from browser, verified in Google Drive
- [x] Installed SQLite Viewer extension in VS Code — confirmed all tables and data visible

---

## Session 2 — June 3, 2026

### Completed

#### Phase 3: Expense Entry & List ✅
- [x] `ExpenseForm.jsx` — date, merchant, amount, currency, category, payment method, description, notes, transaction type
- [x] `ExpenseList.jsx` — scrollable list, search, filter by type/category, bulk select/delete
- [x] Edit and delete (single + bulk)
- [x] Income/expense color coding (green/red)

#### Phase 4: Camera & OCR ✅
- [x] `ReceiptScanner.jsx` — camera on mobile, file picker on desktop
- [x] Google Cloud Vision API extracts merchant/date/amount
- [x] Pre-fills ExpenseForm with OCR results

#### Phase 5: CSV Import ✅
- [x] `CSVImport.jsx` — drag-and-drop or file picker
- [x] Auto-detects Apple Card, Chase, Schwab, Discover, BofA formats
- [x] Preview table with per-row category assignment before import
- [x] Duplicate detection

#### Phase 6: Reports ✅
- [x] Pie chart (default) and bar chart toggle
- [x] Date range filter (defaults to current month)
- [x] Income / Expenses / Net summary strip
- [x] Category breakdown table
- [x] CSV export of filtered transactions

#### Additional Features Built
- [x] `SettingsSidebar.jsx` — slide-in left panel, resizable
  - Categories, Payment Methods, Transaction Types (with income/expense toggle), Exchange Rates
  - Add / rename / delete all items; changes update DB immediately
- [x] Dashboard home screen — Total Income, Total Expenses, Net + 4 action buttons
- [x] Transaction Types — custom types with income/expense flag; default: Expense, Income, Transfer, Reimbursement
- [x] DB migration — all stored names updated to human-readable display format
- [x] Persistent auth — sessionStorage for token (survives refresh), localStorage for profile
- [x] Profile photo via Google identity; initials fallback

#### Phase 8: Deploy (In Progress)
- [x] GitHub Actions workflow created (`.github/workflows/deploy.yml`)
- [x] `vite.config.js` base set to `/expense-tracker/`
- [ ] Add GitHub Secrets: `VITE_GOOGLE_CLIENT_ID`, `VITE_VISION_API_KEY`
- [ ] Enable GitHub Pages in repo settings (Source: GitHub Actions)
- [ ] Final smoke test on iPhone Safari and iPad Air

---

## TODO — Next Session

### Phase 7: PWA Polish ← START HERE

- [ ] Add PWA icons (192px and 512px) to `public/icons/`
- [ ] Test "Add to Home Screen" on iPhone Safari and iPad Air
- [ ] Offline read mode
- [ ] Lighthouse PWA audit

---

## Project Structure

```text
~/Documents/expense-tracker/        (code — backed up to GitHub)
├── public/
│   ├── panama.jpg                  (login + app background)
│   ├── favicon.svg
│   └── icons/                      (PWA icons — to be added)
├── src/
│   ├── App.jsx                     (root, handles auth + db state)
│   ├── components/
│   │   └── LoginScreen.jsx         (login UI with Panama background)
│   ├── hooks/
│   │   ├── useAuth.js              (Google OAuth)
│   │   ├── useGoogleDrive.js       (Drive read/write)
│   │   └── useDatabase.js          (sql.js wrapper)
│   └── index.css                   (Tailwind v4 import)
├── .env                            (credentials — gitignored)
├── vite.config.js                  (Tailwind + PWA plugins)
└── package.json

~/Google Drive/Claude Finance App/  (docs — synced to all devices)
├── PROJECT_LOG.md                  (this file)
├── ExpenseTracker_ProjectBrief.docx
└── client_secret_...json           (credentials backup)
```

---

## Tech Stack

| Layer     | Choice                               |
|-----------|--------------------------------------|
| Framework | React 18 + Vite                      |
| Styling   | Tailwind CSS v4                      |
| PWA       | vite-plugin-pwa (Workbox)            |
| Auth      | Google Identity Services (OAuth 2.0) |
| Storage   | Google Drive REST API v3             |
| Database  | SQLite via sql.js (WebAssembly)      |
| OCR       | Google Cloud Vision API              |
| Charts    | Recharts                             |
| CSV       | PapaParse                            |
| Icons     | Lucide React                         |
| Hosting   | GitHub Pages                         |

---

## SQLite Schema

```sql
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  merchant TEXT,
  description TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  amount_usd REAL NOT NULL,
  category TEXT,
  payment_method TEXT,
  receipt_filename TEXT,
  source TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE categories (name TEXT PRIMARY KEY);
CREATE TABLE payment_methods (name TEXT PRIMARY KEY);
CREATE TABLE exchange_rates (currency TEXT PRIMARY KEY, rate REAL);
```

---

## Default Data

**Categories:** dining, groceries, transport, lodging, shopping, equipment,
professional_services, shipping, packing_supplies, storage, other

**Payment Methods:** schwab_checking, boa_checking, schwab_brokerage, cash, zelle, discover

**Exchange Rates:** PAB = 1.00, EUR = 1.08

---

## Key URLs

- GitHub repo: <https://github.com/rhunt927/expense-tracker>
- Google Cloud Console: <https://console.cloud.google.com/home/dashboard?project=claude-finance-498119>
- OAuth Clients: <https://console.cloud.google.com/auth/clients?project=claude-finance-498119>
- Dev server: <http://localhost:5173>
