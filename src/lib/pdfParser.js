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
  // Check first 40 lines for bank identification
  const header = lines.slice(0, 40).join(' ')
  if (/charles schwab|schwab bank|schwab one/i.test(header)) return SCHWAB
  if (/bank of america/i.test(header)) return BOA
  if (/jpmorgan chase|chase bank|chase card|chase\.com/i.test(header)) return CHASE
  if (/discover bank|discover card|discover\.com/i.test(header)) return DISCOVER
  // Looser fallback — bank name might appear further down
  const full = lines.join(' ')
  if (/schwab/i.test(full)) return SCHWAB
  if (/bank of america/i.test(full)) return BOA
  if (/\bchase\b/i.test(full)) return CHASE
  if (/\bdiscover\b/i.test(full)) return DISCOVER
  return null
}

// ─── Bank configs ───────────────────────────────────────────────────────────

const SCHWAB = {
  name: 'Schwab',
  paymentMethod: 'Schwab Checking',
  source: 'pdf_schwab',
  // Skip credits (deposits) — only import debits
  creditSection: /^(deposits and other credits|total deposits|other credits)/i,
  debitSection: /^(withdrawals and other debits|checks paid|other debits)/i,
  skipSection: /^(daily balance|total withdrawals|total checks)/i,
}

const BOA = {
  name: 'Bank of America',
  paymentMethod: 'BOA Checking',
  source: 'pdf_boa',
  creditSection: /^(deposits and other additions|interest earned|total (credits|deposits))/i,
  debitSection: /^(withdrawals|checks|electronic withdrawals|other withdrawals|purchases)/i,
  skipSection: /^(daily ledger|total withdrawals|total purchases)/i,
}

const CHASE = {
  name: 'Chase',
  paymentMethod: 'Chase',
  source: 'pdf_chase',
  creditSection: /^(payments and other credits|account activity credits|total credits|total payments)/i,
  debitSection: /^(purchases|transactions|account activity|other charges)/i,
  skipSection: /^(total purchases|total transactions|2024|2025|2026)/i,
}

const DISCOVER = {
  name: 'Discover',
  paymentMethod: 'Discover',
  source: 'pdf_discover',
  creditSection: /^(payments and credits|total payments)/i,
  debitSection: /^(purchases|transactions|total purchases)/i,
  skipSection: /^(total purchases|total transactions)/i,
}

// ─── Core parser ─────────────────────────────────────────────────────────────

function parseStatementLines(lines, bank) {
  // Extract statement year (first 4-digit year found wins)
  let year = new Date().getFullYear()
  for (const line of lines) {
    const m = line.match(/\b(20\d{2})\b/)
    if (m) { year = parseInt(m[1]); break }
  }

  const rows = []
  let skipSection = false
  let inDebitSection = false

  for (const line of lines) {
    if (bank.skipSection?.test(line)) { skipSection = true; continue }
    if (bank.creditSection?.test(line)) { skipSection = true; inDebitSection = false; continue }
    if (bank.debitSection?.test(line)) { skipSection = false; inDebitSection = true; continue }
    if (skipSection) continue

    const parsed = parseTxnLine(line, year, bank)
    if (parsed) rows.push(parsed)
  }

  if (rows.length === 0) {
    throw new Error(`No transactions found in this ${bank.name} PDF. Make sure it's a checking or credit card statement.`)
  }

  return { rows, bankName: `${bank.name} (PDF)` }
}

// Parse a single transaction line.
// Strategy: find a date at start, then first dollar amount = txn amount, text between = description.
// Handles:
//   "05/01 AMAZON 42.99 9957.01"          (checking: txn amt + running balance)
//   "05/01 05/03 AMAZON 42.99"            (credit card: trans date + post date + desc + amt)
//   "05/01/2026 AMAZON -42.99"            (full year date, possible negative)
function parseTxnLine(line, year, bank) {
  // Must start with a date
  const dateMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)/)
  if (!dateMatch) return null

  let rest = line.slice(dateMatch[1].length).trim()

  // Strip a second date if present at start (post-date column on credit cards)
  rest = rest.replace(/^\d{2}\/\d{2}(?:\/\d{2,4})?\s+/, '')

  // Find first dollar amount — this is the transaction amount
  const amountMatch = rest.match(/(-?[\d,]+\.\d{2})/)
  if (!amountMatch) return null

  const rawAmount = parseFloat(amountMatch[1].replace(/,/g, ''))
  // Skip credits (negative on credit cards = payment/refund) and zeros
  if (rawAmount <= 0) return null

  const description = rest.slice(0, amountMatch.index).trim()
  if (!description || description.length < 2) return null

  // Skip obvious non-transactions
  if (/^(beginning|ending|total|balance|interest paid|service fee|new balance|minimum)/i.test(description)) return null

  // Normalize date
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
    amount: rawAmount,
    currency: 'USD',
    amount_usd: rawAmount,
    category: null,
    payment_method: bank.paymentMethod,
    source: bank.source,
  }
}
