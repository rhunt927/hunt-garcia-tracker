import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

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
  if (!bank) throw new Error('Unrecognized bank statement PDF. Supported: Schwab, Bank of America, Chase, Discover.')

  return parseStatementLines(allLines, bank)
}

function detectBank(lines) {
  const header = lines.slice(0, 40).join(' ')
  if (/charles schwab|schwab bank|schwab one/i.test(header)) return SCHWAB
  if (/bank of america/i.test(header)) return BOA
  if (/jpmorgan chase|chase bank|chase card|chase\.com/i.test(header)) return CHASE
  if (/discover bank|discover card|discover\.com/i.test(header)) return DISCOVER
  const full = lines.join(' ')
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

// ─── Core parser ─────────────────────────────────────────────────────────────

function parseStatementLines(lines, bank) {
  let year = new Date().getFullYear()
  for (const line of lines) {
    const m = line.match(/\b(20\d{2})\b/)
    if (m) { year = parseInt(m[1]); break }
  }

  // First pass: section-aware (tag rows as debit or credit based on section)
  const rows = parseSectionAware(lines, bank, year)

  // Fallback: if section headers didn't match, scan all lines as debits
  if (rows.length === 0) {
    for (const line of lines) {
      const parsed = parseTxnLine(line, year, bank, false)
      if (parsed) rows.push(parsed)
    }
  }

  if (rows.length === 0) {
    throw new Error(`No transactions found in this ${bank.name} PDF. Make sure it's a checking or credit card statement.`)
  }

  return { rows, bankName: `${bank.name} (PDF)` }
}

function parseSectionAware(lines, bank, year) {
  const rows = []
  let sectionType = null  // null | 'debit' | 'credit' — start null, require explicit entry

  for (const line of lines) {
    if (bank.skipSection?.test(line))   { sectionType = null;     continue }
    if (bank.creditSection?.test(line)) { sectionType = 'credit'; continue }
    if (bank.debitSection?.test(line))  { sectionType = 'debit';  continue }
    if (!sectionType) continue

    const parsed = parseTxnLine(line, year, bank, sectionType === 'credit')
    if (parsed) rows.push(parsed)
  }

  return rows
}

// Parse a single transaction line.
// For debits: first positive amount on line = txn amount (running balance after it is ignored).
// For credits: same approach; take absolute value in case some banks use negatives in credit sections.
function parseTxnLine(line, year, bank, isCredit) {
  const dateMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)/)
  if (!dateMatch) return null

  let rest = line.slice(dateMatch[1].length).trim()
  // Strip a second date if present at start (post-date column on credit card statements)
  rest = rest.replace(/^\d{2}\/\d{2}(?:\/\d{2,4})?\s+/, '')

  // Find first dollar amount
  const amountMatch = rest.match(/(-?[\d,]+\.\d{2})/)
  if (!amountMatch) return null

  const rawAmount = parseFloat(amountMatch[1].replace(/,/g, ''))
  const amount = Math.abs(rawAmount)
  if (!amount || amount <= 0) return null

  const description = rest.slice(0, amountMatch.index).trim()
  if (!description || description.length < 2) return null

  // Skip obvious summary/balance lines
  if (/^(beginning|ending|total|balance|interest paid|service fee|new balance|minimum)/i.test(description)) return null

  // Normalize date to YYYY-MM-DD
  const parts = dateMatch[1].split('/')
  const mm = parts[0].padStart(2, '0')
  const dd = parts[1].padStart(2, '0')
  const yyyy = parts[2]
    ? (parts[2].length === 2 ? '20' + parts[2] : parts[2])
    : String(year)

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
    isCredit: !!isCredit,
  }
}
