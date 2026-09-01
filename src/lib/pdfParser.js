import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker as a blob URL — avoids iOS PWA issues with external ?url workers
try {
  const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''
}

// pdf.js's own getTextContent() does `for await (const value of readableStream)`,
// which needs the browser's ReadableStream to support native async iteration — missing
// on some iOS Safari versions, where it throws "undefined is not a function" instead of
// failing gracefully. Pump the stream manually with getReader()/read() to avoid that path.
async function getPageTextItems(page) {
  const reader = page.streamTextContent({ includeMarkedContent: false, disableNormalization: false }).getReader()
  const items = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    items.push(...value.items)
  }
  return items
}

// Returns { rows, bankName } or throws
export async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  // Without this, pdf.js can't substitute glyph data missing from a PDF's embedded
  // subset font (e.g. "®" not in the subset) — on iOS Safari that throws instead of
  // falling back, silently failing text extraction on every page of the statement.
  const standardFontDataUrl = `${import.meta.env.BASE_URL}standard_fonts/`
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, standardFontDataUrl }).promise

  const allLines = []
  const rawTextParts = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    // A single page (e.g. one with embedded check images) can fail to extract on
    // some devices/browsers — don't let that page sink the whole statement.
    try {
      const page = await pdf.getPage(pageNum)
      const items = await getPageTextItems(page)

      // Group text items by rounded y-coordinate to reconstruct rows
      const lineMap = new Map()
      for (const item of items) {
        if (item.str) rawTextParts.push(item.str)
        const y = Math.round(item.transform[5])
        if (!lineMap.has(y)) lineMap.set(y, [])
        lineMap.get(y).push(item)
      }

      // Sort y descending (top → bottom on page), then x ascending within each row
      const sortedYs = [...lineMap.keys()].sort((a, b) => b - a)
      for (const y of sortedYs) {
        const lineItems = lineMap.get(y).sort((a, b) => a.transform[4] - b.transform[4])
        const text = lineItems.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()
        if (text) allLines.push(text)
      }
    } catch (err) {
      console.warn(`PDF page ${pageNum} failed to extract, skipping it:`, err)
    }
  }

  const bank = detectBank(allLines, rawTextParts.join(' '))
  if (!bank) throw new Error('Unrecognized bank statement PDF. Supported: Apple Card, Schwab, Bank of America, Chase, Discover, Wells Fargo, Costco Anywhere Visa, Meijer Mastercard, Banistmo.')

  return parseStatementLines(allLines, bank)
}

// `rawText` is the PDF's text items joined in their original (unsorted) order —
// unlike `lines`, it can't be scrambled by side-by-side columns landing on the same
// reconstructed row, so it's a more reliable fallback signal for detection.
function detectBank(lines, rawText) {
  const header = lines.slice(0, 40).join(' ')
  if (/apple card|goldman sachs/i.test(header)) return APPLE
  if (/charles schwab|schwab bank|schwab one/i.test(header)) return SCHWAB
  if (/bank of america/i.test(header)) return BOA
  if (/jpmorgan chase|chase bank|chase card|chase\.com/i.test(header)) return CHASE
  if (/discover bank|discover card|discover\.com/i.test(header)) return DISCOVER
  if (/wells fargo/i.test(header)) return WELLS_FARGO
  if (/costco anywhere visa/i.test(header)) return CITI_COSTCO
  if (/meijer.*mastercard/i.test(header)) return CITI_MEIJER
  if (/banistmo/i.test(header)) return BANISTMO
  const full = `${lines.join(' ')} ${rawText ?? ''}`
  if (/apple card/i.test(full)) return APPLE
  if (/schwab/i.test(full)) return SCHWAB
  if (/bank of america/i.test(full)) return BOA
  if (/\bchase\b/i.test(full)) return CHASE
  if (/\bdiscover\b/i.test(full)) return DISCOVER
  if (/wells fargo/i.test(full)) return WELLS_FARGO
  if (/costco anywhere visa/i.test(full)) return CITI_COSTCO
  if (/meijer.*mastercard/i.test(full)) return CITI_MEIJER
  if (/banistmo/i.test(full)) return BANISTMO
  return null
}

// ─── Bank configs ────────────────────────────────────────────────────────────

const SCHWAB = {
  name: 'Schwab',
  paymentMethod: 'Schwab Checking',
  source: 'pdf_schwab',
  creditSection: /^(deposits and other credits|other credits)/i,
  debitSection: /^(withdrawals and other debits|checks paid|other debits)/i,
  skipSection: /^(daily balance|total withdrawals|total deposits|total checks)/i,
}

const BOA = {
  name: 'Bank of America',
  paymentMethod: 'BOA Checking',
  source: 'pdf_boa',
  creditSection: /^(deposits and other additions|interest earned)/i,
  debitSection: /^(withdrawals|checks|electronic withdrawals|other withdrawals|purchases)/i,
  skipSection: /^(daily ledger|total withdrawals|total purchases|total deposits)/i,
}

const CHASE = {
  name: 'Chase',
  paymentMethod: 'Chase',
  source: 'pdf_chase',
  creditSection: /^(payments and other credits|account activity credits|total credits|total payments)/i,
  debitSection: /^(purchases|transactions|account activity|other charges)/i,
  skipSection: /^(total purchases|total transactions)/i,
}

const DISCOVER = {
  name: 'Discover',
  paymentMethod: 'Discover',
  source: 'pdf_discover',
  // Discover's real table header wraps "TRANS." onto its own line, leaving
  // "DATE PAYMENTS AND CREDITS AMOUNT" / "DATE PURCHASES ... AMOUNT" as the
  // header row — so the section phrase isn't always the first word.
  creditSection: /^(?:trans\.?\s*)?(?:date\s+)?payments and credits\b/i,
  debitSection: /^(?:trans\.?\s*)?(?:date\s+)?(purchases|transactions)\b/i,
  skipSection: /^(total purchases|total transactions|total payments)/i,
  // "Recent Activity" pending lines end in PROCESSING and aren't final — excluded from
  // the normal per-line parse (see pendingLine below) and handled separately so a hold
  // that gets voided and re-authorized for the same amount (a matching -X.XX/+X.XX pair)
  // doesn't import as two separate expenses. See buildDiscoverPendingRows.
  pendingLine: /\bPROCESSING\s*$/i,
  // Statements from Aug 2026 on added a "MERCHANT CATEGORY" column (see the
  // "DATE PURCHASES MERCHANT CATEGORY AMOUNT" header) that prints right before the
  // amount, e.g. "UBERBV UBER TRIP HELP.UB Travel/Entertainment $7.97" — without this,
  // that label gets captured as part of the merchant name and breaks duplicate matching
  // against expenses imported from pre-change statements. Only the category values seen
  // so far are listed; an unrecognized one just won't get stripped (findMatch's
  // date/amount/payment-method fallback in CSVImport still catches it as a duplicate).
  merchantCategorySuffix: /\s+(?:Merchandise|Services|Travel\/Entertainment)\s*$/,
}

const APPLE = {
  name: 'Apple Card',
  paymentMethod: 'Apple Card',
  source: 'pdf_apple',
  creditSection: /^(payments and credits|payments)/i,
  debitSection: /^(transactions|purchases)/i,
  skipSection: /^(total|account summary|interest charges|apr)/i,
  monthNameDates: true,
  useLastAmount: true,  // first amount is Daily Cash (cashback), last is the actual charge
}

// Wells Fargo credit card (Autograph, Active Cash, etc.)
// Transaction rows: CARDLAST4  MM/DD  MM/DD  REFNUM  DESCRIPTION  AMOUNT
// Credits column populated for payments; Charges column for purchases.
const WELLS_FARGO = {
  name: 'Wells Fargo',
  paymentMethod: 'Wells Fargo Credit Card',
  source: 'pdf_wf',
  creditSection: /^payments and (?:other )?credits?/i,
  debitSection: /^(purchases,?\s*balance transfers|fees charged)/i,
  skipSection: /^(interest charged|total |20\d{2} totals|interest charge calc|wells fargo news|this page intentionally)/i,
  parseLine: parseWFLine,
}

// Costco Anywhere Visa (Citibank). Purchase rows carry two dates (sale, post);
// credit/payment rows carry one date and a trailing " - $amount" instead of a
// leading minus sign. There's no plain "Purchases" header — each batch is
// preceded by a rate-plan label like "Promo Purchase-Offer 4 (9.990%)" or
// "Standard Purch", so debitSection matches on that instead.
const CITI_COSTCO = {
  name: 'Costco Anywhere Visa',
  paymentMethod: 'Costco Visa',
  source: 'pdf_citi_costco',
  creditSection: /^payments,?\s*credits?(\s*and adjustments)?/i,
  // "promo purchase.*" consumes the whole "(9.990%)" rate suffix so the shared
  // isRealHeaderMatch dollar-decoy check (which also matches percentages like
  // "9.990") doesn't see it as trailing text and wrongly reject the header.
  debitSection: /^(promo purchase.*|standard purch|purchases)/i,
  skipSection: /^(fees charged|interest charged|20\d{2} totals|interest charge calculation|account messages)/i,
  parseLine: parseCitiCostcoLine,
}

// Meijer Mastercard (Citibank). All transactions share one "TRANSACTIONS"
// table — credit vs. debit isn't determined by section, but by a trailing
// "-" glued directly onto the amount (e.g. "$ 74.89-"). parseLine ignores
// the section-derived isCredit and reads the sign off the line itself.
const CITI_MEIJER = {
  name: 'Meijer Mastercard',
  paymentMethod: 'Meijer Mastercard',
  source: 'pdf_meijer',
  creditSection: /^trans date\s+description/i,
  debitSection: /^trans date\s+description/i,
  skipSection: /^(fees$|interest charged|activity and promotions detail|rewards summary|interest charge calculation)/i,
  parseLine: parseMeijerLine,
}

// Banistmo (Panama) checking account statement. One combined "Account movements"
// table, not split into credit/debit sections — a row carries either a Withdrawal
// or a Deposit amount (never both), always followed by the running Balance:
// "31 Aug 2026 DEPOSITO $400.00 $777.09" (deposit — no sign)
// "25 Aug 2026 <detail...> -$272.91 $377.09" (withdrawal — leading "-" on the amount)
// Dates are "D Mon YYYY" (day before month name), unlike the "Mon D" format the other
// month-name banks use, so it needs its own date-start regex for continuation-line
// detection — the detail column often wraps onto extra lines before the amount appears.
const DAY_MONTH_NAME_DATE_RE = /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i

const BANISTMO = {
  name: 'Banistmo',
  paymentMethod: 'Banistmo Checking',
  source: 'pdf_banistmo',
  dateStartRegex: DAY_MONTH_NAME_DATE_RE,
  parseLine: parseBanistmoLine,
  // Unlike other banks, Banistmo wraps overflow detail text onto line(s) *after*
  // the amount/balance rather than before it — see appendCapsContinuation.
  trailingContinuation: true,
}

// ─── Core parser ─────────────────────────────────────────────────────────────

function parseStatementLines(lines, bank) {
  let year = new Date().getFullYear()
  for (const line of lines) {
    // "Member Since 20XX" (Citi cardholder tenure) isn't the statement year —
    // it repeats on every page ahead of the real statement date/period lines.
    if (/member since/i.test(line)) continue
    const m = line.match(/\b(20\d{2})\b/)
    if (m) { year = parseInt(m[1]); break }
  }

  // Lines like Discover's "Recent Activity" pending rows are excluded from the normal
  // parse below (they're not final) but collected here to become their own pending rows.
  const pendingLines = bank.pendingLine ? lines.filter(l => bank.pendingLine.test(l)) : []
  const pendingRows = buildDiscoverPendingRows(pendingLines, year, bank)

  // Pass 1: strict section-aware (header must start the line)
  let rows = parseSectionAware(lines, bank, year)

  // After section detection, apply keyword override per row — fixes cases where
  // a deposit/credit ends up in the wrong section in a PDF (e.g. Schwab Zelle credits
  // appearing under the Withdrawals header).
  if (rows.length > 0) {
    rows = rows.map(r => ({ ...r, isCredit: keywordOverride(r.merchant, r.isCredit) }))
    return { rows: [...rows, ...pendingRows], bankName: `${bank.name} (PDF)` }
  }

  // Pass 2: no section headers found — scan all lines, classify purely by keywords
  for (let i = 0; i < lines.length; i++) {
    if (bank.pendingLine?.test(lines[i])) continue
    const checkPair = !bank.parseLine && parseCheckPairLine(lines[i], year, bank)
    if (checkPair) { rows.push(...checkPair); continue }

    const result = parseWithAmountLookahead(lines, i, year, bank, null)
    if (result) {
      const { row: parsed, consumed } = result
      if (!bank.parseLine) parsed.description = followOnLine(lines, i + consumed, bank)
      rows.push(parsed)
    }
  }

  if (rows.length === 0 && pendingRows.length === 0) {
    throw new Error(`No transactions found in this ${bank.name} PDF. Make sure it's a checking or credit card statement.`)
  }

  return { rows: [...rows, ...pendingRows], bankName: `${bank.name} (PDF)` }
}

// Parses one Discover "Recent Activity" pending line, e.g.:
// "08/01/26 PENDING UberBV UBER PENDING $ 2.90 PROCESSING"
// The "PENDING" right after the date stands in for a post date that doesn't exist yet —
// it isn't part of the merchant name.
function parseDiscoverPendingLine(line, year) {
  const m = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+PENDING\s+(.+?)\s+\$?\s*(-?[\d,]+\.\d{2})\s+PROCESSING\s*$/i)
  if (!m) return null
  const [, dateStr, merchant, amtStr] = m
  const parts = dateStr.split('/')
  const mm = parts[0].padStart(2, '0')
  const dd = parts[1].padStart(2, '0')
  const yyyy = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : String(year)
  const rawAmount = parseFloat(amtStr.replace(/,/g, ''))
  if (isNaN(rawAmount)) return null
  return { date: `${yyyy}-${mm}-${dd}`, merchant: merchant.trim(), rawAmount }
}

// A hold that gets voided and re-authorized shows up as a matching -X.XX/+X.XX pair
// (same date, same amount) in the pending table — net those out rather than importing
// either half. Genuinely pending charges (no matching opposite-sign line) survive as
// their own pending expense rows.
function buildDiscoverPendingRows(pendingLines, year, bank) {
  const parsed = pendingLines.map(l => parseDiscoverPendingLine(l, year)).filter(Boolean)

  const groups = new Map()
  for (const p of parsed) {
    const key = `${p.date}|${Math.abs(p.rawAmount).toFixed(2)}`
    if (!groups.has(key)) groups.set(key, { pos: [], neg: [] })
    groups.get(key)[p.rawAmount < 0 ? 'neg' : 'pos'].push(p)
  }

  const survivors = []
  for (const { pos, neg } of groups.values()) {
    const netCount = Math.min(pos.length, neg.length)
    survivors.push(...pos.slice(netCount), ...neg.slice(netCount))
  }

  return survivors.map(p => ({
    date: p.date,
    merchant: p.merchant,
    description: null,
    amount: Math.abs(p.rawAmount),
    currency: 'USD',
    amount_usd: Math.abs(p.rawAmount),
    category: null,
    payment_method: bank.paymentMethod,
    source: bank.source,
    isCredit: p.rawAmount < 0,
    isPending: true,
  }))
}

// WF CC line format: CARDLAST4  MM/DD  MM/DD  REFNUM  DESCRIPTION  AMOUNT
// e.g. "7119 06/19 06/19 2404955HWS66E8J71 PRO NAILS & SPA LIBERTYVILLE IL 71.75"
function parseWFLine(line, year, isCredit) {
  const m = line.match(/^\d{4}\s+(\d{2}\/\d{2})\s+\d{2}\/\d{2}\s+\S+\s+(.*?)\s+([\d,]+\.\d{2})\s*$/)
  if (!m) return null
  const [, transDate, description, amtStr] = m
  const desc = description.trim()
  if (!desc || desc.length < 2) return null
  if (/^(total|interest|minimum payment|new balance)/i.test(desc)) return null
  const amount = parseFloat(amtStr.replace(/,/g, ''))
  if (!amount || amount <= 0) return null
  const [mm, dd] = transDate.split('/')
  return {
    date: `${year}-${mm}-${dd}`,
    merchant: desc,
    description: null,
    amount,
    currency: 'USD',
    amount_usd: amount,
    category: null,
    payment_method: 'Wells Fargo Credit Card',
    source: 'pdf_wf',
    isCredit: !!isCredit,
  }
}

// Costco (Citi) purchase row: "MM/DD MM/DD DESCRIPTION $AMOUNT" (sale date, post date).
// Credit/payment row: "MM/DD DESCRIPTION - $AMOUNT" (note the standalone "-" before
// the amount, rather than a leading minus sign on the number itself).
function parseCitiCostcoLine(line, year, isCredit) {
  const purchase = line.match(/^(\d{2}\/\d{2})\s+\d{2}\/\d{2}\s+(.+?)\s+\$?\s*([\d,]+\.\d{2})\s*$/)
  const credit = !purchase && line.match(/^(\d{2}\/\d{2})\s+(.+?)\s+-\s+\$?\s*([\d,]+\.\d{2})\s*$/)
  const m = purchase || credit
  if (!m) return null
  const [, dateStr, desc, amtStr] = m
  const description = desc.trim()
  if (!description || description.length < 2) return null
  const amount = parseFloat(amtStr.replace(/,/g, ''))
  if (!amount || amount <= 0) return null
  const [mm, dd] = dateStr.split('/')
  return {
    date: `${year}-${mm}-${dd}`,
    merchant: description,
    description: null,
    amount,
    currency: 'USD',
    amount_usd: amount,
    category: null,
    payment_method: 'Costco Visa',
    source: 'pdf_citi_costco',
    isCredit: purchase ? !!isCredit : true,
  }
}

// Meijer (Citi) row: "MM/DD DESCRIPTION REFERENCE# $ AMOUNT[-]" — a trailing "-"
// glued onto the amount (no space) marks a credit/payment; its absence means a purchase.
function parseMeijerLine(line, year) {
  const m = line.match(/^(\d{2}\/\d{2})\s+(.+?)\s+\S+\s+\$\s*([\d,]+\.\d{2})(-)?\s*$/)
  if (!m) return null
  const [, dateStr, desc, amtStr, creditFlag] = m
  const description = desc.trim()
  if (!description || description.length < 2) return null
  const amount = parseFloat(amtStr.replace(/,/g, ''))
  if (!amount || amount <= 0) return null
  const [mm, dd] = dateStr.split('/')
  return {
    date: `${year}-${mm}-${dd}`,
    merchant: description,
    description: null,
    amount,
    currency: 'USD',
    amount_usd: amount,
    category: null,
    payment_method: 'Meijer Mastercard',
    source: 'pdf_meijer',
    isCredit: !!creditFlag,
  }
}

// Banistmo row: "D Mon YYYY <detail...> [-]$AMOUNT $BALANCE" — the leading "-" on
// the transaction amount (not the balance) marks a withdrawal; its absence, a deposit.
// There's no section context here, so the sign on the line is the only signal.
function parseBanistmoLine(line) {
  const m = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\s+(.+?)\s+(-)?\$\s*([\d,]+\.\d{2})\s+\$?\s*[\d,]+\.\d{2}\s*$/i)
  if (!m) return null
  const [, dayStr, monStr, yearStr, detail, sign, amtStr] = m
  const monthNum = MONTH_ABBR[monStr.slice(0, 3).toLowerCase()]
  if (!monthNum) return null
  const description = detail.trim()
  if (!description || description.length < 2) return null
  const amount = parseFloat(amtStr.replace(/,/g, ''))
  if (!amount || amount <= 0) return null
  const mm = String(monthNum).padStart(2, '0')
  const dd = dayStr.padStart(2, '0')
  return {
    date: `${yearStr}-${mm}-${dd}`,
    merchant: description,
    description: null,
    amount,
    currency: 'USD',
    amount_usd: amount,
    category: null,
    payment_method: 'Banistmo Checking',
    source: 'pdf_banistmo',
    isCredit: !sign,
  }
}

// A genuine table header's section phrase is followed by more column labels
// (or nothing) — never a dollar amount right next to it. Account Summary
// boxes reuse the same section phrases immediately followed by a dollar
// figure (e.g. "Purchases +$2,126.51"), which would otherwise be mistaken
// for the real header. Only check text right after the match, not the whole
// line — on statements where a side-by-side box (e.g. a rewards summary)
// shares the header row's y-coordinate, its own dollar figure can land much
// further down the same reconstructed line and must not disqualify the match.
const NEARBY_DOLLAR_AMOUNT = /^.{0,20}\d+\.\d{2}/

function isRealHeaderMatch(line, sectionRegex) {
  if (!sectionRegex) return false
  const m = sectionRegex.exec(line)
  if (!m) return false
  return !NEARBY_DOLLAR_AMOUNT.test(line.slice(m.index + m[0].length))
}

function parseSectionAware(lines, bank, year) {
  const rows = []
  let sectionType = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (bank.skipSection?.test(line))   { sectionType = null;     continue }
    if (isRealHeaderMatch(line, bank.creditSection)) { sectionType = 'credit'; continue }
    if (isRealHeaderMatch(line, bank.debitSection))  { sectionType = 'debit';  continue }
    if (!sectionType) continue
    if (bank.pendingLine?.test(line)) continue

    const isCredit = sectionType === 'credit'

    const checkPair = !bank.parseLine && parseCheckPairLine(line, year, bank)
    if (checkPair) { rows.push(...checkPair); continue }

    const result = parseWithAmountLookahead(lines, i, year, bank, isCredit)
    if (result) {
      const { row: parsed, consumed } = result
      if (!bank.parseLine) parsed.description = followOnLine(lines, i + consumed, bank)
      rows.push(parsed)
    }
  }

  return rows
}

const MONTH_NAME_START_RE = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}/i

function startsWithDate(line, bank) {
  if (bank.dateStartRegex) return bank.dateStartRegex.test(line)
  if (/^\d{2}\/\d{2}(?:\/\d{2,4})?\b/.test(line)) return true
  return !!(bank.monthNameDates && MONTH_NAME_START_RE.test(line))
}

// True if `line` looks like it continues the previous transaction (payee text
// or the transaction's amount that wrapped past the row) rather than starting
// a new transaction, section, or summary line.
function isContinuationLine(line, bank) {
  if (!line) return false
  const t = line.trim()
  if (!t) return false
  if (startsWithDate(t, bank)) return false
  if (bank.creditSection?.test(t) || bank.debitSection?.test(t) || bank.skipSection?.test(t)) return false
  if (/^(beginning|ending|total|balance|interest rate|service fee|new balance|minimum|average daily)/i.test(t)) return false
  return true
}

// Some statements wrap a transaction's dollar amount onto a following line —
// a long ACH/Zelle description pushes the figure off the date's row. Retry the
// parse by folding in up to 4 following lines when the primary line has a date
// but no amount was found on it. Returns { row, consumed } or null.
// Banistmo wraps the tail of a transaction's detail text onto line(s) *after* the
// amount/balance (unlike other banks, which wrap before the amount) — e.g. "NATURGY
// PAGO REG" trailing "25 Aug 2026 DB SERVICIO 35 PAGO X app -$272.91 $377.09".
// Genuine wrapped detail is always upper-case bank shorthand; footer/header text that
// can immediately follow the last row on a page ("Page 1 of 1", "Telephone Branch...")
// always has lowercase letters, so that's the signal used to stop.
const ALL_CAPS_LINE_RE = /^[A-Z0-9][A-Z0-9 .,#/-]*$/

function appendCapsContinuation(lines, i, merchant) {
  let text = merchant
  let consumed = 0
  for (let k = 1; k <= 3; k++) {
    const next = lines[i + k]?.trim()
    if (!next || !ALL_CAPS_LINE_RE.test(next)) break
    text = `${text} ${next}`
    consumed = k
  }
  return { merchant: text, consumed }
}

function parseWithAmountLookahead(lines, i, year, bank, isCredit) {
  const direct = bank.parseLine
    ? bank.parseLine(lines[i], year, isCredit)
    : parseTxnLine(lines[i], year, bank, isCredit)
  if (direct) {
    if (bank.trailingContinuation) {
      const { merchant, consumed } = appendCapsContinuation(lines, i, direct.merchant)
      direct.merchant = merchant
      return { row: direct, consumed }
    }
    return { row: direct, consumed: 0 }
  }
  if (!startsWithDate(lines[i], bank)) return null

  let merged = lines[i]
  for (let k = 1; k <= 4; k++) {
    const next = lines[i + k]
    if (!isContinuationLine(next, bank)) break
    merged = `${merged} ${next}`
    const parsed = bank.parseLine
      ? bank.parseLine(merged, year, isCredit)
      : parseTxnLine(merged, year, bank, isCredit)
    if (parsed) return { row: parsed, consumed: k }
  }
  return null
}

// Bank of America (and similar) list checks two-per-row in the Checks table:
// MM/DD CHECK# AMOUNT MM/DD CHECK# AMOUNT. A plain merchant-description line
// never matches this shape, so it's safe to try for every bank.
function parseCheckPairLine(line, year, bank) {
  const m = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(\d{3,6})\s+(-?[\d,]+\.\d{2})\s+(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(\d{3,6})\s+(-?[\d,]+\.\d{2})\s*$/)
  if (!m) return null
  const [, d1, c1, a1, d2, c2, a2] = m
  const toRow = (dateStr, checkNum, amtStr) => {
    const [mm, dd] = dateStr.split('/')
    return {
      date: `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
      merchant: `Check #${checkNum}`,
      description: null,
      amount: Math.abs(parseFloat(amtStr.replace(/,/g, ''))),
      currency: 'USD',
      amount_usd: Math.abs(parseFloat(amtStr.replace(/,/g, ''))),
      category: null,
      payment_method: bank.paymentMethod,
      source: bank.source,
      isCredit: false,
    }
  }
  return [toRow(d1, c1, a1), toRow(d2, c2, a2)]
}

// Returns the next line as a description if it looks like a payee continuation,
// not a new transaction, section header, or balance/summary line.
function followOnLine(lines, i, bank) {
  const next = lines[i + 1]?.trim()
  if (!next) return null
  if (/^\d{2}\/\d{2}/.test(next)) return null
  if (bank.creditSection?.test(next) || bank.debitSection?.test(next) || bank.skipSection?.test(next)) return null
  if (/^(beginning|ending|total|balance|interest rate|service fee|new balance|minimum|average daily)/i.test(next)) return null
  if (/^\$?[\d,]+\.\d{2}$/.test(next)) return null
  return next
}

// After section detection, let strong description keywords override the section classification.
// This handles PDFs where a credit transaction appears under the wrong section header.
function keywordOverride(description, sectionIsCredit) {
  if (!description) return sectionIsCredit
  // Strongly implies credit
  if (/\b(credit|deposit|refund|incoming|received|reimbursement)\b/i.test(description) &&
      !/\bcredit\s+card\b/i.test(description)) return true
  // Strongly implies debit
  if (/\b(withdrawal|check\s+paid|ach\s+debit)\b/i.test(description)) return false
  return sectionIsCredit
}

const MONTH_ABBR = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }

// Parse a single transaction line.
// isCredit: true/false from section context, or null to auto-classify from description keywords.
function parseTxnLine(line, year, bank, isCredit) {
  let mm, dd, yyyy, rest

  // Try numeric date: MM/DD or MM/DD/YY or MM/DD/YYYY
  const numMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)/)
  if (numMatch) {
    const parts = numMatch[1].split('/')
    mm = parts[0].padStart(2, '0')
    dd = parts[1].padStart(2, '0')
    yyyy = parts[2] ? (parts[2].length === 2 ? '20' + parts[2] : parts[2]) : String(year)
    rest = line.slice(numMatch[1].length).trim()
    // Strip a second date if present (post-date column on credit card statements)
    rest = rest.replace(/^\d{2}\/\d{2}(?:\/\d{2,4})?\s+/, '')
  } else if (bank.monthNameDates) {
    // Month-name date: "Jan 01" or "Jan 1" or "January 01"
    const monMatch = line.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i)
    if (!monMatch) return null
    const monthNum = MONTH_ABBR[monMatch[1].slice(0, 3).toLowerCase()]
    if (!monthNum) return null
    mm = String(monthNum).padStart(2, '0')
    dd = monMatch[2].padStart(2, '0')
    yyyy = monMatch[3] ?? String(year)
    rest = line.slice(monMatch[0].length).trim()
  } else {
    return null
  }

  // Find dollar amounts — Apple Card has Daily Cash first, then actual Amount last
  const allAmounts = [...rest.matchAll(/\$?\s*(-?[\d,]+\.\d{2})/g)]
  if (allAmounts.length === 0) return null

  const chosenMatch = bank.useLastAmount && allAmounts.length > 1
    ? allAmounts[allAmounts.length - 1]
    : allAmounts[0]
  const firstMatch = allAmounts[0]

  const rawAmount = parseFloat(chosenMatch[1].replace(/,/g, ''))
  const amount = Math.abs(rawAmount)
  if (!amount || amount <= 0) return null
  const negativeAmount = rawAmount < 0

  // Description is everything before the first dollar amount, minus trailing % cashback indicators
  let description = rest.slice(0, firstMatch.index).trim()
    .replace(/\s+\d+%\s*$/, '')   // strip trailing "3%" cashback percentage
    .replace(/\s*\$$/, '')        // strip a trailing bare "$" left when the match starts right at the sign
    .replace(/\s+-$/, '')         // strip a trailing "-" left when a negative amount ("-$X.XX") glues its sign on
    .trim()
  if (bank.merchantCategorySuffix) description = description.replace(bank.merchantCategorySuffix, '').trim()
  if (!description || description.length < 2) return null

  // Skip obvious summary/balance lines
  if (/^(beginning|ending|total|balance|interest paid|service fee|new balance|minimum)/i.test(description)) return null

  // A negative amount printed inside a purchases/transactions section is a merchant
  // refund, not a new charge — trust the sign over the section/keyword classification.
  // Otherwise null means auto-classify from description keywords.
  const credit = negativeAmount
    ? true
    : (isCredit === null ? keywordOverride(description, false) : !!isCredit)

  return {
    date: `${yyyy}-${mm}-${dd}`,
    merchant: description,
    description: null,
    amount,
    currency: 'USD',
    amount_usd: amount,
    category: null,
    payment_method: bank.paymentMethod,
    source: bank.source,
    isCredit: credit,
  }
}
