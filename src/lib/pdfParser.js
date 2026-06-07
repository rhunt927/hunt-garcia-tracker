import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker as a blob URL — avoids iOS PWA issues with external ?url workers
try {
  const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''
}

// Returns { rows, bankName } or throws
export async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allLines = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Group text items by rounded y-coordinate to reconstruct rows
    const lineMap = new Map()
    for (const item of textContent.items) {
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
  }

  const bank = detectBank(allLines)
  if (!bank) throw new Error('Unrecognized bank statement PDF. Supported: Apple Card, Schwab, Bank of America, Chase, Discover.')

  return parseStatementLines(allLines, bank)
}

function detectBank(lines) {
  const header = lines.slice(0, 40).join(' ')
  if (/apple card|goldman sachs/i.test(header)) return APPLE
  if (/charles schwab|schwab bank|schwab one/i.test(header)) return SCHWAB
  if (/bank of america/i.test(header)) return BOA
  if (/jpmorgan chase|chase bank|chase card|chase\.com/i.test(header)) return CHASE
  if (/discover bank|discover card|discover\.com/i.test(header)) return DISCOVER
  const full = lines.join(' ')
  if (/apple card/i.test(full)) return APPLE
  if (/schwab/i.test(full)) return SCHWAB
  if (/bank of america/i.test(full)) return BOA
  if (/\bchase\b/i.test(full)) return CHASE
  if (/\bdiscover\b/i.test(full)) return DISCOVER
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
  creditSection: /^(payments and credits)/i,
  debitSection: /^(purchases|transactions)/i,
  skipSection: /^(total purchases|total transactions|total payments)/i,
}

const APPLE = {
  name: 'Apple Card',
  paymentMethod: 'Apple Card',
  source: 'pdf_apple',
  creditSection: /^(payments and credits|payments)/i,
  debitSection: /^(transactions|purchases)/i,
  skipSection: /^(total|account summary|interest charges|apr)/i,
  monthNameDates: true,
}

// ─── Core parser ─────────────────────────────────────────────────────────────

function parseStatementLines(lines, bank) {
  let year = new Date().getFullYear()
  for (const line of lines) {
    const m = line.match(/\b(20\d{2})\b/)
    if (m) { year = parseInt(m[1]); break }
  }

  // Pass 1: strict section-aware (header must start the line)
  let rows = parseSectionAware(lines, bank, year)

  // After section detection, apply keyword override per row — fixes cases where
  // a deposit/credit ends up in the wrong section in a PDF (e.g. Schwab Zelle credits
  // appearing under the Withdrawals header).
  if (rows.length > 0) {
    rows = rows.map(r => ({ ...r, isCredit: keywordOverride(r.merchant, r.isCredit) }))
    return { rows, bankName: `${bank.name} (PDF)` }
  }

  // Pass 2: no section headers found — scan all lines, classify purely by keywords
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseTxnLine(lines[i], year, bank, null)
    if (parsed) {
      parsed.description = followOnLine(lines, i, bank)
      rows.push(parsed)
    }
  }

  if (rows.length === 0) {
    throw new Error(`No transactions found in this ${bank.name} PDF. Make sure it's a checking or credit card statement.`)
  }

  return { rows, bankName: `${bank.name} (PDF)` }
}

function parseSectionAware(lines, bank, year) {
  const rows = []
  let sectionType = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (bank.skipSection?.test(line))   { sectionType = null;     continue }
    if (bank.creditSection?.test(line)) { sectionType = 'credit'; continue }
    if (bank.debitSection?.test(line))  { sectionType = 'debit';  continue }
    if (!sectionType) continue

    const parsed = parseTxnLine(line, year, bank, sectionType === 'credit')
    if (parsed) {
      parsed.description = followOnLine(lines, i, bank)
      rows.push(parsed)
    }
  }

  return rows
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

  // Find first dollar amount (may be preceded by $ sign)
  const amountMatch = rest.match(/\$?\s*(-?[\d,]+\.\d{2})/)
  if (!amountMatch) return null

  const rawAmount = parseFloat(amountMatch[1].replace(/,/g, ''))
  const amount = Math.abs(rawAmount)
  if (!amount || amount <= 0) return null

  const description = rest.slice(0, amountMatch.index).trim().replace(/\s*\$$/, '').trim()
  if (!description || description.length < 2) return null

  // Skip obvious summary/balance lines
  if (/^(beginning|ending|total|balance|interest paid|service fee|new balance|minimum)/i.test(description)) return null

  // null means auto-classify from description keywords
  const credit = isCredit === null ? keywordOverride(description, false) : !!isCredit

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
